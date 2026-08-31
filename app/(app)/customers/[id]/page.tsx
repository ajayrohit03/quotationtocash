import Link from "next/link";
import { notFound } from "next/navigation";
import { Wallet, Clock3, Files, Inbox } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { formatDateIST } from "@/lib/dates";
import { getCustomerBillingSummary } from "@/lib/documents/aggregates";
import { isOverdue, remainingBalance } from "@/lib/documents/status";
import { documentScopeWhere } from "@/lib/documents/visibility";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/documents/status-badge";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EditCustomerDialog } from "./edit-customer-dialog";

const HEAD_CLASS = "bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground";

export default async function CustomerDetailPage({
  params,
}: PageProps<"/customers/[id]">) {
  const { business } = await requireBusinessForPage();
  const { id } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id, businessId: business.id },
  });
  if (!customer) {
    notFound();
  }

  const [documents, summary] = await Promise.all([
    prisma.document.findMany({
      where: {
        businessId: business.id,
        customerId: id,
        ...(await documentScopeWhere("view")),
      },
      orderBy: { createdAt: "desc" },
    }),
    getCustomerBillingSummary(business.id, id),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <InitialsAvatar name={customer.name} size="lg" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {customer.name}
            </h1>
            {customer.company && (
              <p className="text-sm text-muted-foreground">{customer.company}</p>
            )}
          </div>
        </div>
        <div className="flex flex-none gap-2">
          <EditCustomerDialog customer={customer} />
          <Button
            nativeButton={false}
            render={<Link href={`/quotations/new?customerId=${customer.id}`} />}
          >
            New quotation
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Total billed
            </CardTitle>
            <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wallet className="size-4" />
            </span>
          </CardHeader>
          <CardContent className="font-mono text-2xl">
            {formatCurrency(summary.totalInvoiced)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Outstanding
            </CardTitle>
            <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-[#FFFAEB] text-[#B45309]">
              <Clock3 className="size-4" />
            </span>
          </CardHeader>
          <CardContent className="font-mono text-2xl">
            {formatCurrency(summary.outstanding)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Documents
            </CardTitle>
            <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Files className="size-4" />
            </span>
          </CardHeader>
          <CardContent className="font-mono text-2xl">
            {documents.length}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Email</p>
            <p>{customer.email || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Phone</p>
            <p>{customer.phone || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Address</p>
            <p>{customer.address || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">City / State</p>
            <p>
              {[customer.city, customer.state].filter(Boolean).join(", ") ||
                "—"}
            </p>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-sm font-semibold">Document history</h2>
        {documents.length === 0 ? (
          <div className="flex flex-col items-center rounded-xl border border-dashed border-border py-12 text-center">
            <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
              <Inbox className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">
              No quotations or invoices yet.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border shadow-xs">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={HEAD_CLASS}>Number</TableHead>
                  <TableHead className={HEAD_CLASS}>Type</TableHead>
                  <TableHead className={HEAD_CLASS}>Date</TableHead>
                  <TableHead className={HEAD_CLASS}>Status</TableHead>
                  <TableHead className={`${HEAD_CLASS} text-right`}>
                    Amount
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id} className="cursor-pointer">
                    <TableCell className="p-0">
                      <Link
                        href={`/${doc.type === "quotation" ? "quotations" : "invoices"}/${doc.id}`}
                        className="block px-4 py-2.5 font-mono text-sm"
                      >
                        {doc.number}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">{doc.type}</TableCell>
                    <TableCell>
                      {formatDateIST(doc.issueDate)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        status={
                          isOverdue(
                            doc.status,
                            doc.dueDate,
                            remainingBalance(Number(doc.total), Number(doc.amountPaid)),
                          )
                            ? "overdue"
                            : doc.status
                        }
                      />
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
    </div>
  );
}
