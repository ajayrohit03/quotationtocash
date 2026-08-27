import type { NextRequest } from "next/server";

// NextRequest has no reliable built-in `.ip` in the App Router — this
// reads the standard proxy header, falling back to a fixed bucket rather
// than throwing when it's absent (e.g. local dev without a proxy in
// front), so IP-based rate limiting degrades to "one shared bucket"
// instead of failing.
export function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return "unknown";
}
