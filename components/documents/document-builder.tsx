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
import type { CustomFieldValueSnapshot } from "@/lib/documents/custom-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type {
  BuilderProduct,
  LocalLineItem,
  BuilderCustomFieldDefinition,
} from "./types";

export type BuilderBusiness = {
  gstEnabled: boolean;
  gstDefaultRate: number | null;
  placeOfSupply: string | null;
};

// Re-exported from ./types (not defined here) so line-items-editor.tsx
// can use the same type without a circular import between the two.
export type { BuilderCustomFieldDefinition } from "./types";

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
  currency: string;
  showInrEquivalent: boolean;
  inrExchangeRate: number | null;
  lutDeclarationText: string | null;
  customFieldValues: CustomFieldValueSnapshot[];
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

// A practical set, not an exhaustive ISO 4217 list — the tax engine
// doesn't care what this value is (see documentUpdateSchema's
// `currency` comment), so any 3-letter code would technically work;
// this just keeps the dropdown to currencies GST-registered Indian
// exporters actually invoice in.
const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "AUD", "CAD"];

type SaveState = "idle" | "saving" | "saved" | "error";

export function DocumentBuilder({
  document,
  business,
  customers,
  products,
  customFieldDefinitions,
  lineItemCustomFieldDefinitions,
}: {
  document: BuilderDocument;
  business: BuilderBusiness;
  customers: Customer[];
  products: BuilderProduct[];
  customFieldDefinitions: BuilderCustomFieldDefinition[];
  lineItemCustomFieldDefinitions: BuilderCustomFieldDefinition[];
}) {
  const router = useRouter();
  const isQuotation = document.type === "quotation";
  const documentTypeLabel =
    document.type === "quotation"
      ? "Quotation"
      : document.type === "proforma"
        ? "Proforma Invoice"
        : "Invoice";
  const basePath =
    document.type === "quotation"
      ? "quotations"
      : document.type === "proforma"
        ? "proforma-invoices"
        : "invoices";
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
  const [currency, setCurrency] = useState(document.currency);
  const [inrExchangeRate, setInrExchangeRate] = useState(
    document.inrExchangeRate != null ? String(document.inrExchangeRate) : "",
  );
  const [lutDeclarationText, setLutDeclarationText] = useState(
    document.lutDeclarationText ?? "",
  );
  const isForeignCurrency = currency !== "INR";
  // Keyed by definitionId, always a string in local state (including for
  // number/date types) — converted to the snapshot's real value type only
  // when constructing customFieldValues on save, below.
  const [customFieldInputs, setCustomFieldInputs] = useState<
    Record<string, string>
  >(() => {
    const savedById = new Map(
      document.customFieldValues.map((entry) => [entry.definitionId, entry.value]),
    );
    return Object.fromEntries(
      customFieldDefinitions.map((def) => {
        const saved = savedById.get(def.id);
        return [def.id, saved == null ? "" : String(saved)];
      }),
    );
  });
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

  // Constructed fresh from the currently-loaded definitions on every
  // save — snapshotting label/type/sortOrder as they are *right now*
  // (§1a), never re-read from customFieldDefinitions after this point.
  // Blank inputs are omitted entirely rather than saved as an empty
  // value, so document-render.tsx/document-pdf.tsx never need their own
  // "skip if blank" check for these.
  const customFieldValues: CustomFieldValueSnapshot[] = useMemo(() => {
    return customFieldDefinitions
      .filter((def) => customFieldInputs[def.id]?.trim())
      .map((def) => {
        const raw = customFieldInputs[def.id].trim();
        return {
          definitionId: def.id,
          label: def.label,
          type: def.type,
          value: def.type === "number" ? Number(raw) : raw,
          sortOrder: def.sortOrder,
        };
      });
  }, [customFieldDefinitions, customFieldInputs]);

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
        currency,
        inrExchangeRate,
        lutDeclarationText,
        lineItems,
        customFieldValues,
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
      currency,
      inrExchangeRate,
      lutDeclarationText,
      lineItems,
      customFieldValues,
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
          currency,
          inrExchangeRate: inrExchangeRate === "" ? null : Number(inrExchangeRate),
          lutDeclarationText: lutDeclarationText || null,
          customFieldValues,
          lineItems: lineItems.map((item) => ({
            productId: item.productId,
            name: item.name,
            description: item.description || undefined,
            qty: item.qty,
            rate: item.rate,
            discountPct: item.discountPct,
            gstRate: item.gstRate,
            foreignCurrency: item.foreignCurrency,
            foreignRate: item.foreignRate,
            exchangeRate: item.exchangeRate,
            customFieldValues: item.customFieldValues,
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

  // Real bug this fixes: the effect above's cleanup runs on every
  // keystroke (correct — it's what makes debouncing work) *and* on
  // unmount, and previously did the same thing either way: silently
  // discard the pending timer. On unmount specifically (e.g. clicking
  // through to Preview, a client-side navigation that unmounts this
  // component), that meant any edit made within the last
  // AUTOSAVE_DELAY_MS was lost with no save ever firing for it — found
  // via a real document where a line item's foreignCurrency went
  // unsaved while foreignRate/exchangeRate (edited slightly earlier,
  // already flushed by an earlier debounce cycle) persisted correctly.
  // This second effect's cleanup runs *only* on unmount ([] deps), and
  // flushes rather than discards. `saveRef` always holds the latest
  // render's `save` closure (redefined every render) — an `[]`-deps
  // cleanup would otherwise close over the very first render's `save`,
  // which reads stale state.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveRef.current();
      }
    };
  }, []);

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
      router.push(`/${basePath}`);
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
            {documentTypeLabel}{" "}
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
                <div className="grid gap-1.5">
                  <Label htmlFor="doc-currency">Currency</Label>
                  <Select
                    value={currency}
                    onValueChange={(value) => value && setCurrency(value)}
                    disabled={!editable}
                  >
                    <SelectTrigger id="doc-currency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {isForeignCurrency && document.showInrEquivalent && (
                  <div className="grid gap-1.5">
                    <Label htmlFor="doc-inr-exchange-rate">
                      INR exchange rate
                    </Label>
                    <Input
                      id="doc-inr-exchange-rate"
                      type="number"
                      min={0}
                      step="any"
                      placeholder={`1 ${currency} = ? INR`}
                      value={inrExchangeRate}
                      onChange={(e) => setInrExchangeRate(e.target.value)}
                      disabled={!editable}
                    />
                  </div>
                )}
              </div>
              {isForeignCurrency && (
                <p className="mt-3 text-xs text-muted-foreground">
                  Export supply — zero-rated under LUT. GST is 0%.
                </p>
              )}
            </div>

            {customFieldDefinitions.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-5">
                <h2 className="mb-4 text-sm font-semibold">Custom fields</h2>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  {[...customFieldDefinitions]
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((def) => (
                      <div key={def.id} className="grid gap-1.5">
                        <Label htmlFor={`custom-field-${def.id}`}>{def.label}</Label>
                        <Input
                          id={`custom-field-${def.id}`}
                          type={
                            def.type === "number"
                              ? "number"
                              : def.type === "date"
                                ? "date"
                                : "text"
                          }
                          step={def.type === "number" ? "any" : undefined}
                          value={customFieldInputs[def.id] ?? ""}
                          onChange={(e) =>
                            setCustomFieldInputs((prev) => ({
                              ...prev,
                              [def.id]: e.target.value,
                            }))
                          }
                          disabled={!editable}
                        />
                      </div>
                    ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="mb-3 text-sm font-semibold">Items</h2>
              <LineItemsEditor
                items={lineItems}
                products={products}
                gstEnabled={business.gstEnabled}
                gstDefaultRate={business.gstDefaultRate}
                customFieldDefinitions={lineItemCustomFieldDefinitions}
                documentCurrency={currency}
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
                {isForeignCurrency && (
                  <div className="grid gap-1.5 sm:col-span-2">
                    <Label htmlFor="doc-lut-text">Export declaration (LUT)</Label>
                    <Textarea
                      id="doc-lut-text"
                      rows={2}
                      value={lutDeclarationText}
                      onChange={(e) => setLutDeclarationText(e.target.value)}
                      disabled={!editable}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        </fieldset>

        <div className="flex w-full flex-col gap-4 lg:w-80 lg:flex-none">
          <TotalsSummary
            totals={totals}
            gstEnabled={business.gstEnabled}
            currency={currency}
          />
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
                  href={`/${basePath}/${document.id}/preview`}
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
