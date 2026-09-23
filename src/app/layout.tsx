import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const SITE_URL = "https://web3rails.io";
const DESCRIPTION =
  "Web3Rails connects onchain payments and blockchain activity with accounting, treasury, reporting and enterprise financial operations. Stablecoin reconciliation first.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Web3Rails — Infrastructure for Onchain Finance",
    template: "%s — Web3Rails",
  },
  description: DESCRIPTION,
  keywords: [
    "onchain finance",
    "stablecoin payments",
    "crypto reconciliation",
    "blockchain accounting",
    "onchain accounting",
    "stablecoin reconciliation",
    "financial infrastructure",
    "onchain treasury",
    "blockchain financial operations",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Web3Rails",
    title: "Web3Rails — Infrastructure for Onchain Finance",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Web3Rails — Infrastructure for Onchain Finance",
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0f13" },
  ],
};

const orgJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Web3Rails",
  url: SITE_URL,
  description: DESCRIPTION,
  email: "hello@web3rails.io",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:rounded-md focus:bg-fg focus:px-3 focus:py-2 focus:text-sm focus:text-bg"
        >
          Skip to content
        </a>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
        />
      </body>
    </html>
  );
}
