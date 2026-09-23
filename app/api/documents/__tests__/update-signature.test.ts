import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { DocumentType } from "@prisma/client";

// PATCH/POST /api/documents/[id]/update-signature — the one narrow
// exception to the frozen-snapshot rule. Real DB, only the Clerk/Next
// request-context seam mocked, same pattern as the rest of this test
// suite (see finalize.test.ts).
vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ get: () => undefined }),
}));

const createdBusinessIds: string[] = [];
const createdUserIds: string[] = [];

afterEach(async () => {
  if (createdBusinessIds.length > 0) {
    await prisma.business.deleteMany({ where: { id: { in: createdBusinessIds } } });
    createdBusinessIds.length = 0;
  }
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  }
  vi.resetModules();
});

async function createUser(name = "Update Signature Test User") {
  const user = await prisma.user.create({
    data: {
      email: `update-signature-test-${randomUUID()}@example.invalid`,
      authProviderId: `user_update_signature_test_${randomUUID()}`,
      name,
    },
  });
  createdUserIds.push(user.id);
  return user;
}

async function mockedAuthAs(clerkUserId: string) {
  const { auth } = await import("@clerk/nextjs/server");
  vi.mocked(auth).mockResolvedValue({ userId: clerkUserId } as never);
}

// A realistic frozen snapshot, so we can prove only the three signature
// keys move and everything else — name, address, GSTIN, bank details —
// comes back byte-for-byte identical.
const FROZEN_SNAPSHOT = {
  name: "Ajar Consultancy",
  email: "hello@ajar.example",
  phone: "+91 98765 43210",
  address: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  country: "India",
  website: null,
  logoUrl: null,
  gstEnabled: true,
  gstin: "29AABCU9603R1ZX",
  placeOfSupply: "Karnataka",
  registrationType: "Regular",
  bankName: "Test Bank",
  accountHolderName: "Ajar Consultancy",
  accountNumber: "1234567890",
  ifscCode: "TEST0001234",
  upiId: "ajar@upi",
  pan: "ABCDE1234F",
  tan: null,
  cin: null,
  swiftCode: null,
  signatureImageUrl: "https://example.invalid/original-signature.png",
  signatureSignatoryName: "Original Signatory",
  signatureDesignation: "Original Designation",
};

async function setupOrg() {
  const business = await prisma.business.create({
    data: {
      name: `Update Signature Test Co ${randomUUID()}`,
      slug: `update-signature-test-${randomUUID()}`,
      email: `update-signature-test-biz-${randomUUID()}@example.invalid`,
    },
  });
  createdBusinessIds.push(business.id);

  const customer = await prisma.customer.create({
    data: { businessId: business.id, name: "Test Customer" },
  });

  const owner = await createUser("Owner User");
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: owner.id, role: "owner" },
  });

  const staff = await createUser("Staff User");
  await prisma.businessMember.create({
    data: { businessId: business.id, userId: staff.id, role: "staff" },
  });

  async function makeDocument(
    type: DocumentType,
    status: string,
    createdByUserId: string = owner.id,
  ) {
    return prisma.document.create({
      data: {
        businessId: business.id,
        type,
        number: `SIG-${randomUUID().slice(0, 8)}`,
        customerId: customer.id,
        issueDate: new Date(),
        createdByUserId,
        status,
        customerSnapshot: {},
        businessSnapshot: FROZEN_SNAPSHOT,
      },
    });
  }

  return { business, customer, owner, staff, makeDocument };
}

async function patchSignature(id: string, body: unknown) {
  const { PATCH } = await import(
    "@/app/api/documents/[id]/update-signature/route"
  );
  return PATCH(
    new NextRequest(`http://localhost/api/documents/${id}/update-signature`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function postSignature(id: string, formData: FormData) {
  const { POST } = await import(
    "@/app/api/documents/[id]/update-signature/route"
  );
  return POST(
    new NextRequest(`http://localhost/api/documents/${id}/update-signature`, {
      method: "POST",
      body: formData,
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("PATCH /api/documents/[id]/update-signature", () => {
  it("rejects a draft document with a clear, specific error", async () => {
    const { owner, makeDocument } = await setupOrg();
    const invoice = await makeDocument("invoice", "draft");
    await mockedAuthAs(owner.authProviderId);

    const response = await patchSignature(invoice.id, {
      signatureSignatoryName: "New Signatory",
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    const body = await response.json();
    expect(body.error).toBe(
      "Draft documents update automatically — edit from the builder",
    );
  });

  it("updates the signature fields on a sent invoice, leaving every other snapshot field untouched", async () => {
    const { owner, makeDocument } = await setupOrg();
    const invoice = await makeDocument("invoice", "sent");
    await mockedAuthAs(owner.authProviderId);

    const response = await patchSignature(invoice.id, {
      signatureImageUrl: "https://example.invalid/new-signature.png",
      signatureSignatoryName: "New Signatory",
      signatureDesignation: "New Designation",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    const snapshot = body.document.businessSnapshot;

    expect(snapshot.signatureImageUrl).toBe(
      "https://example.invalid/new-signature.png",
    );
    expect(snapshot.signatureSignatoryName).toBe("New Signatory");
    expect(snapshot.signatureDesignation).toBe("New Designation");

    // Everything else in the frozen snapshot is byte-for-byte unchanged.
    expect(snapshot.name).toBe(FROZEN_SNAPSHOT.name);
    expect(snapshot.address).toBe(FROZEN_SNAPSHOT.address);
    expect(snapshot.gstin).toBe(FROZEN_SNAPSHOT.gstin);
    expect(snapshot.bankName).toBe(FROZEN_SNAPSHOT.bankName);
    expect(snapshot.accountNumber).toBe(FROZEN_SNAPSHOT.accountNumber);
    expect(snapshot.pan).toBe(FROZEN_SNAPSHOT.pan);

    // The live Business row is completely untouched — this document's
    // snapshot has now diverged from it, same as any other frozen field.
    const liveBusiness = await prisma.business.findUniqueOrThrow({
      where: { id: invoice.businessId },
    });
    expect(liveBusiness.signatureSignatoryName).toBeNull();
  });

  it("also works on a finalized invoice", async () => {
    const { owner, makeDocument } = await setupOrg();
    const invoice = await makeDocument("invoice", "finalized");
    await mockedAuthAs(owner.authProviderId);

    const response = await patchSignature(invoice.id, {
      signatureSignatoryName: "Finalized Doc Signatory",
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.document.businessSnapshot.signatureSignatoryName).toBe(
      "Finalized Doc Signatory",
    );
  });

  it("also works on a finalized proforma", async () => {
    const { owner, makeDocument } = await setupOrg();
    const proforma = await makeDocument("proforma", "finalized");
    await mockedAuthAs(owner.authProviderId);

    const response = await patchSignature(proforma.id, {
      signatureSignatoryName: "Proforma Signatory",
    });
    expect(response.status).toBe(200);
  });

  it("clears a field when explicitly sent as null, leaves the others alone", async () => {
    const { owner, makeDocument } = await setupOrg();
    const invoice = await makeDocument("invoice", "sent");
    await mockedAuthAs(owner.authProviderId);

    const response = await patchSignature(invoice.id, {
      signatureDesignation: null,
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.document.businessSnapshot.signatureDesignation).toBeNull();
    // Untouched — omitted from the request entirely.
    expect(body.document.businessSnapshot.signatureSignatoryName).toBe(
      FROZEN_SNAPSHOT.signatureSignatoryName,
    );
    expect(body.document.businessSnapshot.signatureImageUrl).toBe(
      FROZEN_SNAPSHOT.signatureImageUrl,
    );
  });

  it("staff can update their own sent document — same invoices.edit permission tier", async () => {
    const { staff, makeDocument } = await setupOrg();
    // "mutate" scope for a non-owner/admin is own-documents-only — see
    // lib/documents/visibility.ts, same reasoning as finalize.test.ts.
    const invoice = await makeDocument("invoice", "sent", staff.id);
    await mockedAuthAs(staff.authProviderId);

    const response = await patchSignature(invoice.id, {
      signatureSignatoryName: "Staff-set Signatory",
    });
    expect(response.status).toBe(200);
  });

  it("404s for a document outside the caller's mutate scope", async () => {
    const { owner, makeDocument } = await setupOrg();
    const invoice = await makeDocument("invoice", "sent", owner.id);
    const otherStaff = await createUser("Other Staff");
    await prisma.businessMember.create({
      data: {
        businessId: invoice.businessId,
        userId: otherStaff.id,
        role: "staff",
      },
    });
    await mockedAuthAs(otherStaff.authProviderId);

    const response = await patchSignature(invoice.id, {
      signatureSignatoryName: "Should not apply",
    });
    expect(response.status).toBe(404);
  });
});

describe("POST /api/documents/[id]/update-signature", () => {
  it("400s when no file is provided", async () => {
    const { owner, makeDocument } = await setupOrg();
    const invoice = await makeDocument("invoice", "sent");
    await mockedAuthAs(owner.authProviderId);

    const response = await postSignature(invoice.id, new FormData());
    expect(response.status).toBe(400);
  });

  it("rejects a draft document with the same specific error as PATCH", async () => {
    const { owner, makeDocument } = await setupOrg();
    const invoice = await makeDocument("invoice", "draft");
    await mockedAuthAs(owner.authProviderId);

    const response = await postSignature(invoice.id, new FormData());
    const body = await response.json();
    expect(body.error).toBe(
      "Draft documents update automatically — edit from the builder",
    );
  });
});
