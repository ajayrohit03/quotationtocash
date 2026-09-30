"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Job, JobStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { EditJobDialog } from "./edit-job-dialog";

// Close/Reopen is a plain status toggle, not a one-way door — closing a
// job is bookkeeping, materially lower-stakes than AP Phase 1's
// owner/admin-only approval gate, so jobs.edit covers it (design doc
// §6's own reasoning). Hidden entirely without jobs.edit, same
// "hidden, not shown-then-403'd" convention as
// PurchaseInvoicePaymentActions.
export function JobActions({
  job,
  canEdit,
}: {
  job: Job;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [toggling, setToggling] = useState(false);

  async function toggleStatus() {
    const nextStatus: JobStatus = job.status === "open" ? "closed" : "open";
    setToggling(true);
    try {
      const response = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't update job. Try again.");
        return;
      }
      toast.success(nextStatus === "closed" ? "Job closed" : "Job reopened");
      router.refresh();
    } finally {
      setToggling(false);
    }
  }

  if (!canEdit) return null;

  return (
    <div className="flex flex-none gap-2">
      <EditJobDialog job={job} />
      <Button variant="outline" onClick={toggleStatus} disabled={toggling}>
        {job.status === "open" ? "Close job" : "Reopen job"}
      </Button>
    </div>
  );
}
