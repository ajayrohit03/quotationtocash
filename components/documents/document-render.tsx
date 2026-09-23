import { Fragment } from "react";
import type { CSSProperties } from "react";
import type { DocumentType } from "@prisma/client";
import { formatDateIST } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import type {
  BusinessSnapshot,
  CustomerSnapshot,
} from "@/lib/documents/snapshots";
import { paymentDetailsLines } from "@/lib/documents/payment-details";
import {
  formatCustomFieldValue,
  type CustomFieldValueSnapshot,
} from "@/lib/documents/custom-fields";
import { isSameState } from "@/lib/tax/calculateGST";
import { groupTaxByRate } from "@/lib/tax/groupTaxByRate";
import {
  resolveLineItemColumns,
  resolveForeignCurrencyRateLabel,
} from "@/lib/documents/line-item-columns";
import { businessIdentityLine } from "@/lib/documents/business-identity";
import { QRCodeSVG } from "qrcode.react";
import type {
  PreviewAppearance,
  PreviewLineItem,
  PreviewPayment,
  PreviewTotals,
} from "./preview-types";

function formatDate(iso: string): string {
  return formatDateIST(iso, { day: "2-digit", month: "short", year: "numeric" });
}

// The neutral scale point every text-[Npx] class below pivots on via
// the --doc-scale CSS custom property — a document with fontSize null
// (or === this value) renders pixel-identical to before this feature.
// Kept in sync by hand with lib/pdf/document-pdf.tsx's own copy (the
// PDF renderer can't share this module — see that file's header
// comment) and document-preview.tsx's DEFAULT_FONT_SIZE (the Customize
// slider's fallback display value).
const DEFAULT_FONT_SIZE = 9;

// Per-template colors, mirroring the design reference's renderVals():
// classic = dark header band, modern = accent top bar + soft gray header,
// minimal = no color blocks anywhere except the total row's neutral
// tint, compact = same coloring as modern but paired with the tighter
// spacing applied throughout the render below, formal = strictly
// black/white/gray with a bordered "grid" look instead of any colored
// fill, for a traditional printed-invoice appearance.
function templateStyle(template: PreviewAppearance["template"], accentColor: string) {
  if (template === "formal") {
    return {
      docTitleColor: "#0E1220",
      tableHeadBg: "#fff",
      tableHeadColor: "#0E1220",
      tableHeadBorder: "2px solid #0E1220",
      totalRowBg: "#fff",
      totalRowColor: "#0E1220",
      totalRowBorder: "2px solid #0E1220",
    };
  }
  return {
    docTitleColor: template === "minimal" ? "#0E1220" : accentColor,
    tableHeadBg:
      template === "minimal" ? "#fff" : template === "classic" ? "#0E1220" : "#F3F4F7",
    tableHeadColor:
      template === "classic" ? "#fff" : template === "minimal" ? "#8A92A6" : "#3D4453",
    tableHeadBorder: "none",
    totalRowBg: template === "minimal" ? "#F6F7F9" : accentColor,
    totalRowColor: template === "minimal" ? "#0E1220" : "#fff",
    totalRowBorder: "none",
  };
}

export function DocumentRender({
  type,
  number,
  issueDate,
  dueDate,
  validUntil,
  paymentTerms,
  validityTerms,
  notes,
  termsText,
  referenceNumber,
  currency,
  inrExchangeRate,
  lutDeclarationText,
  irn,
  irnAckNo,
  irnAckDate,
  einvoiceQrCode,
  fontSize,
  business,
  customer,
  customFieldValues,
  lineItems,
  totals,
  payments,
  amountPaid,
  remainingBalance,
  creditBalance,
  gstEnabled,
  appearance,
  // In-app only — never passed true from the public share page or the
  // PDF renderer. See docs/payment-tracking-design.md §6.
  showRecordedBy = false,
}: {
  type: DocumentType;
  number: string;
  issueDate: string;
  dueDate: string | null;
  validUntil: string | null;
  paymentTerms: string | null;
  validityTerms: string | null;
  notes: string | null;
  termsText: string | null;
  referenceNumber: string | null;
  currency: string;
  inrExchangeRate: number | null;
  lutDeclarationText: string | null;
  // E-invoicing (IRP/GST) — scaffolding only, see
  // lib/einvoice/buildIrpPayload.ts's own comment. Shown whenever `irn`
  // is set, regardless of document type — in practice only ever set on
  // an invoice (nothing generates one for any other type).
  irn: string | null;
  irnAckNo: string | null;
  irnAckDate: string | null;
  einvoiceQrCode: string | null;
  fontSize: number | null;
  business: BusinessSnapshot;
  customer: CustomerSnapshot;
  customFieldValues: CustomFieldValueSnapshot[];
  lineItems: PreviewLineItem[];
  totals: PreviewTotals;
  payments: PreviewPayment[];
  amountPaid: number;
  remainingBalance: number;
  creditBalance: number;
  gstEnabled: boolean;
  appearance: PreviewAppearance;
  showRecordedBy?: boolean;
}) {
  const isQuotation = type === "quotation";
  const isInvoice = type === "invoice";
  const documentTypeLabel =
    type === "quotation" ? "QUOTATION" : type === "proforma" ? "PROFORMA INVOICE" : "INVOICE";
  const style = templateStyle(appearance.template, appearance.accentColor);
  const isCompact = appearance.template === "compact";
  const showGstinRow = gstEnabled && appearance.showGstinRow;
  const showTax = gstEnabled && appearance.showTax;
  const secondaryDate = isQuotation ? validUntil : dueDate;
  const terms = isQuotation ? validityTerms : paymentTerms;
  const bankLines = paymentDetailsLines(business);
  const sameState = isSameState(business.placeOfSupply, customer.state);
  const taxBuckets = showTax ? groupTaxByRate(lineItems, sameState) : [];
  const lineItemColumns = resolveLineItemColumns(lineItems);
  const isForeignCurrency = currency !== "INR";
  // The stage-4 per-line FX columns are for mixed-currency INR
  // documents (a line priced in a foreign currency, document still
  // settles in INR) — once the document's own currency is already
  // foreign, those columns would be redundant with the RATE column
  // itself, so they're not shown here at all.
  const fxRateLabel = isForeignCurrency
    ? null
    : resolveForeignCurrencyRateLabel(lineItems);
  const identityLine = businessIdentityLine(business);
  // Zero-rated export under LUT: every taxable line is 0%, so
  // groupTaxByRate (which skips 0%/null rows entirely) returns no
  // buckets — show one explicit row instead of just silently omitting
  // the section.
  const showLutZeroRow = showTax && isForeignCurrency && taxBuckets.length === 0;
  const showInrSubline =
    isForeignCurrency && appearance.showInrEquivalent && inrExchangeRate != null;
  function inrEquivalent(amount: number): string {
    return formatCurrency(amount * (inrExchangeRate ?? 0), "INR");
  }
  const scale = (fontSize ?? DEFAULT_FONT_SIZE) / DEFAULT_FONT_SIZE;

  return (
    <div
      className="w-full overflow-hidden bg-white text-[#0E1220] shadow-[0_8px_40px_rgba(16,24,40,0.10)]"
      style={
        {
          maxWidth: 794,
          minHeight: 1123,
          "--doc-scale": scale,
        } as CSSProperties
      }
    >
      {appearance.template === "modern" && (
        <div className="h-2.5" style={{ background: appearance.accentColor }} />
      )}

      <div className={isCompact ? "px-10 pt-9 pb-9" : "px-14 pt-14 pb-14"}>
        <div className="flex items-start justify-between gap-8">
          <div>
            {appearance.showLogo && business.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.logoUrl}
                alt={business.name}
                className="mb-4 h-10 max-w-[160px] object-contain object-left"
              />
            )}
            <div className="text-[length:calc(var(--doc-scale)*19px)] font-bold tracking-tight">{business.name}</div>
            <div className="mt-1.5 text-[length:calc(var(--doc-scale)*12.5px)] leading-relaxed text-[#565E72]">
              {[business.address, [business.city, business.state].filter(Boolean).join(", ")]
                .filter(Boolean)
                .map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              <div>
                {[business.email, business.phone].filter(Boolean).join(" · ")}
              </div>
            </div>
            {showGstinRow && business.gstin && (
              <div className="mt-1.5 font-mono text-[length:calc(var(--doc-scale)*11.5px)] text-[#565E72]">
                GSTIN {business.gstin}
              </div>
            )}
            {identityLine && (
              <div className="mt-1.5 font-mono text-[length:calc(var(--doc-scale)*11.5px)] text-[#565E72]">
                {identityLine}
              </div>
            )}
          </div>
          <div className="text-right">
            <div
              className="text-[length:calc(var(--doc-scale)*26px)] font-bold tracking-[0.12em]"
              style={{ color: style.docTitleColor }}
            >
              {documentTypeLabel}
              {isForeignCurrency && (
                <span
                  className="ml-2 align-middle text-[length:calc(var(--doc-scale)*12px)] font-bold tracking-[0.06em]"
                  style={{ color: style.docTitleColor }}
                >
                  {currency}
                </span>
              )}
            </div>
            <div className="mt-2 font-mono text-[length:calc(var(--doc-scale)*13px)] text-[#3D4453]">{number}</div>
            <div className="mt-2.5 text-[length:calc(var(--doc-scale)*12.5px)] leading-loose text-[#565E72]">
              <div>
                {isQuotation ? "Issue date" : "Invoice date"}: {formatDate(issueDate)}
              </div>
              <div>
                {isQuotation ? "Valid until" : "Due date"}:{" "}
                {secondaryDate ? formatDate(secondaryDate) : "—"}
              </div>
            </div>
            {irn && (
              <div className="mt-2.5 max-w-[220px] text-[length:calc(var(--doc-scale)*11px)] leading-relaxed text-[#565E72]">
                <div className="font-mono break-all">
                  <span className="font-bold text-[#0E1220]">IRN: </span>
                  {irn}
                </div>
                {irnAckNo && <div>Ack No: {irnAckNo}</div>}
                {irnAckDate && <div>Ack Date: {irnAckDate}</div>}
              </div>
            )}
          </div>
        </div>

        <div className={isCompact ? "my-5 h-px bg-[#E7E9EF]" : "my-8 h-px bg-[#E7E9EF]"} />

        <div className="flex flex-wrap gap-12">
          <div>
            <div className="text-[length:calc(var(--doc-scale)*10.5px)] font-bold tracking-[0.1em] text-[#8A92A6]">
              BILL TO
            </div>
            <div className="mt-2 text-[length:calc(var(--doc-scale)*14px)] font-semibold">{customer.name}</div>
            <div className="mt-1 text-[length:calc(var(--doc-scale)*12.5px)] leading-relaxed text-[#565E72]">
              {customer.company && <div>{customer.company}</div>}
              {customer.address && <div>{customer.address}</div>}
              {[customer.city, customer.state].filter(Boolean).length > 0 && (
                <div>{[customer.city, customer.state].filter(Boolean).join(", ")}</div>
              )}
              {(customer.email || customer.phone) && (
                <div>{[customer.email, customer.phone].filter(Boolean).join(" · ")}</div>
              )}
              {customer.gstin && <div className="font-mono">GSTIN {customer.gstin}</div>}
            </div>
          </div>
          <div>
            <div className="text-[length:calc(var(--doc-scale)*10.5px)] font-bold tracking-[0.1em] text-[#8A92A6]">
              REFERENCE
            </div>
            <div className="mt-2 text-[length:calc(var(--doc-scale)*12.5px)] leading-relaxed text-[#565E72]">
              <div>
                {isQuotation ? "Validity" : "Payment terms"}: {terms || "—"}
              </div>
              <div>Currency: {currency}</div>
              {appearance.showReferenceNumber && referenceNumber && (
                <div>Reference number: {referenceNumber}</div>
              )}
            </div>
          </div>
        </div>

        {/* Full document width, not squeezed into the REFERENCE column
            above — a long label+value pair (e.g. "Vessel/Voyage No: ...")
            needs more than half of one column's worth of room. */}
        {customFieldValues.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-0.5 text-[length:calc(var(--doc-scale)*12.5px)] leading-relaxed text-[#565E72]">
            {[...customFieldValues]
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((entry) => (
                <div key={entry.definitionId}>
                  {entry.label}: {formatCustomFieldValue(entry)}
                </div>
              ))}
          </div>
        )}

        <div className={isCompact ? "mt-5" : "mt-8"}>
          <div
            className={
              isCompact
                ? "flex px-3 py-1.5 text-[length:calc(var(--doc-scale)*9.5px)] font-bold tracking-[0.06em]"
                : "flex px-3 py-2.5 text-[length:calc(var(--doc-scale)*10.5px)] font-bold tracking-[0.06em]"
            }
            style={{
              background: style.tableHeadBg,
              color: style.tableHeadColor,
              borderBottom: style.tableHeadBorder,
            }}
          >
            <div className="flex-1">DESCRIPTION</div>
            {lineItemColumns.map((column) => (
              <div key={column.id} className="w-24 px-2">
                {column.label.toUpperCase()}
              </div>
            ))}
            {fxRateLabel && (
              <>
                <div className="w-24 px-2 text-right">
                  {fxRateLabel.toUpperCase()}
                </div>
                <div className="w-20 px-2 text-right">EXCH. RATE</div>
              </>
            )}
            <div className="w-16 text-right">QTY</div>
            <div className="w-24 text-right">RATE</div>
            {showTax && <div className="w-16 text-right">TAX</div>}
            <div className="w-28 text-right">AMOUNT</div>
          </div>
          {lineItems.map((item, index) => (
            <div
              key={index}
              className={
                isCompact
                  ? "flex border-b border-[#F3F4F7] px-3 py-1.5 text-[length:calc(var(--doc-scale)*12px)]"
                  : "flex border-b border-[#F3F4F7] px-3 py-2 text-[length:calc(var(--doc-scale)*13px)]"
              }
            >
              <div className="flex-1 pr-4">
                <div className="font-semibold">{item.name}</div>
                {item.description && (
                  <div className="mt-0.5 text-[length:calc(var(--doc-scale)*12px)] text-[#7E869A]">
                    {item.description}
                  </div>
                )}
              </div>
              {lineItemColumns.map((column) => {
                const entry = item.customFieldValues.find(
                  (v) => v.definitionId === column.id,
                );
                return (
                  <div key={column.id} className="w-24 px-2 text-[#3D4453]">
                    {entry ? formatCustomFieldValue(entry) : "—"}
                  </div>
                );
              })}
              {fxRateLabel && (
                <>
                  <div className="w-24 px-2 text-right text-[#3D4453]">
                    {item.foreignRate != null ? item.foreignRate : "—"}
                  </div>
                  <div className="w-20 px-2 text-right text-[#3D4453]">
                    {item.exchangeRate != null ? item.exchangeRate : "—"}
                  </div>
                </>
              )}
              <div className="w-16 text-right">{item.qty}</div>
              <div className="w-24 text-right">{formatCurrency(item.rate, currency)}</div>
              {showTax && (
                <div className="w-16 text-right text-[#565E72]">
                  {item.gstRate != null ? `${item.gstRate}%` : "—"}
                </div>
              )}
              <div className="w-28 text-right font-semibold">
                {formatCurrency(item.amount, currency)}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end">
          <div className="w-80">
            <TotalRow label="Subtotal" value={formatCurrency(totals.subtotal, currency)} />
            {showInrSubline && (
              <TotalRow
                label=""
                value={`≈ ${inrEquivalent(totals.subtotal)}`}
                muted
              />
            )}
            <TotalRow
              label="Discount"
              value={`− ${formatCurrency(totals.discountTotal, currency)}`}
            />
            {showTax && (
              <>
                <TotalRow
                  label="Taxable amount"
                  value={formatCurrency(totals.taxableAmount, currency)}
                />
                {showLutZeroRow && (
                  <TotalRow
                    label="IGST @0% (Zero-rated — Export under LUT)"
                    value={formatCurrency(0, currency)}
                  />
                )}
                {taxBuckets.map((bucket) => {
                  // Only one rate in use (the overwhelmingly common
                  // case) renders identically to before this fix — the
                  // per-rate suffix only appears once there's a second
                  // bucket to actually distinguish it from.
                  const suffix = taxBuckets.length > 1 ? ` @${bucket.rate}%` : "";
                  return (
                    <Fragment key={bucket.rate}>
                      {bucket.cgst > 0 && (
                        <TotalRow
                          label={`CGST${suffix}`}
                          value={formatCurrency(bucket.cgst, currency)}
                        />
                      )}
                      {bucket.sgst > 0 && (
                        <TotalRow
                          label={`SGST${suffix}`}
                          value={formatCurrency(bucket.sgst, currency)}
                        />
                      )}
                      {bucket.igst > 0 && (
                        <TotalRow
                          label={`IGST${suffix}`}
                          value={formatCurrency(bucket.igst, currency)}
                        />
                      )}
                    </Fragment>
                  );
                })}
              </>
            )}
            <div
              className="mt-2 flex items-baseline justify-between px-3 py-3"
              style={{
                background: style.totalRowBg,
                borderTop: style.totalRowBorder,
                borderBottom: style.totalRowBorder,
              }}
            >
              <span
                className="text-[length:calc(var(--doc-scale)*12px)] font-bold tracking-[0.06em]"
                style={{ color: style.totalRowColor }}
              >
                GRAND TOTAL
              </span>
              <span
                className="text-[length:calc(var(--doc-scale)*19px)] font-bold"
                style={{ color: style.totalRowColor }}
              >
                {formatCurrency(totals.total, currency)}
              </span>
            </div>
            {showInrSubline && (
              <div className="flex justify-between px-3 pt-1 text-[length:calc(var(--doc-scale)*12px)] text-[#8A92A6]">
                <span>INR equivalent</span>
                <span>{inrEquivalent(totals.total)}</span>
              </div>
            )}
            {isInvoice && (
              <div className="flex justify-between px-3 pt-2 text-[length:calc(var(--doc-scale)*13px)]">
                <span className="text-[#565E72]">
                  {creditBalance > 0 ? "Credit balance" : "Balance due"}
                </span>
                <span className="font-semibold">
                  {formatCurrency(
                    creditBalance > 0 ? creditBalance : remainingBalance,
                    currency,
                  )}
                </span>
              </div>
            )}
          </div>
        </div>

        {isInvoice && payments.length > 0 && (
          <div className="mt-8">
            <div className="text-[length:calc(var(--doc-scale)*10.5px)] font-bold tracking-[0.1em] text-[#8A92A6]">
              PAYMENTS
            </div>
            <div className="mt-1.5 flex justify-between text-[length:calc(var(--doc-scale)*12.5px)] leading-relaxed text-[#3D4453]">
              <span>Amount paid: {formatCurrency(amountPaid, currency)}</span>
              <span>
                {creditBalance > 0
                  ? `Credit balance: ${formatCurrency(creditBalance, currency)}`
                  : remainingBalance > 0
                    ? `Remaining: ${formatCurrency(remainingBalance, currency)}`
                    : "Fully paid"}
              </span>
            </div>
            <div className="mt-2 divide-y divide-[#E7E9EF] border-y border-[#E7E9EF]">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex justify-between gap-4 py-1.5 text-[length:calc(var(--doc-scale)*12px)] text-[#565E72]"
                >
                  <span>{formatDate(payment.paidAt)}</span>
                  <span className="flex-1 truncate">
                    {payment.note}
                    {showRecordedBy && payment.recordedByName
                      ? ` — ${payment.recordedByName}`
                      : ""}
                  </span>
                  <span className="font-mono">
                    {formatCurrency(payment.amount, currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {appearance.showNotes && notes && (
          <div className="mt-8">
            <div className="text-[length:calc(var(--doc-scale)*10.5px)] font-bold tracking-[0.1em] text-[#8A92A6]">
              NOTES
            </div>
            <div className="mt-1.5 text-[length:calc(var(--doc-scale)*12.5px)] leading-relaxed whitespace-pre-line text-[#3D4453]">
              {notes}
            </div>
          </div>
        )}
        {appearance.showTerms && termsText && (
          <div className="mt-5">
            <div className="text-[length:calc(var(--doc-scale)*10.5px)] font-bold tracking-[0.1em] text-[#8A92A6]">
              TERMS &amp; CONDITIONS
            </div>
            <div className="mt-1.5 text-[length:calc(var(--doc-scale)*12.5px)] leading-relaxed whitespace-pre-line text-[#3D4453]">
              {termsText}
            </div>
          </div>
        )}
        {isForeignCurrency && lutDeclarationText && (
          <div className="mt-5">
            <div className="text-[length:calc(var(--doc-scale)*10.5px)] font-bold tracking-[0.1em] text-[#8A92A6]">
              EXPORT DECLARATION
            </div>
            <div className="mt-1.5 text-[length:calc(var(--doc-scale)*12.5px)] leading-relaxed whitespace-pre-line text-[#3D4453]">
              {lutDeclarationText}
            </div>
          </div>
        )}
        {appearance.showPayment && (
          <div className="mt-5 border border-[#EEF0F5] bg-[#FAFBFC] p-3.5">
            <div className="text-[length:calc(var(--doc-scale)*10.5px)] font-bold tracking-[0.1em] text-[#8A92A6]">
              PAYMENT DETAILS
            </div>
            <div className="mt-1.5 font-mono text-[length:calc(var(--doc-scale)*11.5px)] leading-loose text-[#3D4453]">
              {business.name}
            </div>
            {bankLines.length > 0 && (
              <div className="mt-1.5 font-mono text-[length:calc(var(--doc-scale)*11.5px)] leading-loose text-[#3D4453]">
                {bankLines.map((line) => (
                  <div key={line.label}>
                    {line.label}: {line.value}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {appearance.showSignature &&
          (business.signatureImageUrl || business.signatureSignatoryName) && (
            <div className="mt-8 flex justify-end">
              <div className="flex flex-col items-end gap-1 text-right">
                <div className="text-[length:calc(var(--doc-scale)*9px)] font-bold tracking-[0.1em] text-[#8A92A6]">
                  AUTHORISED SIGNATORY
                </div>
                {business.signatureImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL
                  <img
                    src={business.signatureImageUrl}
                    alt="Signature"
                    className="mt-1 h-10 max-w-[160px] object-contain object-right"
                  />
                )}
                {business.signatureSignatoryName && (
                  <div className="mt-1 text-[length:calc(var(--doc-scale)*12px)] text-[#0E1220]">
                    {business.signatureSignatoryName}
                  </div>
                )}
                {business.signatureDesignation && (
                  <div className="text-[length:calc(var(--doc-scale)*10px)] text-[#8A92A6]">
                    {business.signatureDesignation}
                  </div>
                )}
              </div>
            </div>
          )}

        {einvoiceQrCode && (
          <div className="mt-6 flex justify-end">
            <div className="flex flex-col items-center gap-1">
              <QRCodeSVG value={einvoiceQrCode} size={96} level="M" />
              <span className="text-[length:calc(var(--doc-scale)*9px)] text-[#8A92A6]">
                e-Invoice QR
              </span>
            </div>
          </div>
        )}

        <div className="mt-10 flex justify-between border-t border-[#EEF0F5] pt-4 text-[length:calc(var(--doc-scale)*11.5px)] text-[#8A92A6]">
          <span>
            {business.name}
            {business.website ? ` · ${business.website}` : ""}
          </span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}

function TotalRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className={
        muted
          ? "flex justify-between px-3 pb-1 text-[length:calc(var(--doc-scale)*11.5px)] text-[#8A92A6]"
          : "flex justify-between px-3 py-1.5 text-[length:calc(var(--doc-scale)*13px)]"
      }
    >
      <span className={muted ? undefined : "text-[#565E72]"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}
