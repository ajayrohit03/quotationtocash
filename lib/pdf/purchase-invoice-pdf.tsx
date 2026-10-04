import "server-only";
import { Document, Page, View, Text, StyleSheet, Font } from "@react-pdf/renderer";
import { formatDateIST } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import { isSameState } from "@/lib/tax/calculateGST";
import { groupTaxByRate } from "@/lib/tax/groupTaxByRate";
import { applyRounding } from "@/lib/tax/applyRounding";
import { amountInWords } from "@/lib/purchase-invoices/amount-in-words";
import type { VendorSnapshot } from "@/lib/purchase-invoices/snapshots";
import type { BusinessSnapshot } from "@/lib/documents/snapshots";

// Same hyphenation fix and Noto Sans (₹ glyph) registration as
// lib/pdf/document-pdf.tsx — see that file's own comment for why.
// Font.register/registerHyphenationCallback are idempotent when called
// again with the same args, so registering here too (rather than
// importing from document-pdf.tsx, a Server-only sibling with its own
// unrelated layout logic) keeps this file self-contained.
Font.registerHyphenationCallback((word) => [word]);
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

const COLORS = {
  ink: "#0E1220",
  body: "#565E72",
  muted: "#8A92A6",
  border: "#E7E9EF",
  bannerBg: "#3454D1",
  bannerFg: "#FFFFFF",
};

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 9, fontFamily: "Noto Sans", color: COLORS.ink },
  titleBanner: {
    backgroundColor: COLORS.bannerBg,
    color: COLORS.bannerFg,
    textAlign: "center",
    paddingVertical: 6,
    fontSize: 13,
    fontFamily: "Noto Sans",
    fontWeight: "bold",
    marginBottom: 12,
  },
  sectionBanner: {
    backgroundColor: COLORS.bannerBg,
    color: COLORS.bannerFg,
    paddingVertical: 3,
    paddingHorizontal: 6,
    fontSize: 8.5,
    fontFamily: "Noto Sans",
    fontWeight: "bold",
    marginTop: 10,
    marginBottom: 4,
  },
  headerRow: { flexDirection: "row", justifyContent: "space-between" },
  headerCol: { width: "48%" },
  partyName: { fontSize: 12, fontFamily: "Noto Sans", fontWeight: "bold" },
  addressLine: { fontSize: 8.5, color: COLORS.body, marginTop: 2, lineHeight: 1.4 },
  identityLine: { fontSize: 7.5, color: COLORS.body, marginTop: 3, fontFamily: "Courier" },
  metaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 3 },
  metaLabel: { fontSize: 8, color: COLORS.muted },
  metaValue: { fontSize: 8.5 },
  shipmentGrid: { flexDirection: "row", flexWrap: "wrap" },
  shipmentCell: { width: "33.33%", marginBottom: 6, paddingRight: 6 },
  shipmentLabel: { fontSize: 7, fontFamily: "Noto Sans", fontWeight: "bold", color: COLORS.muted },
  shipmentValue: { fontSize: 8.5, marginTop: 1 },
  table: { borderWidth: 1, borderColor: COLORS.border, marginTop: 4 },
  tableHeaderRow: {
    flexDirection: "row",
    backgroundColor: COLORS.bannerBg,
  },
  tableHeaderCell: {
    color: COLORS.bannerFg,
    fontSize: 7,
    fontFamily: "Noto Sans",
    fontWeight: "bold",
    padding: 3,
    textAlign: "center",
  },
  tableRow: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  tableCell: { fontSize: 7.5, padding: 3 },
  totalsBlock: { alignItems: "flex-end", marginTop: 10 },
  totalsRow: { flexDirection: "row", justifyContent: "space-between", width: 220 },
  totalsLabel: { fontSize: 8.5, color: COLORS.body },
  // Noto Sans, not Courier — see lib/pdf/document-pdf.tsx's own comment
  // on why: Courier (like Helvetica) has no ₹ glyph, so pdfkit silently
  // substitutes a fallback mark that renders as a small blob raised
  // above the baseline, visually indistinguishable from superscript
  // text. This file's own identityLine correctly reserves Courier for
  // GSTIN/PAN/CIN codes, which are plain alphanumeric and never contain
  // ₹ — these two styles are for formatCurrency() output, which always
  // does, so they must stay on the page's own Noto Sans (already
  // registered with a real ₹ glyph), matching document-pdf.tsx's own
  // grandTotalValue precedent exactly.
  totalsValue: { fontSize: 8.5, fontFamily: "Noto Sans" },
  netTotalLabel: { fontSize: 9.5, fontFamily: "Noto Sans", fontWeight: "bold" },
  netTotalValue: { fontSize: 9.5, fontFamily: "Noto Sans", fontWeight: "bold" },
  wordsLine: { fontSize: 8, marginTop: 6, fontFamily: "Noto Sans", fontWeight: "bold" },
  bankBlock: { marginTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  bankRow: { flexDirection: "row", marginBottom: 2 },
  bankLabel: { width: 140, fontSize: 8, color: COLORS.muted },
  bankValue: { fontSize: 8.5 },
});

// Line item shape this renderer needs — a plain, already-frozen
// projection (numbers, not Decimal) matching PreviewLineItem's own
// "render-only" convention.
export type PurchaseInvoicePdfLineItem = {
  description: string;
  sac: string | null;
  qty: number;
  unit: string | null;
  rate: number;
  amount: number;
  amountInr: number | null;
  taxableAmount: number;
  gstRate: number | null;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  rateFC: number | null;
  exRate: number | null;
  fcCurrency: string | null;
  amountFC: number | null;
};

export type PurchaseInvoicePdfData = {
  vendorInvoiceNumber: string;
  vendorInvoiceDate: Date;
  dueDate: Date | null;
  currency: string;
  exchangeRate: number | null;
  roundTotal: boolean;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  cess: number;
  total: number;
  shipmentMode: string | null;
  vesselVoyage: string | null;
  sailedDate: Date | null;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  originPort: string | null;
  placeOfDelivery: string | null;
  shipper: string | null;
  ciReference: string | null;
  salesPerson: string | null;
  containerNo: string | null;
  jobRef: string | null;
  customerRef: string | null;
  packageType: string | null;
  noOfPackages: number | null;
  hbl: string | null;
  mbl: string | null;
  weightKg: number | null;
  chargeableWeight: number | null;
  volumeCbm: number | null;
  customsDocRef: string | null;
  termsOfShipment: string | null;
  vendor: VendorSnapshot;
  business: BusinessSnapshot;
  lineItems: PurchaseInvoicePdfLineItem[];
};

function shipmentField(label: string, value: string | number | null) {
  if (value === null || value === "") return null;
  return (
    <View style={styles.shipmentCell} key={label}>
      <Text style={styles.shipmentLabel}>{label}</Text>
      <Text style={styles.shipmentValue}>{String(value)}</Text>
    </View>
  );
}

export function PurchaseInvoicePdf({ purchaseInvoice }: { purchaseInvoice: PurchaseInvoicePdfData }) {
  const { vendor, business, lineItems } = purchaseInvoice;
  // FC columns show when any line item actually carries its own FC rate
  // (PurchaseLineItem.rateFC — the real per-line provenance data, same
  // "detect from the data, not a single upstream flag" approach the
  // sales invoice PDF's own FX-column detection uses), OR when the
  // invoice's own settlement currency isn't INR, OR when a line
  // otherwise carries an amountInr distinct from its own amount. Any of
  // the three is sufficient — a business might set per-line FC data
  // without ever touching the invoice-level currency field, or vice
  // versa.
  const showFc =
    lineItems.some((item) => item.rateFC != null) ||
    purchaseInvoice.currency !== "INR" ||
    lineItems.some((item) => item.amountInr != null);
  const sameState = isSameState(vendor.state, business.placeOfSupply);
  const taxBuckets = groupTaxByRate(
    lineItems.map((item) => ({ amount: item.taxableAmount, gstRate: item.gstRate })),
    sameState,
  );
  const rounding = applyRounding(purchaseInvoice.total, purchaseInvoice.roundTotal);

  const vendorIdentity = [
    vendor.pan ? `PAN ${vendor.pan}` : null,
    vendor.cin ? `CIN ${vendor.cin}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const shipmentFields = [
    shipmentField("Shipment Details For", purchaseInvoice.shipmentMode),
    shipmentField("Vessel/Voyage", purchaseInvoice.vesselVoyage),
    shipmentField("Sailed Date", purchaseInvoice.sailedDate ? formatDateIST(purchaseInvoice.sailedDate) : null),
    shipmentField("Port of Loading", purchaseInvoice.portOfLoading),
    shipmentField("Port of Discharge", purchaseInvoice.portOfDischarge),
    shipmentField("Origin Port", purchaseInvoice.originPort),
    shipmentField("Place of Delivery", purchaseInvoice.placeOfDelivery),
    shipmentField("Shipper", purchaseInvoice.shipper),
    shipmentField("CI Reference", purchaseInvoice.ciReference),
    shipmentField("Sales Person", purchaseInvoice.salesPerson),
    shipmentField("Container No.", purchaseInvoice.containerNo),
    shipmentField("Job Ref", purchaseInvoice.jobRef),
    shipmentField("Customer Ref", purchaseInvoice.customerRef),
    shipmentField("Package Type", purchaseInvoice.packageType),
    shipmentField("No. of Packages", purchaseInvoice.noOfPackages),
    shipmentField("HBL", purchaseInvoice.hbl),
    shipmentField("MBL", purchaseInvoice.mbl),
    shipmentField("Weight(KGS)", purchaseInvoice.weightKg),
    shipmentField("Chargeable Weight", purchaseInvoice.chargeableWeight),
    shipmentField("Volume(CBM)", purchaseInvoice.volumeCbm),
    shipmentField("Customs Doc Ref", purchaseInvoice.customsDocRef),
    shipmentField("Terms of Shipment", purchaseInvoice.termsOfShipment),
  ].filter(Boolean);

  // Page content is 515pt wide. The FC layout has 8 numeric columns, so
  // widths follow the widest realistic value (e.g. "₹12,34,567.89")
  // instead of an even split, and the table uses a smaller font/padding —
  // an even 8% split left ~35pt of text room per cell and amounts
  // overflowed into the neighbouring column. Each set sums to 100%.
  const cols = showFc
    ? { desc: "13.5%", sac: "5.5%", qty: "7%", rate: "9.5%", exRate: "7%", amountFc: "10.5%", amountInr: "11%", taxable: "10.5%", tax: "8.5%", igst: "8.5%" }
    : { desc: "22%", sac: "7%", qty: "8%", rate: "8%", exRate: "0%", amountFc: "0%", amountInr: "12%", taxable: "9%", tax: "9.3%", igst: "9.4%" };
  const tableCellFont = showFc ? { fontSize: 6.5, padding: 2 } : {};
  const tableHeadFont = showFc ? { fontSize: 6.5, padding: 2 } : {};

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.titleBanner}>Purchase Invoice</Text>

        <View style={styles.headerRow}>
          <View style={styles.headerCol}>
            <Text style={styles.partyName}>{vendor.name}</Text>
            {(vendor.address || vendor.city || vendor.state) && (
              <Text style={styles.addressLine}>
                {[vendor.address, vendor.city, vendor.state].filter(Boolean).join(", ")}
              </Text>
            )}
            {vendor.gstin && <Text style={styles.identityLine}>GSTIN {vendor.gstin}</Text>}
            {vendorIdentity && <Text style={styles.identityLine}>{vendorIdentity}</Text>}
          </View>
          <View style={styles.headerCol}>
            <View style={styles.sectionBanner}>
              <Text>Bill To</Text>
            </View>
            <Text style={styles.partyName}>{business.name}</Text>
            {(business.address || business.city || business.state) && (
              <Text style={styles.addressLine}>
                {[business.address, business.city, business.state].filter(Boolean).join(", ")}
              </Text>
            )}
            {business.gstin && (
              <Text style={styles.identityLine}>
                GSTIN {business.gstin}
                {business.placeOfSupply ? ` · Place of Supply: ${business.placeOfSupply}` : ""}
              </Text>
            )}
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice No.</Text>
              <Text style={styles.metaValue}>{purchaseInvoice.vendorInvoiceNumber || "—"}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Invoice Date</Text>
              <Text style={styles.metaValue}>{formatDateIST(purchaseInvoice.vendorInvoiceDate)}</Text>
            </View>
            {purchaseInvoice.dueDate && (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Due Date</Text>
                <Text style={styles.metaValue}>{formatDateIST(purchaseInvoice.dueDate)}</Text>
              </View>
            )}
          </View>
        </View>

        {shipmentFields.length > 0 && (
          <>
            <View style={styles.sectionBanner}>
              <Text>Shipment Details</Text>
            </View>
            <View style={styles.shipmentGrid}>{shipmentFields}</View>
          </>
        )}

        <View style={styles.table}>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeaderCell, tableHeadFont, { width: cols.desc, textAlign: "left" }]}>Description</Text>
            <Text style={[styles.tableHeaderCell, tableHeadFont, { width: cols.sac }]}>SAC</Text>
            <Text style={[styles.tableHeaderCell, tableHeadFont, { width: cols.qty }]}>Qty/UOM</Text>
            <Text style={[styles.tableHeaderCell, tableHeadFont, { width: cols.rate }]}>{showFc ? "Rate (FC)" : "Rate"}</Text>
            {showFc && <Text style={[styles.tableHeaderCell, tableHeadFont, { width: cols.exRate }]}>Ex. Rate</Text>}
            {showFc && <Text style={[styles.tableHeaderCell, tableHeadFont, { width: cols.amountFc }]}>Amount (FC)</Text>}
            <Text style={[styles.tableHeaderCell, tableHeadFont, { width: cols.amountInr }]}>Amount (INR)</Text>
            <Text style={[styles.tableHeaderCell, tableHeadFont, { width: cols.taxable }]}>Taxable</Text>
            <Text style={[styles.tableHeaderCell, tableHeadFont, { width: cols.tax }]}>CGST</Text>
            <Text style={[styles.tableHeaderCell, tableHeadFont, { width: cols.tax }]}>SGST</Text>
            <Text style={[styles.tableHeaderCell, tableHeadFont, { width: cols.igst }]}>IGST</Text>
          </View>
          {lineItems.map((item, index) => {
            // Prefer this line's own FC provenance (PurchaseLineItem.
            // rateFC/exRate/amountFC/fcCurrency — the real per-line data
            // added specifically so this doesn't have to be inferred).
            // Fall back to the invoice-level exchangeRate/currency, then
            // to deriving a rate from amountInr, for a line entered
            // before per-line FC fields existed or that only ever used
            // the invoice-level fields.
            const rateFC = item.rateFC ?? item.rate;
            const fcCurrency = item.fcCurrency ?? purchaseInvoice.currency;
            const amountFC = item.amountFC ?? item.amount;
            const effectiveExchangeRate =
              item.exRate ??
              purchaseInvoice.exchangeRate ??
              (item.amountInr != null && item.amount !== 0 ? item.amountInr / item.amount : null);
            return (
              <View style={styles.tableRow} key={index}>
                <Text style={[styles.tableCell, tableCellFont, { width: cols.desc }]}>{item.description}</Text>
                <Text style={[styles.tableCell, tableCellFont, { width: cols.sac, textAlign: "center" }]}>{item.sac || "—"}</Text>
                <Text style={[styles.tableCell, tableCellFont, { width: cols.qty, textAlign: "center" }]}>
                  {item.qty}
                  {item.unit ? ` ${item.unit}` : ""}
                </Text>
                <Text style={[styles.tableCell, tableCellFont, { width: cols.rate, textAlign: "right" }]}>
                  {showFc ? formatCurrency(rateFC, fcCurrency) : formatCurrency(item.rate, purchaseInvoice.currency)}
                </Text>
                {showFc && (
                  <Text style={[styles.tableCell, tableCellFont, { width: cols.exRate, textAlign: "right" }]}>
                    {effectiveExchangeRate != null ? effectiveExchangeRate.toFixed(4) : "—"}
                  </Text>
                )}
                {showFc && (
                  <Text style={[styles.tableCell, tableCellFont, { width: cols.amountFc, textAlign: "right" }]}>{formatCurrency(amountFC, fcCurrency)}</Text>
                )}
                <Text style={[styles.tableCell, tableCellFont, { width: cols.amountInr, textAlign: "right" }]}>
                  {formatCurrency(item.amountInr ?? item.amount)}
                </Text>
                <Text style={[styles.tableCell, tableCellFont, { width: cols.taxable, textAlign: "right" }]}>{formatCurrency(item.taxableAmount)}</Text>
                <Text style={[styles.tableCell, tableCellFont, { width: cols.tax, textAlign: "right" }]}>{formatCurrency(item.cgst)}</Text>
                <Text style={[styles.tableCell, tableCellFont, { width: cols.tax, textAlign: "right" }]}>{formatCurrency(item.sgst)}</Text>
                <Text style={[styles.tableCell, tableCellFont, { width: cols.igst, textAlign: "right" }]}>{formatCurrency(item.igst)}</Text>
              </View>
            );
          })}
        </View>

        {taxBuckets.length > 0 && (
          <>
            <View style={styles.sectionBanner}>
              <Text>Tax Summary</Text>
            </View>
            <View style={styles.table}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, { width: "16%" }]}>Rate</Text>
                <Text style={[styles.tableHeaderCell, { width: "21%" }]}>Taxable Value</Text>
                <Text style={[styles.tableHeaderCell, { width: "21%" }]}>CGST</Text>
                <Text style={[styles.tableHeaderCell, { width: "21%" }]}>SGST/UTGST</Text>
                <Text style={[styles.tableHeaderCell, { width: "21%" }]}>IGST</Text>
              </View>
              {taxBuckets.map((bucket) => (
                <View style={styles.tableRow} key={bucket.rate}>
                  <Text style={[styles.tableCell, { width: "16%", textAlign: "center" }]}>{bucket.rate}%</Text>
                  <Text style={[styles.tableCell, { width: "21%", textAlign: "right" }]}>{formatCurrency(bucket.taxableAmount)}</Text>
                  <Text style={[styles.tableCell, { width: "21%", textAlign: "right" }]}>{formatCurrency(bucket.cgst)}</Text>
                  <Text style={[styles.tableCell, { width: "21%", textAlign: "right" }]}>{formatCurrency(bucket.sgst)}</Text>
                  <Text style={[styles.tableCell, { width: "21%", textAlign: "right" }]}>{formatCurrency(bucket.igst)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Total Invoice</Text>
            <Text style={styles.totalsValue}>{formatCurrency(purchaseInvoice.total)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Rounded</Text>
            <Text style={styles.totalsValue}>{formatCurrency(rounding.roundingAdjustment)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.netTotalLabel}>Net Total</Text>
            <Text style={styles.netTotalValue}>{formatCurrency(rounding.total)}</Text>
          </View>
        </View>

        <Text style={styles.wordsLine}>
          {amountInWords(rounding.total, purchaseInvoice.currency)}
        </Text>

        <View style={styles.bankBlock}>
          <Text style={[styles.sectionBanner, { marginTop: 0 }]}>Bank Details</Text>
          {vendor.bankName && (
            <View style={styles.bankRow}>
              <Text style={styles.bankLabel}>Bank Name</Text>
              <Text style={styles.bankValue}>{vendor.bankName}</Text>
            </View>
          )}
          <View style={styles.bankRow}>
            <Text style={styles.bankLabel}>Account Name</Text>
            <Text style={styles.bankValue}>{vendor.accountHolderName || vendor.name}</Text>
          </View>
          {vendor.accountNumber && (
            <View style={styles.bankRow}>
              <Text style={styles.bankLabel}>Account No.</Text>
              <Text style={styles.bankValue}>{vendor.accountNumber}</Text>
            </View>
          )}
          {vendor.ifscCode && (
            <View style={styles.bankRow}>
              <Text style={styles.bankLabel}>IFSC / RTGS-NEFT</Text>
              <Text style={styles.bankValue}>{vendor.ifscCode}</Text>
            </View>
          )}
          {vendor.swiftCode && (
            <View style={styles.bankRow}>
              <Text style={styles.bankLabel}>Swift Code</Text>
              <Text style={styles.bankValue}>{vendor.swiftCode}</Text>
            </View>
          )}
        </View>
      </Page>
    </Document>
  );
}
