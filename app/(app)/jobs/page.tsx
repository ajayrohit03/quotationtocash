import { Suspense } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Briefcase } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireBusinessForPage } from "@/lib/auth/page";
import { getJobsPnlSummaries } from "@/lib/jobs/aggregates";
import { formatCurrency } from "@/lib/format";
import { StatusBadge } from "@/components/documents/status-badge";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { JobSearch } from "./job-search";

// Dynamically imported — same rationale as AddVendorDialog on the
// vendors list page.
const AddJobDialog = dynamic(() =>
  import("./add-job-dialog").then((m) => m.AddJobDialog),
);

const HEAD_CLASS = "bg-muted/40 text-xs font-semibold tracking-wide text-muted-foreground";

export default function JobsPage({ searchParams }: PageProps<"/jobs">) {
  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Jobs</h1>
        <AddJobDialog />
      </div>

      <Suspense fallback={<TableSkeleton />}>
        <JobsContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function JobsContent({
  searchParams,
}: {
  searchParams: PageProps<"/jobs">["searchParams"];
}) {
  const { business } = await requireBusinessForPage();
  const { q } = await searchParams;
  const search = typeof q === "string" ? q.trim() : "";

  const jobs = await prisma.job.findMany({
    where: {
      businessId: business.id,
      ...(search
        ? {
            OR: [
              { jobRef: { contains: search, mode: "insensitive" } },
              { description: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  const summaries = await getJobsPnlSummaries(
    business.id,
    jobs.map((j) => j.id),
  );

  return (
    <>
      <JobSearch defaultValue={search} />

      {jobs.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <span className="mb-4 flex size-11 items-center justify-center rounded-xl bg-muted text-muted-foreground">
            <Briefcase className="size-5" />
          </span>
          <p className="text-sm font-medium">
            {search ? "No jobs match your search" : "No jobs yet"}
          </p>
          {!search && (
            <p className="mt-1 text-sm text-muted-foreground">
              Add a job to start grouping sales and purchase invoices for
              per-shipment profit &amp; loss.
            </p>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border shadow-xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={HEAD_CLASS}>Job Ref</TableHead>
                <TableHead className={HEAD_CLASS}>Description</TableHead>
                <TableHead className={HEAD_CLASS}>Status</TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>
                  Sales invoices
                </TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>
                  Total billed
                </TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>
                  Purchase invoices
                </TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>
                  Total cost
                </TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>Margin</TableHead>
                <TableHead className={`${HEAD_CLASS} text-right`}>Margin %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.map((job) => {
                const summary = summaries.get(job.id);
                const billed = Number(summary?.totalBilled ?? 0);
                const cost = Number(summary?.totalCost ?? 0);
                const margin = billed - cost;
                const marginPct = billed > 0 ? (margin / billed) * 100 : null;
                return (
                  <TableRow key={job.id} className="cursor-pointer">
                    <TableCell className="p-0">
                      <Link
                        href={`/jobs/${job.id}`}
                        className="block px-4 py-2.5 font-medium"
                      >
                        {job.jobRef}
                      </Link>
                    </TableCell>
                    <TableCell>{job.description || "—"}</TableCell>
                    <TableCell>
                      <StatusBadge status={job.status} />
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {summary?.salesInvoiceCount ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(billed)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {summary?.purchaseInvoiceCount ?? 0}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(cost)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {formatCurrency(margin)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {marginPct === null ? "—" : `${marginPct.toFixed(1)}%`}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
