import "server-only";

import { randomBytes, createHash } from "node:crypto";

// 256 bits — larger than the 24-byte shareToken used for read-only
// document links, since this token grants account/business membership, a
// materially more sensitive action. See
// docs/invitation-onboarding-design.md §3.
export function generateInvitationToken(): {
  rawToken: string;
  tokenHash: string;
} {
  const rawToken = randomBytes(32).toString("hex");
  return { rawToken, tokenHash: hashInvitationToken(rawToken) };
}

// Only the hash is ever persisted (§3) — this is the one place both
// sides (creation and lookup) compute it, so they can never drift.
export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}
