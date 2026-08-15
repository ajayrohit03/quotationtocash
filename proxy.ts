import { clerkMiddleware } from "@clerk/nextjs/server";

// Clerk's routing/matcher-based protection (`createRouteMatcher` +
// `auth.protect()`) is deprecated in favor of resource-based checks: each
// page, layout, API route, and public route resolves its own auth via
// requireAuth() / requireBusiness() (see lib/auth/). This middleware only
// establishes the Clerk auth context so those calls work.
export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
