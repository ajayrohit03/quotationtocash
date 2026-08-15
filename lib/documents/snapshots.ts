import type { Business, Customer } from "@prisma/client";

// Frozen copies stored on Document.customerSnapshot / businessSnapshot —
// never re-derive a document's rendered content from the live Customer/
// Business rows (see spec: historical documents must not change when a
// customer's address, GSTIN, etc. change later). Refreshed on every write
// while a document is still a draft (see PATCH /api/documents/:id); once
// it leaves draft status, nothing touches it again and it's truly frozen.

export type CustomerSnapshot = {
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
};

export function buildCustomerSnapshot(customer: Customer): CustomerSnapshot {
  return {
    name: customer.name,
    company: customer.company,
    email: customer.email,
    phone: customer.phone,
    address: customer.address,
    city: customer.city,
    state: customer.state,
  };
}

export type BusinessSnapshot = {
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  website: string | null;
  logoUrl: string | null;
  gstEnabled: boolean;
  gstin: string | null;
  placeOfSupply: string | null;
  registrationType: string | null;
};

export function buildBusinessSnapshot(business: Business): BusinessSnapshot {
  return {
    name: business.name,
    email: business.email,
    phone: business.phone,
    address: business.address,
    city: business.city,
    state: business.state,
    country: business.country,
    website: business.website,
    logoUrl: business.logoUrl,
    gstEnabled: business.gstEnabled,
    gstin: business.gstin,
    placeOfSupply: business.placeOfSupply,
    registrationType: business.registrationType,
  };
}
