import Link from "next/link";
import { FileText, Receipt } from "lucide-react";
import type { DocumentType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { formatDateIST } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { StatusBadge } from "@/components/documents/status-badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DocumentSearch } from "./document-search";

const HEAD_CLASS = "bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground";

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

  const documents = await prisma.document.findMany({
    where: {
      businessId: business.id,
      type,
      ...(status ? { status } : {}),
      AND: conditions,
    },
    orderBy: { createdAt: "desc" },
    include: { customer: { select: { name: true } } },
  });

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
        <Button nativeButton={false} render={<Link href={`${basePath}/new`} />}>
          {copy.newLabel}
        </Button>
      </div>

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
        <div className="overflow-hidden rounded-xl border border-border shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={HEAD_CLASS}>Number</TableHead>
                <TableHead className={HEAD_CLASS}>Customer</TableHead>
                <TableHead className={HEAD_CLASS}>Date</TableHead>
                <TableHead className={HEAD_CLASS}>{copy.dateLabel}</TableHead>
                <TableHead className={HEAD_CLASS}>Status</TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>
                  Amount
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => {
                const secondaryDate =
                  type === "quotation" ? doc.validUntil : doc.dueDate;
                // Own documents open in the editor; a Manager viewing a
                // subordinate's document (view-scope only, not
                // mutate-scope — see docs/permission-layer-design.md §5,
                // §6) is routed to the read-only preview instead, so this
                // link never points at a route that would 404 for them.
                const isOwnDocument =
                  hasUnrestrictedMutateScope || doc.createdByUserId === user.id;
                const href = isOwnDocument
                  ? `${basePath}/${doc.id}`
                  : `${basePath}/${doc.id}/preview`;
                return (
                  <TableRow key={doc.id} className="cursor-pointer">
                    <TableCell className="p-0">
                      <Link
                        href={href}
                        className="block px-4 py-2.5 font-mono text-sm"
                      >
                        {doc.number}
                      </Link>
                    </TableCell>
                    <TableCell>{doc.customer.name}</TableCell>
                    <TableCell>{formatDateIST(doc.issueDate)}</TableCell>
                    <TableCell>
                      {secondaryDate ? formatDateIST(secondaryDate) : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(doc.total)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
