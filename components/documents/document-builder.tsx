"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Prisma, type Customer, type DocumentType } from "@prisma/client";
import {
  calculateDocumentTotals,
  type DocumentTotals,
} from "@/lib/tax/calculateDocumentTotals";
import { isSameState } from "@/lib/tax/calculateGST";
import { resolveGstRate } from "@/lib/tax/resolveGstRate";
import { isEditableStatus } from "@/lib/documents/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
import { CustomerPicker } from "./customer-picker";
import { LineItemsEditor, newLineItemKey } from "./line-items-editor";
import { TotalsSummary } from "./totals-summary";
import type { BuilderProduct, LocalLineItem } from "./types";

export type BuilderBusiness = {
  gstEnabled: boolean;
  gstDefaultRate: number | null;
  placeOfSupply: string | null;
};

export type BuilderLineItem = Omit<LocalLineItem, "key">;

export type BuilderStoredTotals = {
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
};

export type BuilderDocument = {
  id: string;
  type: DocumentType;
  number: string;
  status: string;
  customer: Customer;
  issueDate: Date;
  dueDate: Date | null;
  validUntil: Date | null;
  paymentTerms: string | null;
  validityTerms: string | null;
  notes: string | null;
  termsText: string | null;
  referenceNumber: string | null;
  lineItems: BuilderLineItem[];
  // The document's actual, currently-persisted totals — including which
  // of CGST+SGST vs IGST applies. Shown as-is until the user makes a
  // real edit; only then does the summary switch to a live recompute.
  // Without this, opening an already-computed document (most notably one
  // just created by quotation -> invoice conversion) would immediately
  // show a *different* tax breakdown than what's actually stored,
  // because the live recompute below re-derives same-state/inter-state
  // from the customer's row as it stands right now — which may have
  // changed since the totals were frozen.
  totals: BuilderStoredTotals;
};

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

const AUTOSAVE_DELAY_MS = 1200;

type SaveState = "idle" | "saving" | "saved" | "error";

export function DocumentBuilder({
  document,
  business,
  customers,
  products,
}: {
  document: BuilderDocument;
  business: BuilderBusiness;
  customers: Customer[];
  products: BuilderProduct[];
}) {
  const router = useRouter();
  const isQuotation = document.type === "quotation";
  const editable = isEditableStatus(document.status);

  const [customer, setCustomer] = useState(document.customer);
  const [allCustomers, setAllCustomers] = useState(customers);
  const [number, setNumber] = useState(document.number);
  const [issueDate, setIssueDate] = useState(toDateInputValue(document.issueDate));
  const [secondaryDate, setSecondaryDate] = useState(
    toDateInputValue(isQuotation ? document.validUntil : document.dueDate),
  );
  const [terms, setTerms] = useState(
    (isQuotation ? document.validityTerms : document.paymentTerms) ?? "",
  );
  const [notes, setNotes] = useState(document.notes ?? "");
  const [termsText, setTermsText] = useState(document.termsText ?? "");
  const [referenceNumber, setReferenceNumber] = useState(
    document.referenceNumber ?? "",
  );
  const [lineItems, setLineItems] = useState<LocalLineItem[]>(() =>
    document.lineItems.map((item) => ({ ...item, key: newLineItemKey() })),
  );

  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [deleting, setDeleting] = useState(false);
  // Flips true on the user's first real edit — see BuilderDocument.totals
  // for why the summary shouldn't live-recompute before that.
  const [edited, setEdited] = useState(false);
  const lastSavedSnapshot = useRef<string>("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const liveTotals = useMemo(() => {
    const sameState = isSameState(business.placeOfSupply, customer.state);
    const productsById = new Map(products.map((p) => [p.id, p]));
    return calculateDocumentTotals(
      lineItems.map((item) => ({
        ...item,
        gstRate: resolveGstRate(
          item.gstRate,
          item.productId ? productsById.get(item.productId)?.gstRate : null,
          business.gstDefaultRate,
        ),
      })),
      { gstEnabled: business.gstEnabled, sameState },
    );
  }, [lineItems, customer, products, business]);

  // The document's own persisted totals, as-is — including whichever of
  // CGST+SGST vs IGST was actually frozen (e.g. by conversion), not
  // re-derived from the customer's current state.
  const storedTotals: DocumentTotals = useMemo(
    () => ({
      subtotal: new Prisma.Decimal(document.totals.subtotal),
      discountTotal: new Prisma.Decimal(document.totals.discountTotal),
      taxableAmount: new Prisma.Decimal(document.totals.taxableAmount),
      cgst: new Prisma.Decimal(document.totals.cgst),
      sgst: new Prisma.Decimal(document.totals.sgst),
      igst: new Prisma.Decimal(document.totals.igst),
      total: new Prisma.Decimal(document.totals.total),
    }),
    [document.totals],
  );

  const totals = edited ? liveTotals : storedTotals;

  const snapshot = useMemo(
    () =>
      JSON.stringify({
        customerId: customer.id,
        number,
        issueDate,
        secondaryDate,
        terms,
        notes,
        termsText,
        referenceNumber,
        lineItems,
      }),
    [
      customer.id,
      number,
      issueDate,
      secondaryDate,
      terms,
      notes,
      termsText,
      referenceNumber,
      lineItems,
    ],
  );

  async function save() {
    // Belt-and-suspenders alongside the server's own check (PATCH
    // /api/documents/:id rejects any edit once status isn't "draft",
    // unconditionally, before it even looks at the request body) — this
    // stops the request from firing at all rather than firing and being
    // rejected. The disabled <fieldset> alone wouldn't cover this: it's a
    // UI-only guard that doesn't prevent handleManualSave() or an
    // in-flight debounce timer from calling save() directly.
    if (!editable) return;

    setSaveState("saving");
    try {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          number,
          issueDate: issueDate ? new Date(issueDate).toISOString() : undefined,
          ...(isQuotation
            ? {
                validUntil: secondaryDate
                  ? new Date(secondaryDate).toISOString()
                  : null,
                validityTerms: terms || null,
              }
            : {
                dueDate: secondaryDate
                  ? new Date(secondaryDate).toISOString()
                  : null,
                paymentTerms: terms || null,
              }),
          notes: notes || null,
          termsText: termsText || null,
          referenceNumber: referenceNumber || null,
          lineItems: lineItems.map((item) => ({
            productId: item.productId,
            name: item.name,
            description: item.description || undefined,
            qty: item.qty,
            rate: item.rate,
            discountPct: item.discountPct,
            gstRate: item.gstRate,
          })),
        }),
      });

      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't save. Try again.");
        setSaveState("error");
        return;
      }

      lastSavedSnapshot.current = snapshot;
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }

  useEffect(() => {
    if (!editable) return;
    if (snapshot === lastSavedSnapshot.current) return;
    if (lastSavedSnapshot.current === "") {
      // First render — seed the baseline without saving immediately.
      lastSavedSnapshot.current = snapshot;
      return;
    }

    // A real change from what was loaded — from here on, show live
    // totals instead of the document's stored ones (see storedTotals).
    setEdited(true);

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      save();
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, editable]);

  async function handleManualSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    await save();
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const response = await fetch(`/api/documents/${document.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.error ?? "Couldn't delete. Try again.");
        setDeleting(false);
        return;
      }
      router.push(isQuotation ? "/quotations" : "/invoices");
    } finally {
      setDeleting(false);
    }
  }

  const saveLabel =
    saveState === "saving"
      ? "Saving…"
      : saveState === "error"
        ? "Retry save"
        : saveState === "saved"
          ? "Saved"
          : "Save draft";

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            {isQuotation ? "Quotation" : "Invoice"}{" "}
            <span className="font-mono text-base text-muted-foreground">
              {number}
            </span>
          </h1>
          <Badge variant="secondary" className="mt-1 capitalize">
            {document.status}
          </Badge>
        </div>
        {editable && (
          <AlertDialog>
            <AlertDialogTrigger
              render={<Button variant="ghost" className="text-destructive" />}
            >
              Delete
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
                <AlertDialogDescription>
                  This can&apos;t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction disabled={deleting} onClick={handleDelete}>
                  {deleting ? "Deleting…" : "Delete"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      {!editable && (
        <p className="rounded-lg border border-dashed border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          This document is no longer a draft, so it can&apos;t be edited here.
        </p>
      )}

      <div className="flex flex-col gap-6 lg:flex-row">
        <fieldset disabled={!editable} className="contents">
          <div className="flex flex-1 flex-col gap-6">
            <CustomerPicker
              customers={allCustomers}
              selected={customer}
              onChange={setCustomer}
              onCustomerCreated={(created) =>
                setAllCustomers((prev) => [created, ...prev])
              }
              disabled={!editable}
            />

            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold">Document details</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-number">Number</Label>
                  <Input
                    id="doc-number"
                    className="font-mono"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    disabled={!editable}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-issue-date">Issue date</Label>
                  <Input
                    id="doc-issue-date"
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    disabled={!editable}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-secondary-date">
                    {isQuotation ? "Valid until" : "Due date"}
                  </Label>
                  <Input
                    id="doc-secondary-date"
                    type="date"
                    value={secondaryDate}
                    onChange={(e) => setSecondaryDate(e.target.value)}
                    disabled={!editable}
                  />
                </div>
                <div className="col-span-2 grid gap-1.5 sm:col-span-3">
                  <Label htmlFor="doc-terms">
                    {isQuotation ? "Validity terms" : "Payment terms"}
                  </Label>
                  <Input
                    id="doc-terms"
                    placeholder={
                      isQuotation ? "e.g. Valid for 15 days" : "e.g. Net 15"
                    }
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    disabled={!editable}
                  />
                </div>
                <div className="col-span-2 grid gap-1.5 sm:col-span-3">
                  <Label htmlFor="doc-reference-number">Reference number</Label>
                  <Input
                    id="doc-reference-number"
                    placeholder="e.g. a PO number or project code"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    disabled={!editable}
                  />
                </div>
              </div>
            </div>

            <div>
              <h2 className="mb-3 text-sm font-semibold">Items</h2>
              <LineItemsEditor
                items={lineItems}
                products={products}
                gstEnabled={business.gstEnabled}
                gstDefaultRate={business.gstDefaultRate}
                onChange={setLineItems}
                disabled={!editable}
              />
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <h2 className="mb-4 text-sm font-semibold">Notes &amp; terms</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-notes">Notes to customer</Label>
                  <Textarea
                    id="doc-notes"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={!editable}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-terms-text">Terms &amp; conditions</Label>
                  <Textarea
                    id="doc-terms-text"
                    rows={3}
                    value={termsText}
                    onChange={(e) => setTermsText(e.target.value)}
                    disabled={!editable}
                  />
                </div>
              </div>
            </div>
          </div>
        </fieldset>

        <div className="flex w-full flex-col gap-4 lg:w-80 lg:flex-none">
          <TotalsSummary totals={totals} gstEnabled={business.gstEnabled} />
          <div className="flex flex-col gap-2">
            {editable && (
              <Button type="button" onClick={handleManualSave}>
                {saveLabel}
              </Button>
            )}
            <Button
              variant="outline"
              nativeButton={false}
              render={
                <Link
                  href={`/${isQuotation ? "quotations" : "invoices"}/${document.id}/preview`}
                />
              }
            >
              Preview
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
