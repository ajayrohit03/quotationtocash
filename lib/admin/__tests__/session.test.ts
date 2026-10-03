import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const PASSWORD = "session-test-password-0123456789";
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  process.env.ADMIN_PASSWORD = PASSWORD;
});
afterEach(() => {
  vi.resetModules();
});

async function load() {
  return import("../session");
}

describe("admin session token", () => {
  it("verifies a fresh token", async () => {
    const { createAdminSessionToken, verifyAdminSessionToken } = await load();
    expect(verifyAdminSessionToken(createAdminSessionToken())).toBe(true);
  });

  it("expires after 24 hours and rejects future-dated tokens", async () => {
    const { createAdminSessionToken, verifyAdminSessionToken } = await load();
    const t = 1_700_000_000_000;
    const token = createAdminSessionToken(t);
    expect(verifyAdminSessionToken(token, t + DAY - 1)).toBe(true);
    expect(verifyAdminSessionToken(token, t + DAY + 1)).toBe(false);
    expect(verifyAdminSessionToken(token, t - 1000)).toBe(false);
  });

  it("rejects tampered, malformed, and empty tokens", async () => {
    const { createAdminSessionToken, verifyAdminSessionToken } = await load();
    const token = createAdminSessionToken();
    const [ts, sig] = token.split(".");
    for (const bad of [
      "",
      "garbage",
      `${ts}.`,
      `.${sig}`,
      `${Number(ts) + 1}.${sig}`,
      `${ts}.${sig.slice(0, -1)}0`,
      `${ts}.${sig}.extra`,
      `abc.${sig}`,
    ]) {
      expect(verifyAdminSessionToken(bad)).toBe(false);
    }
  });

  it("is invalidated when ADMIN_PASSWORD changes", async () => {
    const { createAdminSessionToken } = await load();
    const token = createAdminSessionToken();
    process.env.ADMIN_PASSWORD = "a-different-password-9876543210";
    vi.resetModules();
    const fresh = await load();
    expect(fresh.verifyAdminSessionToken(token)).toBe(false);
  });

  it("fails closed when ADMIN_PASSWORD is unset", async () => {
    const { createAdminSessionToken } = await load();
    const token = createAdminSessionToken();
    delete process.env.ADMIN_PASSWORD;
    vi.resetModules();
    const fresh = await load();
    expect(fresh.verifyAdminSessionToken(token)).toBe(false);
  });
});
