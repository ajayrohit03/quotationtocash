"use client";

import { useState } from "react";
import Link from "next/link";
import type { DocumentType, Prisma } from "@prisma/client";
import { formatDateIST } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
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
import { DOCUMENT_PAGE_SIZE } from "./document-list-constants";

const HEAD_CLASS = "bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground";

// Matches what the server component's Prisma query selects, and what
// GET /api/documents (with `include: { customer: { select: { id, name,
// company } } }`) returns — narrower fields here are fine, extras are
// just ignored.
export type DocumentRow = {
  id: string;
  number: string;
  status: string;
  total: Prisma.Decimal | string;
  issueDate: Date | string;
  validUntil: Date | string | null;
  dueDate: Date | string | null;
  createdByUserId: string | null;
  customer: { name: string };
};

export function DocumentTable({
  type,
  basePath,
  dateLabel,
  initialDocuments,
  initialHasMore,
  currentUserId,
  hasUnrestrictedMutateScope,
  query,
  status,
}: {
  type: DocumentType;
  basePath: string;
  dateLabel: string;
  initialDocuments: DocumentRow[];
  initialHasMore: boolean;
  currentUserId: string;
  hasUnrestrictedMutateScope: boolean;
  query: string;
  status: string;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loading, setLoading] = useState(false);

  async function loadMore() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type,
        skip: String(documents.length),
        take: String(DOCUMENT_PAGE_SIZE),
      });
      if (query) params.set("q", query);
      if (status) params.set("status", status);

      const response = await fetch(`/api/documents?${params}`);
      if (!response.ok) return;
      const data: { documents: DocumentRow[]; hasMore: boolean } = await response.json();
      setDocuments((prev) => [...prev, ...data.documents]);
      setHasMore(data.hasMore);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-xl border border-border shadow-xs">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={HEAD_CLASS}>Number</TableHead>
              <TableHead className={HEAD_CLASS}>Customer</TableHead>
              <TableHead className={HEAD_CLASS}>Date</TableHead>
              <TableHead className={HEAD_CLASS}>{dateLabel}</TableHead>
              <TableHead className={HEAD_CLASS}>Status</TableHead>
              <TableHead className={`${HEAD_CLASS} text-right`}>Amount</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => {
              const secondaryDate = type === "quotation" ? doc.validUntil : doc.dueDate;
              // Own documents open in the editor; a Manager viewing a
              // subordinate's document (view-scope only, not mutate-scope
              // — see docs/permission-layer-design.md §5, §6) is routed
              // to the read-only preview instead, so this link never
              // points at a route that would 404 for them.
              const isOwnDocument =
                hasUnrestrictedMutateScope || doc.createdByUserId === currentUserId;
              const href = isOwnDocument
                ? `${basePath}/${doc.id}`
                : `${basePath}/${doc.id}/preview`;
              return (
                <TableRow key={doc.id} className="cursor-pointer">
                  <TableCell className="p-0">
                    <Link href={href} className="block px-4 py-2.5 font-mono text-sm">
                      {doc.number}
                    </Link>
                  </TableCell>
                  <TableCell>{doc.customer.name}</TableCell>
                  <TableCell>{formatDateIST(doc.issueDate)}</TableCell>
                  <TableCell>{secondaryDate ? formatDateIST(secondaryDate) : "—"}</TableCell>
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

      {hasMore && (
        <Button
          variant="outline"
          onClick={loadMore}
          disabled={loading}
          className="self-center"
        >
          {loading ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
