import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { resolveAdminRouting } from "@/lib/admin/host";

// Clerk's routing/matcher-based protection (`createRouteMatcher` +
// `auth.protect()`) is deprecated in favor of resource-based checks: each
// page, layout, API route, and public route resolves its own auth via
// requireAuth() / requireBusiness() (see lib/auth/). This middleware only
// establishes the Clerk auth context so those calls work.
//
// No subdomain-rewrite logic lives here — see
// docs/public-share-subdomains-design.md §2 for why: Next.js already
// routes /public/documents/* correctly regardless of Host, and both the
// page and the PDF route derive the subdomain themselves directly from
// the raw Host header (via lib/documents/public-access.ts), which proved
// more reliable in testing than threading it through a middleware
// rewrite's search params.
//
// /api/admin/* is excluded from this middleware entirely (see matcher
// below — BOTH entries need the exclusion, the first one also matches
// /api/*): it authenticates with ADMIN_PASSWORD in the route handler
// itself (lib/admin/auth.ts), never with Clerk. See
// docs/feature-flags-and-plans-design.md §5.
//
// Admin site: requests whose host starts "admin." are rewritten to the
// /admin/* routes (lib/admin/host.ts) and NEVER reach clerkMiddleware —
// the admin UI has its own cookie auth (lib/admin/session.ts). /admin/*
// on any other host is a 404. See docs/feature-flags-and-plans-design.md.
const clerk = clerkMiddleware();

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const routing = resolveAdminRouting(request.headers.get("host"), request.nextUrl.pathname);
  if (routing.kind === "notFound") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (routing.kind === "rewrite") {
    const url = request.nextUrl.clone();
    url.pathname = routing.pathname;
    return NextResponse.rewrite(url);
  }
  return clerk(request, event);
}

export const config = {
  matcher: [
    "/((?!_next|api/admin(?:/|$)|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/admin(?:/|$))|trpc)(.*)",
  ],
};
