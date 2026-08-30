"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { DocumentTemplate } from "@prisma/client";
import {
  canConvertQuotation,
  canMarkPaid,
  canMarkUnpaid,
  canSendDocument,
  isEditableStatus,
} from "@/lib/documents/status";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DocumentRender } from "./document-render";
import type { PreviewAppearance, PreviewDocument } from "./preview-types";

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const TEMPLATES: { id: DocumentTemplate; label: string }[] = [
  { id: "classic", label: "Classic" },
  { id: "modern", label: "Modern" },
  { id: "minimal", label: "Minimal" },
];

const SWATCHES = ["#4F46E5", "#0F766E", "#1D4ED8", "#C2410C", "#111827"];

type ToggleKey = keyof Pick<
  PreviewAppearance,
  | "showLogo"
  | "showGstinRow"
  | "showTax"
  | "showPayment"
  | "showNotes"
  | "showTerms"
  | "showReferenceNumber"
>;

const AUTOSAVE_DELAY_MS = 800;

export function DocumentPreview({
  document,
  gstEnabled,
  canEdit,
  canReassign,
}: {
  document: PreviewDocument;
  gstEnabled: boolean;
  // Whether the viewer's mutate-scope covers this specific document —
  // false for a Manager looking at a subordinate's document (view-scope
  // only). Every mutating action below (Convert/Mark paid/Share/Send)
  // gates on this, not just status/type, so the buttons never look
  // clickable while the server would actually reject them. See
  // docs/permission-layer-design.md §5, §6.
  canEdit: boolean;
  // Whether "Reassign to me" should be offered — !canEdit and the
  // document is still a draft (see the reassign route's own restriction).
  canReassign: boolean;
}) {
  const router = useRouter();
  const isQuotation = document.type === "quotation";
  const editable = isEditableStatus(document.status);
  const basePath = isQuotation ? "/quotations" : "/invoices";
  const sendable =
    canEdit &&
    canSendDocument(document.type, document.status) &&
    Boolean(document.customer.email);
  const convertible = canEdit && isQuotation && canConvertQuotation(document.status);
  const markPayable =
    canEdit && !isQuotation && document.status !== "paid" && canMarkPaid(document.status);
  const markUnpayable =
    canEdit && !isQuotation && canMarkUnpaid(document.status);

  const [downloading, setDownloading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [sending, setSending] = useState(false);
  const [converting, setConverting] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markingUnpaid, setMarkingUnpaid] = useState(false);
  const [reassigning, setReassigning] = useState(false);

  const [appearance, setAppearance] = useState<PreviewAppearance>({
    template: document.template,
    accentColor: document.accentColor,
    showLogo: document.showLogo,
    showGstinRow: document.showGstinRow,
    showTax: document.showTax,
    showPayment: document.showPayment,
    showNotes: document.showNotes,
    showTerms: document.showTerms,
    showReferenceNumber: document.showReferenceNumber,
  });

  const lastSaved = useRef(appearance);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!editable) return;
    if (JSON.stringify(appearance) === JSON.stringify(lastSaved.current)) return;

    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const toSave = appearance;
      try {
        const response = await fetch(`/api/documents/${document.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(toSave),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          toast.error(body?.error ?? "Couldn't save appearance. Try again.");
          return;
        }
        lastSaved.current = toSave;
      } catch {
        toast.error("Couldn't save appearance. Try again.");
      }
    }, AUTOSAVE_DELAY_MS);

    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [appearance, editable, document.id]);

  function updateAppearance(patch: Partial<PreviewAppearance>) {
    if (!editable) return;
    setAppearance((prev) => ({ ...prev, ...patch }));
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      // Sends the *current* on-screen appearance, not just whatever's
      // already saved — a download taken mid-edit (before the customize
      // sidebar's debounced autosave lands) still matches what's shown.
      const response = await fetch(`/api/documents/${document.id}/pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(appearance),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(body?.error ?? "Couldn't generate the PDF. Try again.");
        return;
      }
      const blob = await response.blob();
      downloadBlob(blob, `${document.number}.pdf`);
    } catch {
      toast.error("Couldn't generate the PDF. Try again.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleShare() {
    setSharing(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/share`, {
        method: "POST",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't create a share link. Try again.");
        return;
      }
      await navigator.clipboard.writeText(body.shareUrl);
      toast.success("Share link copied to clipboard.");
    } catch {
      toast.error("Couldn't create a share link. Try again.");
    } finally {
      setSharing(false);
    }
  }

  async function handleSend() {
    setSending(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/send`, {
        method: "POST",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body?.error ?? "Couldn't send the email. Try again.";
        // toast.error() itself doesn't log anywhere on success, so this is
        // the only way to tell, from the console alone, whether this line
        // actually ran — needed while tracking down a report of the toast
        // not appearing with no console errors either.
        console.error("Send failed:", response.status, message);
        toast.error(message);
        return;
      }
      toast.success(`${isQuotation ? "Quotation" : "Invoice"} emailed to the customer.`);
      router.refresh();
    } catch (err) {
      console.error("Send threw:", err);
      toast.error("Couldn't send the email. Try again.");
    } finally {
      setSending(false);
    }
  }

  async function handleConvert() {
    setConverting(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/convert`, {
        method: "POST",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't convert this quotation. Try again.");
        return;
      }
      toast.success(`Converted to invoice ${body.document.number}.`);
      router.push(`/invoices/${body.document.id}`);
    } catch {
      toast.error("Couldn't convert this quotation. Try again.");
    } finally {
      setConverting(false);
    }
  }

  async function handleReassign() {
    setReassigning(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/reassign`, {
        method: "POST",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't reassign this document. Try again.");
        return;
      }
      toast.success("Reassigned to you — you can edit it now.");
      router.push(`${basePath}/${document.id}`);
    } catch {
      toast.error("Couldn't reassign this document. Try again.");
    } finally {
      setReassigning(false);
    }
  }

  async function handleMarkPaid() {
    setMarkingPaid(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/mark-paid`, {
        method: "POST",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't mark this invoice as paid. Try again.");
        return;
      }
      toast.success("Invoice marked as paid.");
      router.refresh();
    } catch {
      toast.error("Couldn't mark this invoice as paid. Try again.");
    } finally {
      setMarkingPaid(false);
    }
  }

  async function handleMarkUnpaid() {
    setMarkingUnpaid(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/mark-unpaid`, {
        method: "POST",
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(body?.error ?? "Couldn't mark this invoice as unpaid. Try again.");
        return;
      }
      toast.success("Invoice reverted to draft.");
      router.push(`${basePath}/${document.id}`);
    } catch {
      toast.error("Couldn't mark this invoice as unpaid. Try again.");
    } finally {
      setMarkingUnpaid(false);
    }
  }

  const toggles: { key: ToggleKey; label: string }[] = [
    { key: "showLogo", label: "Logo" },
    ...(gstEnabled
      ? ([
          { key: "showGstinRow", label: "GSTIN" },
          { key: "showTax", label: "Tax breakdown" },
        ] as const)
      : []),
    { key: "showPayment", label: "Payment details" },
    { key: "showNotes", label: "Notes" },
    { key: "showTerms", label: "Terms & conditions" },
    { key: "showReferenceNumber", label: "Reference number" },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-background/90 px-6 py-4 backdrop-blur">
        {canEdit ? (
          <Link
            href={`${basePath}/${document.id}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ‹ Back to editor
          </Link>
        ) : (
          <Link
            href={basePath}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ‹ Back to list
          </Link>
        )}
        <div className="h-5 w-px bg-border" />
        <div className="text-base font-semibold">
          {isQuotation ? "Quotation" : "Invoice"} preview
        </div>
        <div className="ml-auto flex gap-2.5">
          {canReassign && (
            <Button
              variant="outline"
              disabled={reassigning}
              onClick={handleReassign}
            >
              {reassigning ? "Reassigning…" : "Reassign to me"}
            </Button>
          )}
          {isQuotation && !document.convertedToInvoice && (
            <Button
              variant="outline"
              disabled={converting || !convertible}
              title={
                !convertible
                  ? "This quotation can't be converted in its current status"
                  : undefined
              }
              onClick={handleConvert}
            >
              {converting ? "Converting…" : "Convert to invoice"}
            </Button>
          )}
          {!isQuotation && (
            <Button
              variant="outline"
              disabled={markingPaid || !markPayable}
              onClick={handleMarkPaid}
            >
              {document.status === "paid"
                ? "Paid ✓"
                : markingPaid
                  ? "Marking paid…"
                  : "Mark as paid"}
            </Button>
          )}
          {!isQuotation && document.status === "paid" && (
            <Button
              variant="outline"
              disabled={markingUnpaid || !markUnpayable}
              onClick={handleMarkUnpaid}
            >
              {markingUnpaid ? "Marking unpaid…" : "Mark as unpaid"}
            </Button>
          )}
          <Button variant="outline" disabled={sharing || !canEdit} onClick={handleShare}>
            {sharing ? "Sharing…" : "Share"}
          </Button>
          <Button
            variant="outline"
            disabled={sending || !sendable}
            title={
              !sendable
                ? document.customer.email
                  ? "This document can't be sent in its current status"
                  : "This customer has no email address on file"
                : undefined
            }
            onClick={handleSend}
          >
            {sending ? "Sending…" : "Send to customer"}
          </Button>
          <Button
            disabled={downloading}
            style={{ background: appearance.accentColor }}
            onClick={handleDownload}
          >
            {downloading ? "Preparing…" : "Download PDF"}
          </Button>
        </div>
      </div>

      {isQuotation && document.convertedToInvoice && (
        <div className="border-b border-border bg-muted/40 px-6 py-3 text-sm">
          Converted to invoice{" "}
          <Link
            href={`/invoices/${document.convertedToInvoice.id}`}
            className="font-medium text-primary underline underline-offset-2"
          >
            {document.convertedToInvoice.number}
          </Link>
          .
        </div>
      )}

      <div className="flex flex-1 flex-wrap items-start gap-6 bg-muted/40 p-6">
        <div className="flex min-w-0 flex-1 justify-center">
          <DocumentRender
            type={document.type}
            number={document.number}
            issueDate={document.issueDate}
            dueDate={document.dueDate}
            validUntil={document.validUntil}
            paymentTerms={document.paymentTerms}
            validityTerms={document.validityTerms}
            notes={document.notes}
            termsText={document.termsText}
            referenceNumber={document.referenceNumber}
            currency={document.currency}
            business={document.business}
            customer={document.customer}
            lineItems={document.lineItems}
            totals={document.totals}
            gstEnabled={gstEnabled}
            appearance={appearance}
          />
        </div>

        <div className="sticky top-24 w-full max-w-[300px] flex-1 rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-4">
            <div className="text-sm font-semibold">Customize</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              Changes apply to the preview and the PDF.
            </div>
          </div>

          {!editable && (
            <p className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
              This document is no longer a draft, so its appearance can&apos;t
              be changed here.
            </p>
          )}

          <fieldset disabled={!editable} className="contents">
            <div className="border-b border-border px-4 py-4">
              <div className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground">
                LAYOUT
              </div>
              <div className="flex flex-col gap-1.5">
                {TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    disabled={!editable}
                    onClick={() => updateAppearance({ template: template.id })}
                    className={cn(
                      "flex items-center justify-between rounded-lg px-2.5 py-2 text-sm disabled:cursor-not-allowed",
                      appearance.template === template.id
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    {template.label}
                    {appearance.template === template.id && <span>✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-b border-border px-4 py-4">
              <div className="mb-2.5 text-xs font-semibold tracking-wide text-muted-foreground">
                ACCENT COLOR
              </div>
              <div className="flex gap-2">
                {SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    disabled={!editable}
                    aria-label={`Use ${color} as accent color`}
                    onClick={() => updateAppearance({ accentColor: color })}
                    className={cn(
                      "size-7 rounded-md disabled:cursor-not-allowed",
                      appearance.accentColor === color &&
                        "ring-2 ring-offset-2 ring-offset-background",
                    )}
                    style={{
                      background: color,
                      ...(appearance.accentColor === color
                        ? ({ "--tw-ring-color": color } as CSSProperties)
                        : {}),
                    }}
                  />
                ))}
              </div>
            </div>

            <div className="px-4 py-4">
              <div className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground">
                SHOW ON DOCUMENT
              </div>
              {toggles.map((toggle) => (
                <div
                  key={toggle.key}
                  className="flex items-center justify-between py-2"
                >
                  <span className="text-sm text-foreground/90">{toggle.label}</span>
                  <Switch
                    checked={appearance[toggle.key]}
                    disabled={!editable}
                    onCheckedChange={(checked: boolean) =>
                      updateAppearance({
                        [toggle.key]: checked,
                      } as Partial<PreviewAppearance>)
                    }
                    style={
                      appearance[toggle.key]
                        ? ({ backgroundColor: appearance.accentColor } as CSSProperties)
                        : undefined
                    }
                  />
                </div>
              ))}
            </div>
          </fieldset>
        </div>
      </div>
    </div>
  );
}
