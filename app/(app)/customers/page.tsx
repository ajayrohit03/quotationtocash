import Link from "next/link";
import { Users } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { getCustomersBillingSummaries } from "@/lib/documents/aggregates";
import { formatCurrency } from "@/lib/format";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { TutorialBanner } from "@/components/tutorial-banner";
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

const HEAD_CLASS = "bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground";

export default async function CustomersPage({
  searchParams,
}: PageProps<"/customers">) {
  const { business, user } = await requireBusinessForPage();
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

      <TutorialBanner
        tutorialKey="customers"
        title="Your customer list."
        description="Saved details prefill new quotations and invoices — documents you've already sent keep whatever details they were created with."
        initiallyDismissed={user.dismissedTutorials.includes("customers")}
      />

      <CustomerSearch defaultValue={search} />

      {customers.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Users className="size-5" />
          </span>
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
        <div className="overflow-hidden rounded-xl border border-border shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={HEAD_CLASS}>Name</TableHead>
                <TableHead className={HEAD_CLASS}>Company</TableHead>
                <TableHead className={HEAD_CLASS}>Email</TableHead>
                <TableHead className={HEAD_CLASS}>Phone</TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>
                  Total invoiced
                </TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>
                  Outstanding
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => {
                const summary = summaries.get(customer.id);
                const outstanding = summary?.outstanding ?? 0;
                const hasOutstanding = Number(outstanding) > 0;
                return (
                  <TableRow key={customer.id} className="cursor-pointer">
                    <TableCell className="p-0">
                      <Link
                        href={`/customers/${customer.id}`}
                        className="flex items-center gap-2.5 px-4 py-2.5 font-medium"
                      >
                        <InitialsAvatar name={customer.name} size="sm" />
                        {customer.name}
                      </Link>
                    </TableCell>
                    <TableCell>{customer.company || "—"}</TableCell>
                    <TableCell>{customer.email || "—"}</TableCell>
                    <TableCell>{customer.phone || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(summary?.totalInvoiced ?? 0)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono text-sm font-medium ${hasOutstanding ? "text-[#B45309]" : "text-muted-foreground"}`}
                    >
                      {formatCurrency(outstanding)}
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
