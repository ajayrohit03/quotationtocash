import { clerkMiddleware } from "@clerk/nextjs/server";

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
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|api/admin(?:/|$)|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api(?!/admin(?:/|$))|trpc)(.*)",
  ],
};
