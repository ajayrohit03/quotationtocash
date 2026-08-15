import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { getCustomerBillingSummary } from "@/lib/documents/aggregates";
import { formatCurrency } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
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
      where: { businessId: business.id, customerId: id },
      orderBy: { createdAt: "desc" },
    }),
    getCustomerBillingSummary(business.id, id),
  ]);

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {customer.name}
          </h1>
          {customer.company && (
            <p className="text-sm text-muted-foreground">{customer.company}</p>
          )}
        </div>
        <Button
          nativeButton={false}
          render={<Link href={`/quotations/new?customerId=${customer.id}`} />}
        >
          New quotation
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Total billed
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl">
            {formatCurrency(summary.totalInvoiced)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Outstanding
            </CardTitle>
          </CardHeader>
          <CardContent className="font-mono text-2xl">
            {formatCurrency(summary.outstanding)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-normal text-muted-foreground">
              Documents
            </CardTitle>
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
        <h2 className="mb-3 text-sm font-medium">Document history</h2>
        {documents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            No quotations or invoices yet.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-mono text-sm">
                      {doc.number}
                    </TableCell>
                    <TableCell className="capitalize">{doc.type}</TableCell>
                    <TableCell>
                      {doc.issueDate.toLocaleDateString("en-IN")}
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
    </div>
  );
}
