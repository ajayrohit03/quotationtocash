import type { DocumentType } from "@prisma/client";
import { formatDateIST } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import type {
  BusinessSnapshot,
  CustomerSnapshot,
} from "@/lib/documents/snapshots";
import type {
  PreviewAppearance,
  PreviewLineItem,
  PreviewTotals,
} from "./preview-types";

function formatDate(iso: string): string {
  return formatDateIST(iso, { day: "2-digit", month: "short", year: "numeric" });
}

// Per-template colors, mirroring the design reference's renderVals():
// classic = dark header band, modern = accent top bar + soft gray header,
// minimal = no color blocks anywhere except the total row's neutral tint.
function templateStyle(template: PreviewAppearance["template"], accentColor: string) {
  return {
    docTitleColor: template === "minimal" ? "#0E1220" : accentColor,
    tableHeadBg:
      template === "minimal" ? "#fff" : template === "classic" ? "#0E1220" : "#F3F4F7",
    tableHeadColor:
      template === "classic" ? "#fff" : template === "minimal" ? "#8A92A6" : "#3D4453",
    totalRowBg: template === "minimal" ? "#F6F7F9" : accentColor,
    totalRowColor: template === "minimal" ? "#0E1220" : "#fff",
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
  currency,
  business,
  customer,
  lineItems,
  totals,
  gstEnabled,
  appearance,
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
  currency: string;
  business: BusinessSnapshot;
  customer: CustomerSnapshot;
  lineItems: PreviewLineItem[];
  totals: PreviewTotals;
  gstEnabled: boolean;
  appearance: PreviewAppearance;
}) {
  const isQuotation = type === "quotation";
  const style = templateStyle(appearance.template, appearance.accentColor);
  const showGstinRow = gstEnabled && appearance.showGstinRow;
  const showTax = gstEnabled && appearance.showTax;
  const secondaryDate = isQuotation ? validUntil : dueDate;
  const terms = isQuotation ? validityTerms : paymentTerms;

  return (
    <div
      className="w-full overflow-hidden bg-white text-[#0E1220] shadow-[0_8px_40px_rgba(16,24,40,0.10)]"
      style={{ maxWidth: 794, minHeight: 1123 }}
    >
      {appearance.template === "modern" && (
        <div className="h-2.5" style={{ background: appearance.accentColor }} />
      )}

      <div className="px-14 pt-14 pb-14">
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
            <div className="text-[19px] font-bold tracking-tight">{business.name}</div>
            <div className="mt-1.5 text-[12.5px] leading-relaxed text-[#565E72]">
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
              <div className="mt-1.5 font-mono text-[11.5px] text-[#565E72]">
                GSTIN {business.gstin}
              </div>
            )}
          </div>
          <div className="text-right">
            <div
              className="text-[26px] font-bold tracking-[0.12em]"
              style={{ color: style.docTitleColor }}
            >
              {isQuotation ? "QUOTATION" : "INVOICE"}
            </div>
            <div className="mt-2 font-mono text-[13px] text-[#3D4453]">{number}</div>
            <div className="mt-2.5 text-[12.5px] leading-loose text-[#565E72]">
              <div>
                {isQuotation ? "Issue date" : "Invoice date"}: {formatDate(issueDate)}
              </div>
              <div>
                {isQuotation ? "Valid until" : "Due date"}:{" "}
                {secondaryDate ? formatDate(secondaryDate) : "—"}
              </div>
            </div>
          </div>
        </div>

        <div className="my-8 h-px bg-[#E7E9EF]" />

        <div className="flex flex-wrap gap-12">
          <div>
            <div className="text-[10.5px] font-bold tracking-[0.1em] text-[#8A92A6]">
              BILL TO
            </div>
            <div className="mt-2 text-sm font-semibold">{customer.name}</div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-[#565E72]">
              {customer.company && <div>{customer.company}</div>}
              {customer.address && <div>{customer.address}</div>}
              {[customer.city, customer.state].filter(Boolean).length > 0 && (
                <div>{[customer.city, customer.state].filter(Boolean).join(", ")}</div>
              )}
              {(customer.email || customer.phone) && (
                <div>{[customer.email, customer.phone].filter(Boolean).join(" · ")}</div>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] font-bold tracking-[0.1em] text-[#8A92A6]">
              REFERENCE
            </div>
            <div className="mt-2 text-[12.5px] leading-relaxed text-[#565E72]">
              <div>
                {isQuotation ? "Validity" : "Payment terms"}: {terms || "—"}
              </div>
              <div>Currency: {currency}</div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <div
            className="flex px-3 py-2.5 text-[10.5px] font-bold tracking-[0.06em]"
            style={{ background: style.tableHeadBg, color: style.tableHeadColor }}
          >
            <div className="flex-1">DESCRIPTION</div>
            <div className="w-16 text-right">QTY</div>
            <div className="w-24 text-right">RATE</div>
            {showTax && <div className="w-16 text-right">TAX</div>}
            <div className="w-28 text-right">AMOUNT</div>
          </div>
          {lineItems.map((item, index) => (
            <div
              key={index}
              className="flex border-b border-[#F3F4F7] px-3 py-3.5 text-[13px]"
            >
              <div className="flex-1 pr-4">
                <div className="font-semibold">{item.name}</div>
                {item.description && (
                  <div className="mt-0.5 text-xs text-[#7E869A]">
                    {item.description}
                  </div>
                )}
              </div>
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
                {totals.cgst > 0 && (
                  <TotalRow label="CGST" value={formatCurrency(totals.cgst, currency)} />
                )}
                {totals.sgst > 0 && (
                  <TotalRow label="SGST" value={formatCurrency(totals.sgst, currency)} />
                )}
                {totals.igst > 0 && (
                  <TotalRow label="IGST" value={formatCurrency(totals.igst, currency)} />
                )}
              </>
            )}
            <div
              className="mt-2 flex items-baseline justify-between px-3 py-3"
              style={{ background: style.totalRowBg }}
            >
              <span
                className="text-xs font-bold tracking-[0.06em]"
                style={{ color: style.totalRowColor }}
              >
                GRAND TOTAL
              </span>
              <span
                className="text-[19px] font-bold"
                style={{ color: style.totalRowColor }}
              >
                {formatCurrency(totals.total, currency)}
              </span>
            </div>
            {!isQuotation && (
              <div className="flex justify-between px-3 pt-2 text-[13px]">
                <span className="text-[#565E72]">Balance due</span>
                <span className="font-semibold">
                  {formatCurrency(totals.total, currency)}
                </span>
              </div>
            )}
          </div>
        </div>

        {appearance.showNotes && notes && (
          <div className="mt-8">
            <div className="text-[10.5px] font-bold tracking-[0.1em] text-[#8A92A6]">
              NOTES
            </div>
            <div className="mt-1.5 text-[12.5px] leading-relaxed whitespace-pre-line text-[#3D4453]">
              {notes}
            </div>
          </div>
        )}
        {appearance.showTerms && termsText && (
          <div className="mt-5">
            <div className="text-[10.5px] font-bold tracking-[0.1em] text-[#8A92A6]">
              TERMS &amp; CONDITIONS
            </div>
            <div className="mt-1.5 text-[12.5px] leading-relaxed whitespace-pre-line text-[#3D4453]">
              {termsText}
            </div>
          </div>
        )}
        {appearance.showPayment && (
          <div className="mt-5 border border-[#EEF0F5] bg-[#FAFBFC] p-3.5">
            <div className="text-[10.5px] font-bold tracking-[0.1em] text-[#8A92A6]">
              PAYMENT DETAILS
            </div>
            <div className="mt-1.5 font-mono text-[11.5px] leading-loose text-[#3D4453]">
              {[business.name, business.email, business.phone].filter(Boolean).join(" · ")}
            </div>
          </div>
        )}

        <div className="mt-10 flex justify-between border-t border-[#EEF0F5] pt-4 text-[11.5px] text-[#8A92A6]">
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

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-3 py-1.5 text-[13px]">
      <span className="text-[#565E72]">{label}</span>
      <span>{value}</span>
    </div>
  );
}
