import { describe, expect, it } from "vitest";
import { isAdminHost, resolveAdminRouting } from "../host";

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
