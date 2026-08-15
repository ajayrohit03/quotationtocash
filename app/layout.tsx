import type { Metadata } from "next";
import { Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
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

export const metadata: Metadata = {
  title: "InvoiceFlow",
  description: "Quotations and invoices for small businesses, built for Indian GST.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        className={`${instrumentSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
      >
        <body className="min-h-full flex flex-col">
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
