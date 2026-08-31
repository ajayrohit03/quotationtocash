import Link from "next/link";
import { FileText, Receipt } from "lucide-react";
import type { DocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { documentStatusFilterWhere } from "@/lib/documents/status";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { Button } from "@/components/ui/button";
import { TutorialBanner } from "@/components/tutorial-banner";
import { DocumentSearch } from "./document-search";
import { DocumentTable } from "./document-table";
import { DOCUMENT_PAGE_SIZE } from "./document-list-constants";

const COPY: Record<
  DocumentType,
  { title: string; newLabel: string; dateLabel: string; icon: typeof FileText }
> = {
  quotation: {
    title: "Quotations",
    newLabel: "New quotation",
    dateLabel: "Valid until",
    icon: FileText,
  },
  invoice: {
    title: "Invoices",
    newLabel: "New invoice",
    dateLabel: "Due date",
    icon: Receipt,
  },
};

const TUTORIAL_COPY: Record<DocumentType, { key: string; title: string; description: string }> = {
  quotation: {
    key: "quotations",
    title: "Quotations are for before the sale.",
    description: "Send one to a customer, then convert it to an invoice in one click once they accept.",
  },
  invoice: {
    key: "invoices",
    title: "Invoices track what's owed.",
    description: "Mark one paid as money comes in and its status updates everywhere it appears.",
  },
};

export async function DocumentListPage({
  type,
  searchParams,
}: {
  type: DocumentType;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { business, user, membership } = await requireBusinessForPage();
  // Owner/Admin have unrestricted mutate-scope too (documentScopeWhere
  // returns {} for both actions), so every document opens in the editor
  // for them — only Staff/Manager's mutate-scope is actually own-only.
  const hasUnrestrictedMutateScope =
    membership.role === "owner" || membership.role === "admin";
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const status = typeof params.status === "string" ? params.status : "";
  const copy = COPY[type];
  const basePath = type === "quotation" ? "/quotations" : "/invoices";

  // Combined via AND, not spread — see app/api/documents/route.ts's GET for
  // why: scopeWhere and the search filter can each independently produce
  // an `OR` key, and spreading both would let the second clobber the
  // first.
  const conditions: Prisma.DocumentWhereInput[] = [await documentScopeWhere("view")];
  if (q) {
    conditions.push({
      OR: [
        { number: { contains: q, mode: "insensitive" } },
        { customer: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }

  // Fetch one extra row to know whether a "Load more" page exists,
  // without a separate count query. Same shape as GET /api/documents,
  // which DocumentTable calls for subsequent pages.
  const rows = await prisma.document.findMany({
    where: {
      businessId: business.id,
      type,
      ...documentStatusFilterWhere(status),
      AND: conditions,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    include: { customer: { select: { name: true } } },
    take: DOCUMENT_PAGE_SIZE + 1,
  });
  const hasMore = rows.length > DOCUMENT_PAGE_SIZE;
  const documents = hasMore ? rows.slice(0, DOCUMENT_PAGE_SIZE) : rows;

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
        <Button nativeButton={false} render={<Link href={`${basePath}/new`} />}>
          {copy.newLabel}
        </Button>
      </div>

      <TutorialBanner
        tutorialKey={TUTORIAL_COPY[type].key}
        title={TUTORIAL_COPY[type].title}
        description={TUTORIAL_COPY[type].description}
        initiallyDismissed={user.dismissedTutorials.includes(TUTORIAL_COPY[type].key)}
      />

      <DocumentSearch basePath={basePath} defaultQuery={q} defaultStatus={status} />

      {documents.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <copy.icon className="size-5" />
          </span>
          <p className="text-sm font-medium">
            {q || status
              ? `No ${copy.title.toLowerCase()} match your filters`
              : `No ${copy.title.toLowerCase()} yet`}
          </p>
          {!q && !status && (
            <p className="mt-1 text-sm text-muted-foreground">
              {copy.newLabel} to get started.
            </p>
          )}
        </div>
      ) : (
        <DocumentTable
          type={type}
          basePath={basePath}
          dateLabel={copy.dateLabel}
          initialDocuments={documents}
          initialHasMore={hasMore}
          currentUserId={user.id}
          hasUnrestrictedMutateScope={hasUnrestrictedMutateScope}
          query={q}
          status={status}
        />
      )}
    </div>
  );
}
