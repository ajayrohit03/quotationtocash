import "server-only";

import { checkRateLimit } from "@/lib/rate-limit";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Thresholds from docs/invitation-onboarding-design.md §6.2 — starting
// points, easy to tune once real usage exists. What matters is that
// something backs these endpoints before shipping, not that the exact
// numbers are final.
export function checkInviterRateLimit(userId: string) {
  return checkRateLimit(`invite:user:${userId}`, HOUR_MS, 20);
}

export function checkTargetEmailRateLimit(email: string) {
  return checkRateLimit(`invite:email:${email.trim().toLowerCase()}`, DAY_MS, 5);
}

export function checkAcceptIpRateLimit(ip: string) {
  return checkRateLimit(`invite-accept:ip:${ip}`, HOUR_MS, 30);
}
