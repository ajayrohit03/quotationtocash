import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { VendorActions } from "./vendor-actions";

// Dynamically imported — same rationale as EditCustomerDialog on the
// customer detail page (see that file's own comment).
const EditVendorDialog = dynamic(() =>
  import("./edit-vendor-dialog").then((m) => m.EditVendorDialog),
);

export default async function VendorDetailPage({
  params,
}: PageProps<"/vendors/[id]">) {
  const { business } = await requireBusinessForPage();
  const { id } = await params;

  const vendor = await prisma.vendor.findFirst({
    where: { id, businessId: business.id },
  });
  if (!vendor) {
    notFound();
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <InitialsAvatar name={vendor.name} size="lg" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {vendor.name}
            </h1>
            {!vendor.isActive && (
              <p className="text-sm text-muted-foreground">Inactive</p>
            )}
          </div>
        </div>
        <div className="flex flex-none gap-2">
          <EditVendorDialog vendor={vendor} />
          <VendorActions vendor={vendor} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Email</p>
            <p>{vendor.email || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Phone</p>
            <p>{vendor.phone || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Address</p>
            <p>{vendor.address || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">City / State</p>
            <p>
              {[vendor.city, vendor.state].filter(Boolean).join(", ") || "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">GSTIN</p>
            <p className="font-mono">{vendor.gstin || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">PAN</p>
            <p className="font-mono">{vendor.pan || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">CIN</p>
            <p className="font-mono">{vendor.cin || "—"}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Bank name</p>
            <p>{vendor.bankName || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Account holder</p>
            <p>{vendor.accountHolderName || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Account number</p>
            <p className="font-mono">{vendor.accountNumber || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">IFSC / RTGS-NEFT code</p>
            <p className="font-mono">{vendor.ifscCode || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">UPI ID</p>
            <p>{vendor.upiId || "—"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Swift code</p>
            <p className="font-mono">{vendor.swiftCode || "—"}</p>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Purchase invoices for this vendor will appear here once Accounts
        Payable Stage b ships.
      </div>
    </div>
  );
}
