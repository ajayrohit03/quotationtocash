// Same minimal, self-contained inline-styled shape as
// lib/email/document-email.ts — no design reference covers transactional
// email, and email clients strip <style> blocks/external stylesheets.
export function buildInvitationEmailHtml({
  businessName,
  inviterName,
  role,
  acceptUrl,
}: {
  businessName: string;
  inviterName: string;
  role: "admin" | "staff";
  acceptUrl: string;
}): string {
  const roleLabel = role === "admin" ? "an Admin" : "a team member";

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F6F7F9;font-family:Helvetica,Arial,sans-serif;color:#0E1220;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #E7E9EF;">
            <tr>
              <td style="height:6px;background:#4F46E5;"></td>
            </tr>
            <tr>
              <td style="padding:32px 32px 24px;">
                <p style="margin:0 0 4px;font-size:13px;color:#8A92A6;">QuotationToCash</p>
                <h1 style="margin:0 0 16px;font-size:20px;">You're invited to join ${businessName}</h1>
                <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#3D4453;">
                  ${inviterName} invited you to join <strong>${businessName}</strong> on
                  QuotationToCash as ${roleLabel}.
                </p>
                <a
                  href="${acceptUrl}"
                  style="display:inline-block;background:#4F46E5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:8px;"
                >
                  View invitation
                </a>
                <p style="margin:20px 0 0;font-size:12px;color:#8A92A6;">
                  This link expires in 7 days. If you weren't expecting this, you
                  can safely ignore it.
                </p>
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
