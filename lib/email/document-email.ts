import { formatCurrency } from "@/lib/format";

// No design reference covers transactional email (InvoiceFlow.dc.html only
// mocks the in-app screens), so this is a minimal, self-contained HTML
// email — inline styles throughout, since email clients strip <style>
// blocks and external stylesheets.
export function buildDocumentEmailHtml({
  businessName,
  customerName,
  documentTypeLabel,
  documentNumber,
  total,
  currency,
  accentColor,
  viewUrl,
}: {
  businessName: string;
  customerName: string;
  documentTypeLabel: "quotation" | "invoice";
  documentNumber: string;
  total: number;
  currency: string;
  accentColor: string;
  viewUrl: string;
}): string {
  const label = documentTypeLabel === "quotation" ? "Quotation" : "Invoice";
  const formattedTotal = formatCurrency(total, currency);

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F6F7F9;font-family:Helvetica,Arial,sans-serif;color:#0E1220;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #E7E9EF;">
            <tr>
              <td style="height:6px;background:${accentColor};"></td>
            </tr>
            <tr>
              <td style="padding:32px 32px 24px;">
                <p style="margin:0 0 4px;font-size:13px;color:#8A92A6;">${businessName}</p>
                <h1 style="margin:0 0 16px;font-size:20px;">${label} ${documentNumber}</h1>
                <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3D4453;">
                  Hi ${customerName},<br /><br />
                  ${businessName} has sent you ${label.toLowerCase()} <strong>${documentNumber}</strong>
                  for <strong>${formattedTotal}</strong>. You can view it online or open the attached PDF.
                </p>
                <a
                  href="${viewUrl}"
                  style="display:inline-block;background:${accentColor};color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;"
                >
                  View ${label.toLowerCase()}
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 28px;border-top:1px solid #EEF0F5;">
                <p style="margin:0;font-size:12px;color:#8A92A6;">Sent via QuotationToCash on behalf of ${businessName}.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
