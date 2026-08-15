import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { getCustomersBillingSummaries } from "@/lib/documents/aggregates";
import { formatCurrency } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AddCustomerDialog } from "./add-customer-dialog";
import { CustomerSearch } from "./customer-search";

export default async function CustomersPage({
  searchParams,
}: PageProps<"/customers">) {
  const { business } = await requireBusinessForPage();
  const { q } = await searchParams;
  const search = typeof q === "string" ? q.trim() : "";

  const customers = await prisma.customer.findMany({
    where: {
      businessId: business.id,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { company: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  const summaries = await getCustomersBillingSummaries(
    business.id,
    customers.map((c) => c.id),
  );

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Customers</h1>
        <AddCustomerDialog />
      </div>

      <CustomerSearch defaultValue={search} />

      {customers.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium">
            {search ? "No customers match your search" : "No customers yet"}
          </p>
          {!search && (
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first customer to start creating quotations and
              invoices.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="text-right">Total invoiced</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => {
                const summary = summaries.get(customer.id);
                return (
                  <TableRow key={customer.id} className="cursor-pointer">
                    <TableCell className="p-0">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="block px-4 py-2.5 font-medium"
                      >
                        {customer.name}
                      </Link>
                    </TableCell>
                    <TableCell>{customer.company || "—"}</TableCell>
                    <TableCell>{customer.email || "—"}</TableCell>
                    <TableCell>{customer.phone || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(summary?.totalInvoiced ?? 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(summary?.outstanding ?? 0)}
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
