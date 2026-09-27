"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Vendor } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// The two lifecycle actions beyond editing fields: deactivate/reactivate
// (soft-delete, §1.1 — the normal path once a vendor has purchase
// invoices against it) and hard-delete (only actually succeeds today,
// Stage a, since no FK references a vendor yet — see the DELETE route's
// own comment; Stage b's FK will make this fail for a vendor with
// invoices, at which point deactivating is the only option left).
export function VendorActions({ vendor }: { vendor: Vendor }) {
  const router = useRouter();
  const [togglingActive, setTogglingActive] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function toggleActive() {
    setTogglingActive(true);
    try {
      const response = await fetch(`/api/vendors/${vendor.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !vendor.isActive }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't update vendor. Try again.");
        return;
      }
      toast.success(vendor.isActive ? "Vendor deactivated" : "Vendor reactivated");
      router.refresh();
    } finally {
      setTogglingActive(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/vendors/${vendor.id}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't delete vendor. Try again.");
        return;
      }
      toast.success("Vendor deleted");
      router.push("/vendors");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-none gap-2">
      <Button variant="outline" onClick={toggleActive} disabled={togglingActive}>
        {vendor.isActive ? "Deactivate" : "Reactivate"}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="outline" />}>
          Delete
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes {vendor.name}. If they have purchase
              invoices recorded against them, deletion will fail — deactivate
              instead in that case.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
