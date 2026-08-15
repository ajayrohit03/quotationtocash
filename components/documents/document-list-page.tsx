import Link from "next/link";
import type { DocumentType } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { formatCurrency } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
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

const COPY: Record<
  DocumentType,
  { title: string; newLabel: string; dateLabel: string }
> = {
  quotation: { title: "Quotations", newLabel: "New quotation", dateLabel: "Valid until" },
  invoice: { title: "Invoices", newLabel: "New invoice", dateLabel: "Due date" },
};

export async function DocumentListPage({
  type,
  searchParams,
}: {
  type: DocumentType;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { business } = await requireBusinessForPage();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim() : "";
  const status = typeof params.status === "string" ? params.status : "";
  const copy = COPY[type];
  const basePath = type === "quotation" ? "/quotations" : "/invoices";

  const documents = await prisma.document.findMany({
    where: {
      businessId: business.id,
      type,
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { number: { contains: q, mode: "insensitive" } },
              { customer: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
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
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">
            {q || status
              ? `No ${copy.title.toLowerCase()} match your filters`
              : `No ${copy.title.toLowerCase()} yet`}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>{copy.dateLabel}</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.map((doc) => (
                <TableRow key={doc.id} className="cursor-pointer">
                  <TableCell className="p-0">
                    <Link
                      href={`${basePath}/${doc.id}`}
                      className="block px-4 py-2.5 font-mono text-sm"
                    >
                      {doc.number}
                    </Link>
                  </TableCell>
                  <TableCell>{doc.customer.name}</TableCell>
                  <TableCell>{doc.issueDate.toLocaleDateString("en-IN")}</TableCell>
                  <TableCell>
                    {(type === "quotation" ? doc.validUntil : doc.dueDate)?.toLocaleDateString(
                      "en-IN",
                    ) ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {doc.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(doc.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
