import { Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Truck } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { VendorSearch } from "./vendor-search";

// Dynamically imported — same rationale as AddCustomerDialog on the
// customers list page (see that file's own comment): a modal only ever
// opened from its own trigger, no reason to ship its zod/react-hook-form
// weight in this page's main chunk.
const AddVendorDialog = dynamic(() =>
  import("./add-vendor-dialog").then((m) => m.AddVendorDialog),
);

const HEAD_CLASS = "bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground";

export default function VendorsPage({
  searchParams,
}: PageProps<"/vendors">) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Vendors</h1>
        <AddVendorDialog />
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <VendorsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function VendorsContent({
  searchParams,
}: {
  searchParams: PageProps<"/vendors">["searchParams"];
}) {
  const { business } = await requireBusinessForPage();
  const { q } = await searchParams;
  const search = typeof q === "string" ? q.trim() : "";

  const vendors = await prisma.vendor.findMany({
    where: {
      businessId: business.id,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
              { gstin: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <>
      <VendorSearch defaultValue={search} />

      {vendors.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Truck className="size-5" />
          </span>
          <p className="text-sm font-medium">
            {search ? "No vendors match your search" : "No vendors yet"}
          </p>
          {!search && (
            <p className="mt-1 text-sm text-muted-foreground">
              Add your first vendor to start recording purchase invoices.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={HEAD_CLASS}>Name</TableHead>
                <TableHead className={HEAD_CLASS}>Email</TableHead>
                <TableHead className={HEAD_CLASS}>Phone</TableHead>
                <TableHead className={HEAD_CLASS}>GSTIN</TableHead>
                <TableHead className={HEAD_CLASS}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendors.map((vendor) => (
                <TableRow key={vendor.id} className="cursor-pointer">
                  <TableCell className="p-0">
                    <Link
                      href={`/vendors/${vendor.id}`}
                      className="flex items-center gap-2.5 px-4 py-2.5 font-medium"
                    >
                      <InitialsAvatar name={vendor.name} size="sm" />
                      {vendor.name}
                    </Link>
                  </TableCell>
                  <TableCell>{vendor.email || "—"}</TableCell>
                  <TableCell>{vendor.phone || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {vendor.gstin || "—"}
                  </TableCell>
                  <TableCell>
                    {vendor.isActive ? (
                      <span className="text-sm text-muted-foreground">Active</span>
                    ) : (
                      <span className="text-sm text-muted-foreground/60">
                        Inactive
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
