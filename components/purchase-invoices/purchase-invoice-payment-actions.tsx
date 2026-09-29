"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { PurchaseInvoiceStatus } from "@prisma/client";
import { formatCurrency } from "@/lib/format";
import { formatDateIST } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

// Same design as document-preview.tsx's Record payment/Reverse last
// payment controls, direction reversed — see
// docs/accounts-payable-phase1-design.md §7. Owner/admin only
// (purchase_invoices.pay, §8): `canPay` is computed server-side and
// hides both actions entirely for anyone else, same as the API route's
// own gate — a Staff member sees the payment history read-only.
export function PurchaseInvoicePaymentActions({
  id,
  status,
  currency,
  remainingBalance,
  hasPayments,
  lastPayment,
  canPay,
}: {
  id: string;
  status: PurchaseInvoiceStatus;
  currency: string;
  remainingBalance: number;
  hasPayments: boolean;
  lastPayment: { amount: number; paidAt: string } | null;
  canPay: boolean;
}) {
  const router = useRouter();
  const [recordOpen, setRecordOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [amount, setAmount] = useState(
    remainingBalance > 0 ? String(remainingBalance) : "",
  );
  const [method, setMethod] = useState("");
  const [note, setNote] = useState("");

  const [reverseOpen, setReverseOpen] = useState(false);
  const [reversing, setReversing] = useState(false);

  const recordable = canPay && status !== "received" && status !== "cancelled";
  const reversible = canPay && recordable && hasPayments;

  async function handleRecordPayment() {
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Enter an amount greater than 0.");
      return;
    }
    setRecording(true);
    try {
      const response = await fetch(`/api/purchase-invoices/${id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parsedAmount,
          method: method || undefined,
          note: note || undefined,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't record this payment. Try again.");
        return;
      }
      toast.success("Payment recorded.");
      setRecordOpen(false);
      setMethod("");
      setNote("");
      router.refresh();
    } catch {
      toast.error("Couldn't record this payment. Try again.");
    } finally {
      setRecording(false);
    }
  }

  async function handleReverseLastPayment() {
    setReversing(true);
    try {
      const response = await fetch(
        `/api/purchase-invoices/${id}/payments/reverse-last`,
        { method: "POST" },
      );
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't reverse this payment. Try again.");
        return;
      }
      toast.success("Payment reversed.");
      setReverseOpen(false);
      router.refresh();
    } catch {
      toast.error("Couldn't reverse this payment. Try again.");
    } finally {
      setReversing(false);
    }
  }

  if (!canPay) return null;

  return (
    <div className="flex flex-none gap-2">
      <Dialog open={recordOpen} onOpenChange={setRecordOpen}>
        <DialogTrigger render={<Button variant="outline" disabled={!recordable} />}>
          Record payment
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Record payment</DialogTitle>
            <DialogDescription>
              {remainingBalance > 0
                ? `Defaults to the remaining balance of ${formatCurrency(remainingBalance, currency)} — edit for a partial amount.`
                : "This invoice is already fully paid — recording another payment here becomes a credit balance, not a rejection."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="vendor-payment-amount">Amount</Label>
              <Input
                id="vendor-payment-amount"
                type="number"
                min={0}
                step={0.01}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vendor-payment-method">Method (optional)</Label>
              <Input
                id="vendor-payment-method"
                placeholder="e.g. Bank transfer, cheque"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="vendor-payment-note">Note / reference (optional)</Label>
              <Input
                id="vendor-payment-note"
                placeholder="e.g. cheque #1234"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="mt-2">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button disabled={recording} onClick={handleRecordPayment}>
              {recording ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <AlertDialogTrigger render={<Button variant="ghost" disabled={!reversible} />}>
          Reverse last payment
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reverse the last payment?</AlertDialogTitle>
            <AlertDialogDescription>
              {lastPayment
                ? `This removes the ${formatCurrency(lastPayment.amount, currency)} payment recorded on ${formatDateIST(lastPayment.paidAt, { day: "2-digit", month: "long", year: "numeric" })}. This can't be undone; a note recording the reversal is added to Notes.`
                : "This can't be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={reversing} onClick={handleReverseLastPayment}>
              {reversing ? "Reversing…" : "Reverse payment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
