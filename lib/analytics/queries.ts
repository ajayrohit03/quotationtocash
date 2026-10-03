import "server-only";

import { prisma } from "@/lib/db/prisma";
import { PLANS, type Plan } from "@/lib/plans/catalog";
import { ACTIVE_WINDOW_DAYS, bucketByMonth, monthsWindowStart, windowStart, type MonthBucket } from "./months";

export type Analytics = {
  totalBusinesses: number;
  activeBusinesses: number;
  totalInvoices: number;
  totalDocuments: number;
  planDistribution: { plan: Plan; count: number }[];
  signupsByMonth: MonthBucket[];
  adoption: { ap: number; jobs: number; customFields: number; multiCurrency: number };
  topBusinesses: { id: string; name: string; plan: Plan; documents: number }[];
  recentSignups: { id: string; name: string; plan: Plan; createdAt: Date }[];
};

// Definitions: docs/analytics-dashboard-design.md §3. Every query is
// scoped to non-internal businesses (Business.isInternal = false).
// `now` and `businessIds` exist so tests can pin the clock and confine
// the aggregates to their own rows in the shared database; the page
// passes neither.
export async function getAnalytics(
  opts: { now?: Date; businessIds?: string[] } = {},
): Promise<Analytics> {
  const now = opts.now ?? new Date();
  const since = windowStart(now, ACTIVE_WINDOW_DAYS);
  const biz = {
    isInternal: false,
    ...(opts.businessIds && { id: { in: opts.businessIds } }),
  };
  const inBiz = { business: biz };

  const [
    totalBusinesses,
    planGroups,
    signupRows,
    recent,
    totalDocuments,
    totalInvoices,
    activeDocs,
    activePurchases,
    apAdopters,
    jobAdopters,
    customFieldAdopters,
    multiCurrencyAdopters,
    windowDocs,
  ] = await Promise.all([
    prisma.business.count({ where: biz }),
    prisma.business.groupBy({ by: ["plan"], where: biz, _count: { _all: true } }),
    prisma.business.findMany({
      where: { ...biz, createdAt: { gte: monthsWindowStart(now, 6) } },
      select: { createdAt: true },
    }),
    prisma.business.findMany({
      where: biz,
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, name: true, plan: true, createdAt: true },
    }),
    prisma.document.count({ where: inBiz }),
    prisma.document.count({ where: { ...inBiz, type: "invoice" } }),
    prisma.document.groupBy({ by: ["businessId"], where: { ...inBiz, updatedAt: { gte: since } } }),
    prisma.purchaseInvoice.groupBy({ by: ["businessId"], where: { ...inBiz, updatedAt: { gte: since } } }),
    prisma.purchaseInvoice.groupBy({ by: ["businessId"], where: inBiz }),
    prisma.job.groupBy({ by: ["businessId"], where: inBiz }),
    prisma.customFieldDefinition.groupBy({ by: ["businessId"], where: { ...inBiz, isActive: true } }),
    prisma.document.groupBy({
      by: ["businessId"],
      where: { ...inBiz, type: "invoice", currency: { not: "INR" } },
    }),
    prisma.document.groupBy({
      by: ["businessId"],
      where: { ...inBiz, createdAt: { gte: since } },
      _count: { _all: true },
    }),
  ]);

  const active = new Set([...activeDocs, ...activePurchases].map((g) => g.businessId));

  const planCounts = new Map(planGroups.map((g) => [g.plan, g._count._all]));

  const topIds = [...windowDocs]
    .sort((a, b) => b._count._all - a._count._all)
    .map((g) => g.businessId);
  const names = topIds.length
    ? await prisma.business.findMany({
        where: { id: { in: topIds } },
        select: { id: true, name: true, plan: true },
      })
    : [];
  const byId = new Map(names.map((b) => [b.id, b]));
  const topBusinesses = windowDocs
    .map((g) => ({ ...byId.get(g.businessId)!, documents: g._count._all }))
    .sort((a, b) => b.documents - a.documents || a.name.localeCompare(b.name))
    .slice(0, 5);

  return {
    totalBusinesses,
    activeBusinesses: active.size,
    totalInvoices,
    totalDocuments,
    planDistribution: PLANS.map((plan) => ({ plan, count: planCounts.get(plan) ?? 0 })),
    signupsByMonth: bucketByMonth(signupRows.map((r) => r.createdAt), now, 6),
    adoption: {
      ap: apAdopters.length,
      jobs: jobAdopters.length,
      customFields: customFieldAdopters.length,
      multiCurrency: multiCurrencyAdopters.length,
    },
    topBusinesses,
    recentSignups: recent,
  };
}
