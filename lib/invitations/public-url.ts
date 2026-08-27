import { appBaseUrl } from "@/lib/app-url";

// Invitation links are explicitly out of scope for the subdomain-based
// public share URLs (docs/public-share-subdomains-design.md §8) — this
// stays a flat URL, unchanged in shape. Only the base-URL lookup itself
// is consolidated onto the shared helper (previously its own
// independent copy of the same process.env read).
export function invitationAcceptUrl(rawToken: string): string {
  return `${appBaseUrl()}/invite/${rawToken}`;
}
