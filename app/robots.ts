import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/invoices",
        "/quotations",
        "/proforma-invoices",
        "/purchase-invoices",
        "/customers",
        "/vendors",
        "/products",
        "/jobs",
        "/settings",
        "/onboarding",
        "/invite/",
        "/invitations",
        "/public/",
      ],
    },
    sitemap: "https://www.quotationtocash.com/sitemap.xml",
  };
}
