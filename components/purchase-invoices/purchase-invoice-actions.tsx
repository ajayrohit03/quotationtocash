"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PurchaseInvoiceStatus } from "@prisma/client";
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function PurchaseInvoiceActions({
  id,
  status,
  vendorInvoiceNumber,
}: {
  id: string;
  status: PurchaseInvoiceStatus;
  vendorInvoiceNumber: string;
}) {
  const router = useRouter();
  const [downloading, setDownloading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      const response = await fetch(`/api/purchase-invoices/${id}/pdf`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.error ?? "Couldn't generate the PDF. Try again.");
        return;
      }
      const blob = await response.blob();
      downloadBlob(blob, `${vendorInvoiceNumber || id}.pdf`);
    } catch {
      toast.error("Couldn't generate the PDF. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleApprove() {
    setApproving(true);
    try {
      const response = await fetch(`/api/purchase-invoices/${id}/approve`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't approve this invoice.");
        return;
      }
      toast.success("Purchase invoice approved");
      router.refresh();
    } finally {
      setApproving(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      const response = await fetch(`/api/purchase-invoices/${id}/cancel`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't cancel this invoice.");
        return;
      }
      toast.success("Purchase invoice cancelled");
      router.refresh();
    } finally {
      setCancelling(false);
    }
  }

  const canApprove = status === "received";
  const canCancel = status === "received" || status === "approved";

  return (
    <div className="flex flex-none gap-2">
      <Button variant="outline" onClick={handleDownload} disabled={downloading}>
        {downloading ? "Preparing…" : "Download PDF"}
      </Button>
      {canCancel && (
        <AlertDialog>
          <AlertDialogTrigger render={<Button variant="outline" />}>
            Cancel
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancel this purchase invoice?</AlertDialogTitle>
              <AlertDialogDescription>
                This is a dead end — a cancelled invoice cannot be
                re-approved or paid. If it was entered wrong, cancel it and
                record a new one with the correct details.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep it</AlertDialogCancel>
              <AlertDialogAction onClick={handleCancel} disabled={cancelling}>
                {cancelling ? "Cancelling…" : "Cancel invoice"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {canApprove && (
        <Button onClick={handleApprove} disabled={approving}>
          {approving ? "Approving…" : "Approve"}
        </Button>
      )}
    </div>
  );
}
