import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { hasPermission } from "@/lib/auth/permissions";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { purchaseInvoiceScopeWhere } from "@/lib/purchase-invoices/visibility";
import { groupJobPnlByCurrency } from "@/lib/jobs/pnl";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/documents/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JobActions } from "@/components/jobs/job-actions";

const HEAD_CLASS = "bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground";

// Per type, not the 2-way (quotation vs everything-else) shortcut the
// Customer detail page's own document-history table uses — that one
// silently routes a proforma to /invoices/:id, which is wrong. Correct
// 3-way mapping here since there's no reason to repeat that gap.
const DOCUMENT_BASE_PATH: Record<"quotation" | "invoice" | "proforma", string> = {
  quotation: "quotations",
  invoice: "invoices",
  proforma: "proforma-invoices",
};

export default async function JobDetailPage({
  params,
}: PageProps<"/jobs/[id]">) {
  const context = await requireBusinessForPage();
  const { business } = context;
  const { id } = await params;

  const job = await prisma.job.findFirst({
    where: { id, businessId: business.id },
  });
  if (!job) {
    notFound();
  }

  const [documents, purchaseInvoices, canEdit] = await Promise.all([
    prisma.document.findMany({
      where: { businessId: business.id, jobId: id, ...(await documentScopeWhere("view")) },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        number: true,
        status: true,
        issueDate: true,
        total: true,
        currency: true,
        customer: { select: { id: true, name: true } },
      },
    }),
    prisma.purchaseInvoice.findMany({
      where: { businessId: business.id, jobId: id, ...(await purchaseInvoiceScopeWhere("view")) },
      orderBy: { createdAt: "desc" },
      include: { vendor: { select: { id: true, name: true } } },
    }),
    hasPermission(context, "jobs.edit"),
  ]);

  // Billed: type "invoice" only, cancelled excluded (design doc §7) —
  // quotations/proforma still appear in the table below for reference,
  // just excluded from the P&L sum.
  const billedLines = documents
    .filter((doc) => doc.type === "invoice" && doc.status !== "cancelled")
    .map((doc) => ({ total: Number(doc.total), currency: doc.currency }));
  const costLines = purchaseInvoices
    .filter((pi) => pi.status !== "cancelled")
    .map((pi) => ({ total: Number(pi.total), currency: pi.currency }));
  const pnlGroups = groupJobPnlByCurrency(billedLines, costLines);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">{job.jobRef}</h1>
            <StatusBadge status={job.status} />
          </div>
          {job.description && (
            <p className="text-sm text-muted-foreground">{job.description}</p>
          )}
        </div>
        <JobActions job={job} canEdit={canEdit} />
      </div>

      {pnlGroups.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No sales or purchase invoices linked to this job yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {pnlGroups.map((group) => (
            <div key={group.currency} className="grid grid-cols-4 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    Total billed {pnlGroups.length > 1 ? `(${group.currency})` : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent className="font-mono text-2xl">
                  {formatCurrency(group.billed, group.currency)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    Total cost {pnlGroups.length > 1 ? `(${group.currency})` : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent className="font-mono text-2xl">
                  {formatCurrency(group.cost, group.currency)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    Gross margin {pnlGroups.length > 1 ? `(${group.currency})` : ""}
                  </CardTitle>
                </CardHeader>
                <CardContent className="font-mono text-2xl">
                  {formatCurrency(group.margin, group.currency)}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-normal text-muted-foreground">
                    Margin %
                  </CardTitle>
                </CardHeader>
                <CardContent className="font-mono text-2xl">
                  {group.marginPct === null ? "—" : `${group.marginPct.toFixed(1)}%`}
                </CardContent>
              </Card>
            </div>
          ))}
          {pnlGroups.length > 1 && (
            <p className="text-xs text-muted-foreground">
              This job has invoices in more than one currency — figures are
              shown per currency, not combined into a single number.
            </p>
          )}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Sales invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {documents.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No quotations, invoices, or proforma invoices linked yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={HEAD_CLASS}>Number</TableHead>
                  <TableHead className={HEAD_CLASS}>Type</TableHead>
                  <TableHead className={HEAD_CLASS}>Customer</TableHead>
                  <TableHead className={HEAD_CLASS}>Status</TableHead>
                  <TableHead className={`${HEAD_CLASS} text-right`}>Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="p-0">
                      <Link
                        href={`/${DOCUMENT_BASE_PATH[doc.type]}/${doc.id}`}
                        className="block px-4 py-2.5 font-mono text-sm"
                      >
                        {doc.number}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">{doc.type}</TableCell>
                    <TableCell>{doc.customer.name}</TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(doc.total, doc.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchase invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {purchaseInvoices.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-muted-foreground">
              No purchase invoices linked yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={HEAD_CLASS}>Vendor</TableHead>
                  <TableHead className={HEAD_CLASS}>Invoice no.</TableHead>
                  <TableHead className={HEAD_CLASS}>Status</TableHead>
                  <TableHead className={`${HEAD_CLASS} text-right`}>Total</TableHead>
                  <TableHead className={`${HEAD_CLASS} text-right`}>Paid</TableHead>
                  <TableHead className={`${HEAD_CLASS} text-right`}>Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchaseInvoices.map((pi) => {
                  const balance = Math.max(0, Number(pi.total) - Number(pi.amountPaid));
                  return (
                    <TableRow key={pi.id}>
                      <TableCell className="p-0">
                        <Link
                          href={`/purchase-invoices/${pi.id}`}
                          className="block px-4 py-2.5 font-medium"
                        >
                          {pi.vendor.name}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {pi.vendorInvoiceNumber || "—"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={pi.status} />
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(pi.total, pi.currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(pi.amountPaid, pi.currency)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {formatCurrency(balance, pi.currency)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
