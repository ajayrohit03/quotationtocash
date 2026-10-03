import "server-only";

import { prisma } from "@/lib/db/prisma";

export type BusinessStats = {
  invoices: number;
  quotations: number;
  proformas: number;
  purchaseInvoices: number;
  vendors: number;
  members: number;
  // Latest edit to any document or purchase invoice — the app tracks no
  // per-user login time, so this is the closest real signal.
  lastActiveAt: Date | null;
};

const EMPTY: BusinessStats = {
  invoices: 0, quotations: 0, proformas: 0, purchaseInvoices: 0, vendors: 0, members: 0, lastActiveAt: null,
};

function later(a: Date | null, b: Date | null | undefined): Date | null {
  if (!b) return a;
  return !a || b > a ? b : a;
}

async function statsByBusiness(businessIds?: string[]): Promise<Map<string, BusinessStats>> {
  const scope = businessIds ? { businessId: { in: businessIds } } : {};
  const [docs, purchases, vendors, members] = await Promise.all([
    prisma.document.groupBy({
      by: ["businessId", "type"],
      where: scope,
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.purchaseInvoice.groupBy({
      by: ["businessId"],
      where: scope,
      _count: { _all: true },
      _max: { updatedAt: true },
    }),
    prisma.vendor.groupBy({ by: ["businessId"], where: scope, _count: { _all: true } }),
    prisma.businessMember.groupBy({
      by: ["businessId"],
      where: { ...scope, isActive: true },
      _count: { _all: true },
    }),
  ]);

  const map = new Map<string, BusinessStats>();
  const get = (id: string) => {
    let s = map.get(id);
    if (!s) map.set(id, (s = { ...EMPTY }));
    return s;
  };
  for (const d of docs) {
    const s = get(d.businessId);
    if (d.type === "invoice") s.invoices = d._count._all;
    else if (d.type === "quotation") s.quotations = d._count._all;
    else s.proformas = d._count._all;
    s.lastActiveAt = later(s.lastActiveAt, d._max.updatedAt);
  }
  for (const p of purchases) {
    const s = get(p.businessId);
    s.purchaseInvoices = p._count._all;
    s.lastActiveAt = later(s.lastActiveAt, p._max.updatedAt);
  }
  for (const v of vendors) get(v.businessId).vendors = v._count._all;
  for (const m of members) get(m.businessId).members = m._count._all;
  return map;
}

export async function listBusinessesWithStats(query?: string) {
  const q = query?.trim();
  const businesses = await prisma.business.findMany({
    where: q ? { name: { contains: q, mode: "insensitive" } } : {},
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, email: true, plan: true, isInternal: true, createdAt: true },
  });
  const stats = await statsByBusiness(businesses.map((b) => b.id));
  return businesses.map((b) => ({ ...b, stats: stats.get(b.id) ?? { ...EMPTY } }));
}

export async function getBusinessDetail(id: string) {
  const business = await prisma.business.findUnique({
    where: { id },
    select: {
      id: true, name: true, email: true, plan: true, planOverrides: true, planNote: true,
      planUpdatedAt: true, isInternal: true, createdAt: true,
    },
  });
  if (!business) return null;
  const stats = (await statsByBusiness([id])).get(id) ?? { ...EMPTY };
  return { ...business, stats };
}
