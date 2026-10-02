import type { MetadataRoute } from "next";

// Only the public marketing page; everything else is behind sign-in.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://www.quotationtocash.com",
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
