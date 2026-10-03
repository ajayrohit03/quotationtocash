import { describe, expect, it } from "vitest";
import { isAdminHost, isAnalyticsHost, isInternalHost, resolveAdminRouting } from "../host";

describe("isAdminHost", () => {
  it("matches admin.* hosts with or without port, any case", () => {
    expect(isAdminHost("admin.quotationtocash.com")).toBe(true);
    expect(isAdminHost("ADMIN.quotationtocash.com")).toBe(true);
    expect(isAdminHost("admin.localhost:3000")).toBe(true);
  });

  it("does not match the apex, www, business subdomains, or look-alikes", () => {
    for (const h of [
      "quotationtocash.com",
      "www.quotationtocash.com",
      "acme.quotationtocash.com",
      "administrator.quotationtocash.com",
      "notadmin.quotationtocash.com",
      "localhost:3000",
      "",
      null,
      undefined,
    ]) {
      expect(isAdminHost(h)).toBe(false);
    }
  });
});

describe("resolveAdminRouting", () => {
  const admin = "admin.quotationtocash.com";
  const main = "www.quotationtocash.com";

  it("rewrites admin-host pages onto /admin/*", () => {
    expect(resolveAdminRouting(admin, "/")).toEqual({ kind: "rewrite", pathname: "/admin" });
    expect(resolveAdminRouting(admin, "/login")).toEqual({ kind: "rewrite", pathname: "/admin/login" });
    expect(resolveAdminRouting(admin, "/businesses/abc")).toEqual({
      kind: "rewrite",
      pathname: "/admin/businesses/abc",
    });
  });

  it("refuses non-admin API routes and explicit /admin paths on the admin host", () => {
    expect(resolveAdminRouting(admin, "/api/jobs")).toEqual({ kind: "notFound" });
    expect(resolveAdminRouting(admin, "/api")).toEqual({ kind: "notFound" });
    expect(resolveAdminRouting(admin, "/admin/login")).toEqual({ kind: "notFound" });
  });

  it("hides /admin/* on every other host and leaves the rest alone", () => {
    expect(resolveAdminRouting(main, "/admin")).toEqual({ kind: "notFound" });
    expect(resolveAdminRouting(main, "/admin/businesses")).toEqual({ kind: "notFound" });
    expect(resolveAdminRouting(main, "/dashboard")).toEqual({ kind: "pass" });
    expect(resolveAdminRouting(main, "/administrator")).toEqual({ kind: "pass" });
    expect(resolveAdminRouting("acme.quotationtocash.com", "/public/documents/x")).toEqual({ kind: "pass" });
  });
});

describe("analytics host (app.*)", () => {
  const app = "app.quotationtocash.com";

  it("matches app.* hosts only — not look-alikes", () => {
    expect(isAnalyticsHost(app)).toBe(true);
    expect(isAnalyticsHost("APP.localhost:3000")).toBe(true);
    for (const h of ["application.quotationtocash.com", "apple.quotationtocash.com", "myapp.quotationtocash.com", "www.quotationtocash.com", "admin.quotationtocash.com", "", null]) {
      expect(isAnalyticsHost(h)).toBe(false);
    }
    expect(isInternalHost(app)).toBe(true);
    expect(isInternalHost("admin.quotationtocash.com")).toBe(true);
    expect(isInternalHost("www.quotationtocash.com")).toBe(false);
  });

  it("rewrites onto /analytics/* and hides every other prefix", () => {
    expect(resolveAdminRouting(app, "/")).toEqual({ kind: "rewrite", pathname: "/analytics" });
    expect(resolveAdminRouting(app, "/login")).toEqual({ kind: "rewrite", pathname: "/analytics/login" });
    expect(resolveAdminRouting(app, "/analytics")).toEqual({ kind: "notFound" });
    expect(resolveAdminRouting(app, "/admin/businesses")).toEqual({ kind: "notFound" });
    expect(resolveAdminRouting(app, "/api/jobs")).toEqual({ kind: "notFound" });
  });

  it("makes /analytics 404 on the admin and main hosts, and /admin 404 on app.", () => {
    expect(resolveAdminRouting("admin.quotationtocash.com", "/analytics")).toEqual({ kind: "notFound" });
    expect(resolveAdminRouting("www.quotationtocash.com", "/analytics/login")).toEqual({ kind: "notFound" });
    expect(resolveAdminRouting("www.quotationtocash.com", "/analytics-report")).toEqual({ kind: "pass" });
  });
});
