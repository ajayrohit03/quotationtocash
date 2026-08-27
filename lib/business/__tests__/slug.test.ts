import { describe, expect, it } from "vitest";
import { RESERVED_SLUGS, generateUniqueSlug, slugify } from "@/lib/business/slug";

describe("slugify", () => {
  it("lowercases and hyphenates a normal business name", () => {
    expect(slugify("Aram Info Tech")).toBe("aram-info-tech");
  });

  it("collapses runs of punctuation to a single hyphen", () => {
    expect(slugify("Ajar & Associates, LLP.")).toBe("ajar-associates-llp");
  });

  it("strips accents", () => {
    expect(slugify("Café René")).toBe("cafe-rene");
  });

  it("trims leading/trailing hyphens left by punctuation at the edges", () => {
    expect(slugify("-- Acme --")).toBe("acme");
  });

  it("falls back to 'business' for a name that slugifies to nothing", () => {
    expect(slugify("™️©®")).toBe("business");
  });

  it("caps at the DNS label length limit", () => {
    const long = "a".repeat(100);
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(63);
  });
});

describe("generateUniqueSlug", () => {
  it("returns the base slug when nothing is taken", async () => {
    const slug = await generateUniqueSlug("Fresh Business", async () => false);
    expect(slug).toBe("fresh-business");
  });

  it("appends -2, -3, ... until an untaken candidate is found", async () => {
    const taken = new Set(["dup-co", "dup-co-2", "dup-co-3"]);
    const slug = await generateUniqueSlug("Dup Co", async (candidate) =>
      taken.has(candidate),
    );
    expect(slug).toBe("dup-co-4");
  });

  it("treats a reserved word as taken, even if the DB check would say no", async () => {
    const reserved = [...RESERVED_SLUGS][0];
    const slug = await generateUniqueSlug(reserved, async () => false);
    expect(slug).not.toBe(reserved);
    expect(slug).toBe(`${reserved}-2`);
  });
});
