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
  shipmentLabel: { fontSize: 7, color: COLORS.muted },
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
  totalsValue: { fontSize: 8.5, fontFamily: "Courier" },
  netTotalLabel: { fontSize: 9.5, fontFamily: "Noto Sans", fontWeight: "bold" },
  netTotalValue: { fontSize: 9.5, fontFamily: "Courier", fontWeight: "bold" },
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
  // FC columns show when the invoice's own settlement currency isn't
  // INR, OR — defensively — when a line item actually carries FC data
  // even if the invoice-level currency was somehow left at its "INR"
  // default (e.g. an invoice entered before its currency field was set,
  // still bookkeeping foreign-currency amounts per line). Detecting
  // both, not just the invoice-level flag, matches the sales invoice
  // PDF's own FX-column detection (lib/pdf/document-pdf.tsx via
  // resolveLineItemColumns) rather than trusting a single upstream flag.
  const showFc =
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
            <Text style={[styles.tableHeaderCell, { width: showFc ? "18%" : "22%", textAlign: "left" }]}>Description</Text>
            <Text style={[styles.tableHeaderCell, { width: showFc ? "6%" : "7%" }]}>SAC</Text>
            <Text style={[styles.tableHeaderCell, { width: showFc ? "7%" : "8%" }]}>Qty/UOM</Text>
            <Text style={[styles.tableHeaderCell, { width: showFc ? "7%" : "8%" }]}>{showFc ? "Rate (FC)" : "Rate"}</Text>
            {showFc && <Text style={[styles.tableHeaderCell, { width: "7%" }]}>Ex. Rate</Text>}
            {showFc && <Text style={[styles.tableHeaderCell, { width: "8%" }]}>Amount (FC)</Text>}
            <Text style={[styles.tableHeaderCell, { width: showFc ? "8%" : "12%" }]}>Amount (INR)</Text>
            <Text style={[styles.tableHeaderCell, { width: showFc ? "8%" : "9%" }]}>Taxable</Text>
            <Text style={[styles.tableHeaderCell, { width: showFc ? "8%" : "9.3%" }]}>CGST</Text>
            <Text style={[styles.tableHeaderCell, { width: showFc ? "8%" : "9.3%" }]}>SGST</Text>
            <Text style={[styles.tableHeaderCell, { width: showFc ? "8%" : "9.4%" }]}>IGST</Text>
          </View>
          {lineItems.map((item, index) => {
            // Per-line effective exchange rate: prefer the invoice's own
            // stored rate (constant for the whole invoice, per design doc
            // §1.2 — FX is invoice-level here, not per-line like sales
            // LineItem); fall back to deriving it from this line's own
            // amount/amountInr if the invoice-level rate is somehow
            // unset but this line still carries FC data.
            const effectiveExchangeRate =
              purchaseInvoice.exchangeRate ??
              (item.amountInr != null && item.amount !== 0 ? item.amountInr / item.amount : null);
            return (
              <View style={styles.tableRow} key={index}>
                <Text style={[styles.tableCell, { width: showFc ? "18%" : "22%" }]}>{item.description}</Text>
                <Text style={[styles.tableCell, { width: showFc ? "6%" : "7%", textAlign: "center" }]}>{item.sac || "—"}</Text>
                <Text style={[styles.tableCell, { width: showFc ? "7%" : "8%", textAlign: "center" }]}>
                  {item.qty}
                  {item.unit ? ` ${item.unit}` : ""}
                </Text>
                <Text style={[styles.tableCell, { width: showFc ? "7%" : "8%", textAlign: "right" }]}>{formatCurrency(item.rate, purchaseInvoice.currency)}</Text>
                {showFc && (
                  <Text style={[styles.tableCell, { width: "7%", textAlign: "right" }]}>
                    {effectiveExchangeRate != null ? effectiveExchangeRate.toFixed(4) : "—"}
                  </Text>
                )}
                {showFc && (
                  <Text style={[styles.tableCell, { width: "8%", textAlign: "right" }]}>{formatCurrency(item.amount, purchaseInvoice.currency)}</Text>
                )}
                <Text style={[styles.tableCell, { width: showFc ? "8%" : "12%", textAlign: "right" }]}>
                  {formatCurrency(item.amountInr ?? item.amount)}
                </Text>
                <Text style={[styles.tableCell, { width: showFc ? "8%" : "9%", textAlign: "right" }]}>{formatCurrency(item.taxableAmount)}</Text>
                <Text style={[styles.tableCell, { width: showFc ? "8%" : "9.3%", textAlign: "right" }]}>{formatCurrency(item.cgst)}</Text>
                <Text style={[styles.tableCell, { width: showFc ? "8%" : "9.3%", textAlign: "right" }]}>{formatCurrency(item.sgst)}</Text>
                <Text style={[styles.tableCell, { width: showFc ? "8%" : "9.4%", textAlign: "right" }]}>{formatCurrency(item.igst)}</Text>
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
