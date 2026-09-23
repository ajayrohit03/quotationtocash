import { Document, Page, View, Text, Image, StyleSheet, Font } from "@react-pdf/renderer";
import { formatDateIST } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import type { PreviewDocument } from "@/components/documents/preview-types";
import { paymentDetailsLines } from "@/lib/documents/payment-details";
import { formatCustomFieldValue } from "@/lib/documents/custom-fields";
import { isSameState } from "@/lib/tax/calculateGST";
import { groupTaxByRate } from "@/lib/tax/groupTaxByRate";
import {
  resolveLineItemColumns,
  resolveForeignCurrencyRateLabel,
} from "@/lib/documents/line-item-columns";
import { businessIdentityLine } from "@/lib/documents/business-identity";

// react-pdf hyphenates any word that overflows its container by default
// (via the bundled `hyphen` package's syllable-break patterns) — no
// hyphenationCallback was ever registered, so this was silently on the
// whole time, producing broken-looking output like "EMER-GENCY" and
// "CHIT-TAGONG" in narrow columns instead of just wrapping at a space.
// Registering a callback that returns the word as a single, unsplit
// part (not an empty array — an empty array is zero valid word parts,
// not "one unbreakable part") disables hyphenation globally for every
// <Text> in the document, matching the web preview's plain word-wrap.
Font.registerHyphenationCallback((word) => [word]);

// What looked like a QTY/RATE font-size or baseline mismatch (confirmed
// by pixel-measuring a rendered PDF NOT to be one — every cell's text
// top aligns identically) was actually this: Helvetica, react-pdf's
// base font throughout this file, has no glyph for ₹ (U+20B9), so
// pdfkit silently substituted a fallback mark that rendered as a small
// blob raised above the baseline, glued to the first digit — visually
// indistinguishable from superscript text at a glance. A prior fix
// worked around this by swapping the ₹ symbol for the text "Rs." in
// the PDF only; this replaces that workaround with the real fix —
// Noto Sans actually contains the ₹ glyph (confirmed via fontTools:
// cmap[0x20B9] == "uni20B9"), so registering it and using it as this
// document's base font renders the genuine symbol instead of avoiding
// it. Only Regular/Bold are registered — nothing in this renderer uses
// italic. Applied as the page's own fontFamily (not just wherever a
// currency amount happens to render) so no element in the table
// switches fonts mid-row; TTF direct URLs, not woff2 — react-pdf's
// font loader wants a URL it can fetch and parse as a single static
// font file, and Google's default (non-browser) UA response for this
// family happens to be one non-subsetted TTF per weight, which is
// simpler and more reliable here than juggling unicode-range subsets.
Font.register({
  family: "Noto Sans",
  fonts: [
    {
      src: "https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyD9A99d.ttf",
      fontWeight: "normal",
    },
    {
      src: "https://fonts.gstatic.com/s/notosans/v42/o-0mIpQlx3QUlC5A4PNB6Ryti20_6n1iPHjcz6L1SoM-jCpoiyAaBN9d.ttf",
      fontWeight: "bold",
    },
  ],
});

// Mirrors components/documents/document-render.tsx section-for-section —
// same data, same conditionals — but react-pdf can't render arbitrary
// HTML/CSS, so it's a parallel implementation built from its own
// View/Text/StyleSheet primitives rather than a shared component. Spec:
// "changes apply live to the preview and the exported PDF" — keep the two
// in sync by hand when either one's layout logic changes.
const COLORS = {
  ink: "#0E1220",
  body: "#565E72",
  muted: "#8A92A6",
  faint: "#7E869A",
  border: "#E7E9EF",
  rowBorder: "#F3F4F7",
  paymentBg: "#FAFBFC",
  paymentBorder: "#EEF0F5",
};

// The neutral scale point every fontSize below pivots on — a document
// with fontSize null (or === this value) renders pixel-identical to
// before this feature. Kept in sync by hand with
// components/documents/document-render.tsx's own copy (a shared
// constant would need a shared module neither file otherwise needs —
// see that file's DEFAULT_FONT_SIZE comment) and
// document-preview.tsx's DEFAULT_FONT_SIZE.
const DEFAULT_FONT_SIZE = 9;

// Turned into a function of the document's own fontSize (see
// DEFAULT_FONT_SIZE above) rather than a single static StyleSheet.create
// call, so every Text in the document scales together — this is the
// direct "multiply every Text component's font size" half of the
// font-size feature; document-render.tsx's half is a CSS custom
// property instead, since it isn't constrained to a fixed literal page
// width the way A4 output is. Only fontSize values scale; padding/
// margin/width stay fixed so column layout doesn't shift underneath the
// widths tuned elsewhere in this file — a smaller font just leaves more
// breathing room in the same boxes, which is the whole point.
function createStyles(scale: number) {
  const fs = (px: number) => px * scale;
  // Vertical rhythm (paddingVertical/marginTop/marginVertical) scales
  // too, not just glyph size — a smaller font with unchanged gaps
  // barely reclaims any page space, which defeats the whole point of
  // this control ("reduce to 8pt and everything fits"). Horizontal
  // padding, column widths, and the page's own outer padding stay
  // fixed — those aren't what's fighting for vertical room on a tall
  // line-item table.
  const sp = (px: number) => px * scale;
  return StyleSheet.create({
    page: {
      padding: sp(40),
      fontSize: fs(9.5),
      fontFamily: "Noto Sans",
      color: COLORS.ink,
    },
    topBar: { height: 7 },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    businessName: { fontSize: fs(14), fontFamily: "Noto Sans", fontWeight: "bold" },
    addressLine: { fontSize: fs(9), color: COLORS.body, marginTop: sp(2), lineHeight: 1.4 },
    gstinLine: {
      fontSize: fs(8.5),
      color: COLORS.body,
      marginTop: sp(4),
      fontFamily: "Courier",
    },
    logo: { width: 90, height: 32, marginBottom: 10, objectFit: "contain" },
    docTitle: {
      fontSize: fs(19),
      fontFamily: "Noto Sans",
      fontWeight: "bold",
      letterSpacing: 1.5,
    },
    docNumber: {
      fontSize: fs(9.5),
      marginTop: sp(6),
      fontFamily: "Courier",
      color: "#3D4453",
    },
    docDates: { fontSize: fs(9), color: COLORS.body, marginTop: sp(8), lineHeight: 1.6 },
    divider: { height: 1, backgroundColor: COLORS.border, marginVertical: sp(11) },
    refRow: { flexDirection: "row", gap: 32 },
    sectionLabel: {
      fontSize: fs(7.5),
      fontFamily: "Noto Sans",
      fontWeight: "bold",
      letterSpacing: 1,
      color: COLORS.muted,
    },
    billToName: {
      fontSize: fs(10),
      fontFamily: "Noto Sans",
      fontWeight: "bold",
      marginTop: sp(6),
    },
    // One size smaller than the rest of the document (7/6.5 vs the
    // 7.5/9 the header/reference/totals blocks use) — the table is the
    // widest, most column-hungry part of the page (up to 8 columns with
    // FX rates + custom fields), so it's the part that actually needs
    // the extra room; shrinking only it, rather than the whole
    // document, gets DESCRIPTION out of wrapping at the default 7pt
    // size without needing every other block a size smaller too.
    tableHead: {
      flexDirection: "row",
      paddingVertical: sp(4),
      paddingHorizontal: 6,
      fontSize: fs(6.5),
      fontFamily: "Noto Sans",
      fontWeight: "bold",
      letterSpacing: 0.5,
    },
    tableRow: {
      flexDirection: "row",
      paddingVertical: sp(3),
      paddingHorizontal: 6,
      borderBottomWidth: 1,
      borderBottomColor: COLORS.rowBorder,
      fontSize: fs(8),
    },
    itemName: { fontSize: fs(8), fontFamily: "Noto Sans", fontWeight: "bold" },
    itemDesc: { fontSize: fs(6.5), color: COLORS.faint, marginTop: sp(1) },
    totalsBlock: { width: 230, marginLeft: "auto", marginTop: sp(5) },
    totalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: sp(3),
      paddingHorizontal: 6,
      fontSize: fs(9),
    },
    totalLabel: { color: COLORS.body },
    grandTotalRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      marginTop: sp(4),
      padding: sp(6),
    },
    grandTotalLabel: {
      fontSize: fs(8),
      fontFamily: "Noto Sans",
      fontWeight: "bold",
      letterSpacing: 0.5,
    },
    grandTotalValue: { fontSize: fs(13), fontFamily: "Noto Sans", fontWeight: "bold" },
    noteBlock: { marginTop: sp(7) },
    noteBody: { fontSize: fs(9), color: "#3D4453", marginTop: sp(4), lineHeight: 1.5 },
    paymentBlock: {
      marginTop: sp(6),
      padding: sp(6),
      backgroundColor: COLORS.paymentBg,
      borderWidth: 1,
      borderColor: COLORS.paymentBorder,
    },
    footer: {
      marginTop: 28,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: COLORS.paymentBorder,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: fs(8),
      color: COLORS.muted,
    },
  });
}

function templateStyle(template: PreviewDocument["template"], accentColor: string) {
  if (template === "formal") {
    return {
      docTitleColor: COLORS.ink,
      tableHeadBg: "#ffffff",
      tableHeadColor: COLORS.ink,
      tableHeadBorderWidth: 1.5,
      totalRowBg: "#ffffff",
      totalRowColor: COLORS.ink,
      totalRowBorderWidth: 1.5,
    };
  }
  return {
    docTitleColor: template === "minimal" ? COLORS.ink : accentColor,
    tableHeadBg:
      template === "minimal" ? "#ffffff" : template === "classic" ? COLORS.ink : "#F3F4F7",
    tableHeadColor:
      template === "classic" ? "#ffffff" : template === "minimal" ? COLORS.muted : "#3D4453",
    tableHeadBorderWidth: 0,
    totalRowBg: template === "minimal" ? "#F6F7F9" : accentColor,
    totalRowColor: template === "minimal" ? COLORS.ink : "#ffffff",
    totalRowBorderWidth: 0,
  };
}

export function DocumentPdf({
  document,
  gstEnabled,
  qrCodeDataUrl,
}: {
  document: PreviewDocument;
  gstEnabled: boolean;
  // Pre-rendered PNG data URI for document.einvoiceQrCode, generated by
  // lib/pdf/render.tsx before this component mounts — react-pdf's
  // <Image> needs a URI it can hand to its own image decoder, and QR
  // encoding (the `qrcode` package) is async, which a plain render
  // function can't await. Undefined when there's no QR code to show.
  // See lib/einvoice/buildIrpPayload.ts's own comment on why nothing
  // here is a real IRP-issued code yet.
  qrCodeDataUrl?: string;
}) {
  const isQuotation = document.type === "quotation";
  const isInvoice = document.type === "invoice";
  const documentTypeLabel =
    document.type === "quotation"
      ? "QUOTATION"
      : document.type === "proforma"
        ? "PROFORMA INVOICE"
        : "INVOICE";
  const style = templateStyle(document.template, document.accentColor);
  const isCompact = document.template === "compact";
  const scale = (document.fontSize ?? DEFAULT_FONT_SIZE) / DEFAULT_FONT_SIZE;
  const styles = createStyles(scale);
  const fs = (px: number) => px * scale;
  const showGstinRow = gstEnabled && document.showGstinRow;
  const showTax = gstEnabled && document.showTax;
  const secondaryDate = isQuotation ? document.validUntil : document.dueDate;
  const terms = isQuotation ? document.validityTerms : document.paymentTerms;
  const { business, customer } = document;
  const bankLines = paymentDetailsLines(business);
  const sameState = isSameState(business.placeOfSupply, customer.state);
  const taxBuckets = showTax ? groupTaxByRate(document.lineItems, sameState) : [];
  const lineItemColumns = resolveLineItemColumns(document.lineItems);
  const isForeignCurrency = document.currency !== "INR";
  const fxRateLabel = isForeignCurrency
    ? null
    : resolveForeignCurrencyRateLabel(document.lineItems);
  const identityLine = businessIdentityLine(business);
  const showLutZeroRow = showTax && isForeignCurrency && taxBuckets.length === 0;
  const showInrSubline =
    isForeignCurrency && document.showInrEquivalent && document.inrExchangeRate != null;
  function inrEquivalent(amount: number): string {
    return formatCurrency(amount * (document.inrExchangeRate ?? 0), "INR");
  }

  return (
    <Document title={`${document.number}.pdf`}>
      <Page size="A4" style={styles.page}>
        {document.template === "modern" && (
          <View style={[styles.topBar, { backgroundColor: document.accentColor }]} fixed />
        )}

        <View style={styles.headerRow}>
          <View>
            {document.showLogo && business.logoUrl && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={business.logoUrl} style={styles.logo} />
            )}
            <Text style={styles.businessName}>{business.name}</Text>
            {business.address && <Text style={styles.addressLine}>{business.address}</Text>}
            {[business.city, business.state].filter(Boolean).length > 0 && (
              <Text style={styles.addressLine}>
                {[business.city, business.state].filter(Boolean).join(", ")}
              </Text>
            )}
            <Text style={styles.addressLine}>
              {[business.email, business.phone].filter(Boolean).join("  ·  ")}
            </Text>
            {showGstinRow && business.gstin && (
              <Text style={styles.gstinLine}>GSTIN {business.gstin}</Text>
            )}
            {identityLine && <Text style={styles.gstinLine}>{identityLine}</Text>}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.docTitle, { color: style.docTitleColor }]}>
              {documentTypeLabel}
              {isForeignCurrency && (
                <Text style={{ fontSize: fs(11) }}> {document.currency}</Text>
              )}
            </Text>
            <Text style={styles.docNumber}>{document.number}</Text>
            <Text style={styles.docDates}>
              {isQuotation ? "Issue date" : "Invoice date"}: {formatDateIST(document.issueDate)}
              {"\n"}
              {isQuotation ? "Valid until" : "Due date"}:{" "}
              {secondaryDate ? formatDateIST(secondaryDate) : "—"}
            </Text>
            {document.irn && (
              <View style={{ marginTop: fs(8), width: 180, alignItems: "flex-end" }}>
                <Text
                  style={{
                    fontSize: fs(7),
                    color: COLORS.body,
                    fontFamily: "Courier",
                    textAlign: "right",
                  }}
                >
                  IRN: {document.irn}
                </Text>
                {document.irnAckNo && (
                  <Text style={{ fontSize: fs(7), color: COLORS.body, textAlign: "right" }}>
                    Ack No: {document.irnAckNo}
                  </Text>
                )}
                {document.irnAckDate && (
                  <Text style={{ fontSize: fs(7), color: COLORS.body, textAlign: "right" }}>
                    Ack Date: {document.irnAckDate}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.refRow}>
          <View style={{ width: 200 }}>
            <Text style={styles.sectionLabel}>BILL TO</Text>
            <Text style={styles.billToName}>{customer.name}</Text>
            {customer.company && <Text style={styles.addressLine}>{customer.company}</Text>}
            {customer.address && <Text style={styles.addressLine}>{customer.address}</Text>}
            {[customer.city, customer.state].filter(Boolean).length > 0 && (
              <Text style={styles.addressLine}>
                {[customer.city, customer.state].filter(Boolean).join(", ")}
              </Text>
            )}
            {(customer.email || customer.phone) && (
              <Text style={styles.addressLine}>
                {[customer.email, customer.phone].filter(Boolean).join("  ·  ")}
              </Text>
            )}
            {customer.gstin && (
              <Text style={[styles.addressLine, { fontFamily: "Courier" }]}>
                GSTIN {customer.gstin}
              </Text>
            )}
          </View>
          <View style={{ width: 250 }}>
            <Text style={styles.sectionLabel}>REFERENCE</Text>
            <Text style={styles.addressLine}>
              {isQuotation ? "Validity" : "Payment terms"}: {terms || "—"}
              {"\n"}
              Currency: {document.currency}
              {document.showReferenceNumber && document.referenceNumber && (
                <>
                  {"\n"}
                  Reference number: {document.referenceNumber}
                </>
              )}
            </Text>
            {/* One field per line, at the full 250pt column width —
                not a 2-up sub-grid (that halved the usable width to
                ~120pt, which is what caused a long label+value pair
                like "Vessel/Voyage No: ZHONG PENG YOU YI 26067S" to
                wrap badly) and not pulled out into its own full-page-
                width block below (that put Bill To and Reference's
                content in two sequential vertical blocks instead of
                one side-by-side row, actually costing *more* total
                height than the sub-grid it replaced). */}
            {document.customFieldValues.length > 0 && (
              <View style={{ marginTop: fs(4) }}>
                {[...document.customFieldValues]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((entry) => (
                    <Text
                      key={entry.definitionId}
                      style={[styles.addressLine, { marginTop: 2 }]}
                    >
                      {`${entry.label}: ${formatCustomFieldValue(entry)}`}
                    </Text>
                  ))}
              </View>
            )}
          </View>
        </View>

        <View style={{ marginTop: fs(isCompact ? 10 : 16) }}>
          <View
            style={[
              styles.tableHead,
              isCompact ? { paddingVertical: fs(3) } : undefined,
              {
                backgroundColor: style.tableHeadBg,
                color: style.tableHeadColor,
                borderBottomWidth: style.tableHeadBorderWidth,
                borderBottomColor: COLORS.ink,
              },
            ]}
          >
            <Text style={{ flex: 1, fontSize: fs(6.5) }}>DESCRIPTION</Text>
            {lineItemColumns.map((column) => (
              <View key={column.id} style={{ width: 48, paddingRight: 6 }}>
                <Text style={{ fontSize: fs(6.5) }}>{column.label.toUpperCase()}</Text>
              </View>
            ))}
            {fxRateLabel && (
              <>
                <View style={{ width: 45, paddingRight: 6 }}>
                  <Text style={{ textAlign: "right", fontSize: fs(6.5) }}>
                    {fxRateLabel.toUpperCase()}
                  </Text>
                </View>
                <View style={{ width: 42, paddingRight: 6 }}>
                  <Text style={{ textAlign: "right", fontSize: fs(6.5) }}>EXCH. RATE</Text>
                </View>
              </>
            )}
            <View style={{ width: 32 }}>
              <Text style={{ textAlign: "right", fontSize: fs(6.5) }}>QTY</Text>
            </View>
            <View style={{ width: 58 }}>
              <Text style={{ textAlign: "right", fontSize: fs(6.5) }}>RATE</Text>
            </View>
            {showTax && (
              <View style={{ width: 32 }}>
                <Text style={{ textAlign: "right", fontSize: fs(6.5) }}>TAX</Text>
              </View>
            )}
            <View style={{ width: 68 }}>
              <Text style={{ textAlign: "right", fontSize: fs(6.5) }}>AMOUNT</Text>
            </View>
          </View>
          {document.lineItems.map((item, index) => (
            <View
              key={index}
              style={[styles.tableRow, isCompact ? { paddingVertical: fs(2) } : undefined]}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.description && <Text style={styles.itemDesc}>{item.description}</Text>}
              </View>
              {lineItemColumns.map((column) => {
                const entry = item.customFieldValues.find(
                  (v) => v.definitionId === column.id,
                );
                return (
                  <View key={column.id} style={{ width: 48, paddingRight: 6 }}>
                    <Text style={{ color: COLORS.body, fontSize: fs(8) }}>
                      {entry ? formatCustomFieldValue(entry) : "—"}
                    </Text>
                  </View>
                );
              })}
              {fxRateLabel && (
                <>
                  <View style={{ width: 45, paddingRight: 6 }}>
                    <Text style={{ textAlign: "right", color: COLORS.body, fontSize: fs(8) }}>
                      {item.foreignRate != null ? item.foreignRate : "—"}
                    </Text>
                  </View>
                  <View style={{ width: 42, paddingRight: 6 }}>
                    <Text style={{ textAlign: "right", color: COLORS.body, fontSize: fs(8) }}>
                      {item.exchangeRate != null ? item.exchangeRate : "—"}
                    </Text>
                  </View>
                </>
              )}
              <View style={{ width: 32 }}>
                <Text style={{ textAlign: "right", fontSize: fs(8) }}>{item.qty}</Text>
              </View>
              <View style={{ width: 58 }}>
                <Text style={{ textAlign: "right", fontSize: fs(8) }}>
                  {formatCurrency(item.rate, document.currency)}
                </Text>
              </View>
              {showTax && (
                <View style={{ width: 32 }}>
                  <Text style={{ textAlign: "right", color: COLORS.body, fontSize: fs(8) }}>
                    {item.gstRate != null ? `${item.gstRate}%` : "—"}
                  </Text>
                </View>
              )}
              <View style={{ width: 68 }}>
                <Text
                  style={{
                    textAlign: "right",
                    fontFamily: "Noto Sans",
                    fontWeight: "bold",
                    fontSize: fs(8),
                  }}
                >
                  {formatCurrency(item.amount, document.currency)}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text>{formatCurrency(document.totals.subtotal, document.currency)}</Text>
          </View>
          {showInrSubline && (
            <View style={[styles.totalRow, { paddingVertical: 0 }]}>
              <Text style={{ fontSize: fs(7.5), color: COLORS.muted }}></Text>
              <Text style={{ fontSize: fs(7.5), color: COLORS.muted }}>
                ≈ {inrEquivalent(document.totals.subtotal)}
              </Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Discount</Text>
            <Text>− {formatCurrency(document.totals.discountTotal, document.currency)}</Text>
          </View>
          {showTax && (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Taxable amount</Text>
                <Text>{formatCurrency(document.totals.taxableAmount, document.currency)}</Text>
              </View>
              {showLutZeroRow && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>
                    IGST @0% (Zero-rated — Export under LUT)
                  </Text>
                  <Text>{formatCurrency(0, document.currency)}</Text>
                </View>
              )}
              {taxBuckets.map((bucket) => {
                const suffix = taxBuckets.length > 1 ? ` @${bucket.rate}%` : "";
                return (
                  <View key={bucket.rate}>
                    {bucket.cgst > 0 && (
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>{`CGST${suffix}`}</Text>
                        <Text>{formatCurrency(bucket.cgst, document.currency)}</Text>
                      </View>
                    )}
                    {bucket.sgst > 0 && (
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>{`SGST${suffix}`}</Text>
                        <Text>{formatCurrency(bucket.sgst, document.currency)}</Text>
                      </View>
                    )}
                    {bucket.igst > 0 && (
                      <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>{`IGST${suffix}`}</Text>
                        <Text>{formatCurrency(bucket.igst, document.currency)}</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </>
          )}
          <View
            style={[
              styles.grandTotalRow,
              {
                backgroundColor: style.totalRowBg,
                borderTopWidth: style.totalRowBorderWidth,
                borderBottomWidth: style.totalRowBorderWidth,
                borderTopColor: COLORS.ink,
                borderBottomColor: COLORS.ink,
              },
            ]}
          >
            <Text style={[styles.grandTotalLabel, { color: style.totalRowColor }]}>
              GRAND TOTAL
            </Text>
            <Text style={[styles.grandTotalValue, { color: style.totalRowColor }]}>
              {formatCurrency(document.totals.total, document.currency)}
            </Text>
          </View>
          {showInrSubline && (
            <View style={[styles.totalRow, { paddingTop: 2 }]}>
              <Text style={{ fontSize: fs(7.5), color: COLORS.muted }}>INR equivalent</Text>
              <Text style={{ fontSize: fs(7.5), color: COLORS.muted }}>
                {inrEquivalent(document.totals.total)}
              </Text>
            </View>
          )}
          {isInvoice && (
            <View style={[styles.totalRow, { paddingTop: 6 }]}>
              <Text style={styles.totalLabel}>
                {document.creditBalance > 0 ? "Credit balance" : "Balance due"}
              </Text>
              <Text style={{ fontFamily: "Noto Sans", fontWeight: "bold" }}>
                {formatCurrency(
                  document.creditBalance > 0
                    ? document.creditBalance
                    : document.remainingBalance,
                  document.currency,
                )}
              </Text>
            </View>
          )}
        </View>

        {isInvoice && document.payments.length > 0 && (
          <View style={styles.noteBlock}>
            <Text style={styles.sectionLabel}>PAYMENTS</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
              <Text style={styles.noteBody}>
                Amount paid: {formatCurrency(document.amountPaid, document.currency)}
              </Text>
              <Text style={styles.noteBody}>
                {document.creditBalance > 0
                  ? `Credit balance: ${formatCurrency(document.creditBalance, document.currency)}`
                  : document.remainingBalance > 0
                    ? `Remaining: ${formatCurrency(document.remainingBalance, document.currency)}`
                    : "Fully paid"}
              </Text>
            </View>
            {document.payments.map((payment) => (
              <View
                key={payment.id}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  gap: 8,
                  paddingVertical: 3,
                  borderTopWidth: 0.5,
                  borderTopColor: COLORS.rowBorder,
                }}
              >
                <Text style={{ fontSize: fs(8.5), color: COLORS.body }}>
                  {formatDateIST(payment.paidAt)}
                </Text>
                <Text style={{ fontSize: fs(8.5), color: COLORS.body, flex: 1 }}>
                  {payment.note}
                </Text>
                <Text style={{ fontSize: fs(8.5), fontFamily: "Noto Sans" }}>
                  {formatCurrency(payment.amount, document.currency)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {document.showNotes && document.notes && (
          <View style={styles.noteBlock}>
            <Text style={styles.sectionLabel}>NOTES</Text>
            <Text style={styles.noteBody}>{document.notes}</Text>
          </View>
        )}
        {document.showTerms && document.termsText && (
          <View style={styles.noteBlock}>
            <Text style={styles.sectionLabel}>TERMS &amp; CONDITIONS</Text>
            <Text style={styles.noteBody}>{document.termsText}</Text>
          </View>
        )}
        {isForeignCurrency && document.lutDeclarationText && (
          <View style={styles.noteBlock}>
            <Text style={styles.sectionLabel}>EXPORT DECLARATION</Text>
            <Text style={styles.noteBody}>{document.lutDeclarationText}</Text>
          </View>
        )}
        {document.showPayment && (
          <View style={styles.paymentBlock}>
            <Text style={styles.sectionLabel}>PAYMENT DETAILS</Text>
            <Text style={[styles.noteBody, { fontFamily: "Courier" }]}>
              {business.name}
            </Text>
            {bankLines.map((line) => (
              <Text
                key={line.label}
                style={[styles.noteBody, { fontFamily: "Courier", marginTop: 1 }]}
              >
                {line.label}: {line.value}
              </Text>
            ))}
          </View>
        )}

        {document.showSignature &&
          (business.signatureImageUrl || business.signatureSignatoryName) && (
            <View style={{ marginTop: 16, alignItems: "flex-end" }}>
              <Text style={[styles.sectionLabel, { textAlign: "right" }]}>
                AUTHORISED SIGNATORY
              </Text>
              {business.signatureImageUrl && (
                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop
                <Image
                  src={business.signatureImageUrl}
                  style={{ width: 80, height: 40, marginTop: 4, objectFit: "contain" }}
                />
              )}
              {business.signatureSignatoryName && (
                <Text style={{ fontSize: fs(9.5), marginTop: 4, textAlign: "right" }}>
                  {business.signatureSignatoryName}
                </Text>
              )}
              {business.signatureDesignation && (
                <Text
                  style={{ fontSize: fs(8), color: COLORS.muted, textAlign: "right" }}
                >
                  {business.signatureDesignation}
                </Text>
              )}
            </View>
          )}

        {qrCodeDataUrl && (
          <View style={{ marginTop: 14, alignItems: "flex-end" }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image has no alt prop */}
            <Image src={qrCodeDataUrl} style={{ width: 70, height: 70 }} />
            <Text style={{ fontSize: fs(7), color: COLORS.muted, marginTop: 2 }}>
              e-Invoice QR
            </Text>
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>
            {business.name}
            {business.website ? `  ·  ${business.website}` : ""}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
