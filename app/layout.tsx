import type { Metadata } from "next";
import { Instrument_Sans, IBM_Plex_Mono, Bricolage_Grotesque } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { shadcn } from "@clerk/ui/themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { headers } from "next/headers";
import { isInternalHost } from "@/lib/admin/host";
import "./globals.css";

const instrumentSans = Instrument_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
});

const SITE_TITLE = "QuotationToCash — GST-ready invoicing for Indian businesses";
const SITE_DESCRIPTION =
  "Professional GST-compliant invoicing software for Indian businesses. Create quotations, tax invoices, track payments, manage vendors and see per-job profit — all in one place.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.quotationtocash.com"),
  title: { default: SITE_TITLE, template: "%s | QuotationToCash" },
  description: SITE_DESCRIPTION,
  keywords: [
    "GST invoice software India",
    "online invoicing India",
    "GST billing software",
    "tax invoice generator",
    "quotation to invoice",
    "accounts payable India",
    "freight invoice software",
    "Indian SME invoicing",
  ],
  authors: [{ name: "QuotationToCash" }],
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "https://www.quotationtocash.com",
    siteName: "QuotationToCash",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "QuotationToCash — From Quote to Revenue",
      },
    ],
    locale: "en_IN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QuotationToCash — GST-ready invoicing",
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const html = (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${ibmPlexMono.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );

  // The admin and analytics sites have their own cookie auth and bypass Clerk middleware
  // (proxy.ts) — don't load Clerk's provider/script there at all.
  if (isInternalHost((await headers()).get("host"))) return html;

  return <ClerkProvider appearance={{ theme: shadcn }}>{html}</ClerkProvider>;
}
