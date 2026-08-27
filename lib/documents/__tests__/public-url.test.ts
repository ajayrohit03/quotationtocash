import { afterEach, describe, expect, it, vi } from "vitest";
import { publicDocumentUrl } from "@/lib/documents/public-url";

describe("publicDocumentUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a subdomain URL from the business slug and NEXT_PUBLIC_APP_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com");
    expect(publicDocumentUrl("abc123", "aram-info-tech")).toBe(
      "https://aram-info-tech.app.example.com/public/documents/abc123",
    );
  });

  it("strips a trailing slash on the base URL rather than double-slashing", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.com/");
    expect(publicDocumentUrl("abc123", "aram-info-tech")).toBe(
      "https://aram-info-tech.app.example.com/public/documents/abc123",
    );
  });

  it("falls back to localhost when the env var is unset", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(publicDocumentUrl("abc123", "aram-info-tech")).toBe(
      "http://aram-info-tech.localhost:3000/public/documents/abc123",
    );
  });

  it("preserves the port when adding the subdomain", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
    expect(publicDocumentUrl("abc123", "aram-info-tech")).toBe(
      "http://aram-info-tech.localhost:3000/public/documents/abc123",
    );
  });
});
