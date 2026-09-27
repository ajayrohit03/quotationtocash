import type { Vendor } from "@prisma/client";

// Frozen copy stored on PurchaseInvoice.vendorSnapshot — the AP
// counterpart to lib/documents/snapshots.ts's CustomerSnapshot/
// buildCustomerSnapshot. Same non-negotiable rule: a vendor's GSTIN
// correction or bank-detail change next month must never rewrite an
// invoice already recorded and possibly already paid against — see
// docs/accounts-payable-phase1-design.md §1.2.
export type VendorSnapshot = {
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  bankName: string | null;
  accountHolderName: string | null;
  accountNumber: string | null;
  ifscCode: string | null;
  upiId: string | null;
  swiftCode: string | null;
};

export function buildVendorSnapshot(vendor: Vendor): VendorSnapshot {
  return {
    name: vendor.name,
    email: vendor.email,
    phone: vendor.phone,
    address: vendor.address,
    city: vendor.city,
    state: vendor.state,
    gstin: vendor.gstin,
    pan: vendor.pan,
    cin: vendor.cin,
    bankName: vendor.bankName,
    accountHolderName: vendor.accountHolderName,
    accountNumber: vendor.accountNumber,
    ifscCode: vendor.ifscCode,
    upiId: vendor.upiId,
    swiftCode: vendor.swiftCode,
  };
}
