import { describe, expect, it } from "vitest";
import { extractBusinessSlug } from "@/lib/business/subdomain";

describe("extractBusinessSlug", () => {
  const apex = "quotationtocash.com";

  it("returns null for the bare apex domain", () => {
    expect(extractBusinessSlug("quotationtocash.com", apex)).toBeNull();
  });

  it("returns null for www", () => {
    expect(extractBusinessSlug("www.quotationtocash.com", apex)).toBeNull();
  });

  it("extracts a single-label subdomain as the candidate slug", () => {
    expect(extractBusinessSlug("aram-info-tech.quotationtocash.com", apex)).toBe(
      "aram-info-tech",
    );
  });

  it("returns null for a deeper, multi-label subdomain", () => {
    expect(
      extractBusinessSlug("foo.bar.quotationtocash.com", apex),
    ).toBeNull();
  });

  it("returns null for an unrelated domain entirely", () => {
    expect(extractBusinessSlug("example.com", apex)).toBeNull();
  });

  it("returns null for a host that merely ends with the apex as a substring, not a real subdomain", () => {
    expect(extractBusinessSlug("evilquotationtocash.com", apex)).toBeNull();
  });

  it("works the same way for a *.localhost apex, for local dev", () => {
    const localApex = "localhost";
    expect(extractBusinessSlug("aram-info-tech.localhost", localApex)).toBe(
      "aram-info-tech",
    );
    expect(extractBusinessSlug("localhost", localApex)).toBeNull();
  });
});
