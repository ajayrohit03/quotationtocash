import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { formatDateIST } from "@/lib/dates";
import { formatCurrency } from "@/lib/format";
import type { PreviewDocument } from "@/components/documents/preview-types";
import { bankDetailsLine } from "@/lib/documents/payment-details";

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

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: COLORS.ink,
  },
  topBar: { height: 7 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  businessName: { fontSize: 14, fontFamily: "Helvetica-Bold" },
  addressLine: { fontSize: 9, color: COLORS.body, marginTop: 2, lineHeight: 1.4 },
  gstinLine: { fontSize: 8.5, color: COLORS.body, marginTop: 4, fontFamily: "Courier" },
  logo: { width: 90, height: 32, marginBottom: 10, objectFit: "contain" },
  docTitle: { fontSize: 19, fontFamily: "Helvetica-Bold", letterSpacing: 1.5 },
  docNumber: { fontSize: 9.5, marginTop: 6, fontFamily: "Courier", color: "#3D4453" },
  docDates: { fontSize: 9, color: COLORS.body, marginTop: 8, lineHeight: 1.6 },
  divider: { height: 1, backgroundColor: COLORS.border, marginVertical: 20 },
  refRow: { flexDirection: "row", gap: 32 },
  sectionLabel: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 1,
    color: COLORS.muted,
  },
  billToName: { fontSize: 10, fontFamily: "Helvetica-Bold", marginTop: 6 },
  tableHead: {
    flexDirection: "row",
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.rowBorder,
    fontSize: 9,
  },
  itemName: { fontFamily: "Helvetica-Bold" },
  itemDesc: { fontSize: 8, color: COLORS.faint, marginTop: 1 },
  totalsBlock: { width: 230, marginLeft: "auto", marginTop: 14 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
    paddingHorizontal: 6,
    fontSize: 9,
  },
  totalLabel: { color: COLORS.body },
  grandTotalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 6,
    padding: 8,
  },
  grandTotalLabel: { fontSize: 8, fontFamily: "Helvetica-Bold", letterSpacing: 0.5 },
  grandTotalValue: { fontSize: 13, fontFamily: "Helvetica-Bold" },
  noteBlock: { marginTop: 20 },
  noteBody: { fontSize: 9, color: "#3D4453", marginTop: 4, lineHeight: 1.5 },
  paymentBlock: {
    marginTop: 14,
    padding: 10,
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
    fontSize: 8,
    color: COLORS.muted,
  },
});

function templateStyle(template: PreviewDocument["template"], accentColor: string) {
  return {
    docTitleColor: template === "minimal" ? COLORS.ink : accentColor,
    tableHeadBg:
      template === "minimal" ? "#ffffff" : template === "classic" ? COLORS.ink : "#F3F4F7",
    tableHeadColor:
      template === "classic" ? "#ffffff" : template === "minimal" ? COLORS.muted : "#3D4453",
    totalRowBg: template === "minimal" ? "#F6F7F9" : accentColor,
    totalRowColor: template === "minimal" ? COLORS.ink : "#ffffff",
  };
}

export function DocumentPdf({
  document,
  gstEnabled,
}: {
  document: PreviewDocument;
  gstEnabled: boolean;
}) {
  const isQuotation = document.type === "quotation";
  const style = templateStyle(document.template, document.accentColor);
  const showGstinRow = gstEnabled && document.showGstinRow;
  const showTax = gstEnabled && document.showTax;
  const secondaryDate = isQuotation ? document.validUntil : document.dueDate;
  const terms = isQuotation ? document.validityTerms : document.paymentTerms;
  const { business, customer } = document;
  const bankLine = bankDetailsLine(business);

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
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.docTitle, { color: style.docTitleColor }]}>
              {isQuotation ? "QUOTATION" : "INVOICE"}
            </Text>
            <Text style={styles.docNumber}>{document.number}</Text>
            <Text style={styles.docDates}>
              {isQuotation ? "Issue date" : "Invoice date"}: {formatDateIST(document.issueDate)}
              {"\n"}
              {isQuotation ? "Valid until" : "Due date"}:{" "}
              {secondaryDate ? formatDateIST(secondaryDate) : "—"}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.refRow}>
          <View>
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
          </View>
          <View>
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
          </View>
        </View>

        <View style={{ marginTop: 24 }}>
          <View
            style={[
              styles.tableHead,
              { backgroundColor: style.tableHeadBg, color: style.tableHeadColor },
            ]}
          >
            <Text style={{ flex: 1 }}>DESCRIPTION</Text>
            <Text style={{ width: 40, textAlign: "right" }}>QTY</Text>
            <Text style={{ width: 65, textAlign: "right" }}>RATE</Text>
            {showTax && <Text style={{ width: 40, textAlign: "right" }}>TAX</Text>}
            <Text style={{ width: 75, textAlign: "right" }}>AMOUNT</Text>
          </View>
          {document.lineItems.map((item, index) => (
            <View key={index} style={styles.tableRow}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.description && <Text style={styles.itemDesc}>{item.description}</Text>}
              </View>
              <Text style={{ width: 40, textAlign: "right" }}>{item.qty}</Text>
              <Text style={{ width: 65, textAlign: "right" }}>
                {formatCurrency(item.rate, document.currency)}
              </Text>
              {showTax && (
                <Text style={{ width: 40, textAlign: "right", color: COLORS.body }}>
                  {item.gstRate != null ? `${item.gstRate}%` : "—"}
                </Text>
              )}
              <Text style={{ width: 75, textAlign: "right", fontFamily: "Helvetica-Bold" }}>
                {formatCurrency(item.amount, document.currency)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text>{formatCurrency(document.totals.subtotal, document.currency)}</Text>
          </View>
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
              {document.totals.cgst > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>CGST</Text>
                  <Text>{formatCurrency(document.totals.cgst, document.currency)}</Text>
                </View>
              )}
              {document.totals.sgst > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>SGST</Text>
                  <Text>{formatCurrency(document.totals.sgst, document.currency)}</Text>
                </View>
              )}
              {document.totals.igst > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>IGST</Text>
                  <Text>{formatCurrency(document.totals.igst, document.currency)}</Text>
                </View>
              )}
            </>
          )}
          <View style={[styles.grandTotalRow, { backgroundColor: style.totalRowBg }]}>
            <Text style={[styles.grandTotalLabel, { color: style.totalRowColor }]}>
              GRAND TOTAL
            </Text>
            <Text style={[styles.grandTotalValue, { color: style.totalRowColor }]}>
              {formatCurrency(document.totals.total, document.currency)}
            </Text>
          </View>
          {!isQuotation && (
            <View style={[styles.totalRow, { paddingTop: 6 }]}>
              <Text style={styles.totalLabel}>
                {document.creditBalance > 0 ? "Credit balance" : "Balance due"}
              </Text>
              <Text style={{ fontFamily: "Helvetica-Bold" }}>
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

        {!isQuotation && document.payments.length > 0 && (
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
                <Text style={{ fontSize: 8.5, color: COLORS.body }}>
                  {formatDateIST(payment.paidAt)}
                </Text>
                <Text style={{ fontSize: 8.5, color: COLORS.body, flex: 1 }}>
                  {payment.note}
                </Text>
                <Text style={{ fontSize: 8.5, fontFamily: "Courier" }}>
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
        {document.showPayment && (
          <View style={styles.paymentBlock}>
            <Text style={styles.sectionLabel}>PAYMENT DETAILS</Text>
            <Text style={[styles.noteBody, { fontFamily: "Courier" }]}>
              {[business.name, business.email, business.phone].filter(Boolean).join("  ·  ")}
            </Text>
            {bankLine && (
              <Text style={[styles.noteBody, { fontFamily: "Courier" }]}>
                {bankLine}
              </Text>
            )}
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
