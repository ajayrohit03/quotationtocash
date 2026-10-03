import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

// Keyed by ADMIN_PASSWORD itself, so rotating the password invalidates
// every outstanding session. Token = "<issuedAtMs>.<hex hmac>".
function sign(issuedAt: string): string {
  return createHmac("sha256", env.ADMIN_PASSWORD).update(`admin-session:${issuedAt}`).digest("hex");
}

export function createAdminSessionToken(now = Date.now()): string {
  const issuedAt = String(now);
  return `${issuedAt}.${sign(issuedAt)}`;
}

export function verifyAdminSessionToken(token: string, now = Date.now()): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [issuedAt, signature] = parts;
  if (!/^\d{1,15}$/.test(issuedAt)) return false;

  const age = now - Number(issuedAt);
  if (age < 0 || age > ADMIN_SESSION_TTL_MS) return false;

  let expected: string;
  try {
    expected = sign(issuedAt);
  } catch {
    return false; // ADMIN_PASSWORD unset/too short: fail closed
  }
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
