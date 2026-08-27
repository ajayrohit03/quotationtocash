import { appBaseUrl } from "@/lib/app-url";

// The public share URL now carries the business's identity in the
// subdomain rather than a flat path — see
// docs/public-share-subdomains-design.md. The path itself
// (/public/documents/:token) is deliberately unchanged: all the branding
// value is in the subdomain, and keeping the path as-is is what keeps
// the actual route handlers' changes minimal (§2, §4 of the design doc).
export function publicDocumentUrl(shareToken: string, businessSlug: string): string {
  const url = new URL(appBaseUrl());
  url.hostname = `${businessSlug}.${url.hostname}`;
  url.pathname = `/public/documents/${shareToken}`;
  return url.toString().replace(/\/$/, "");
}
