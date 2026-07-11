import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://signalfit.app"),
  title: "SignalFit — Know what to build before you build it",
  description: "Validate your product idea in minutes. See buyer pain, competition, pricing, risks, MVP scope, and a clear build/validate/avoid verdict — backed by real market signals.",
  openGraph: { title: "SignalFit — Stop building products nobody wants.", description: "Get a market-backed verdict on your product idea. Buyer pain, competition, pricing, risks, MVP scope, and your first-customer plan — in one report." },
  twitter: { card: "summary_large_image", title: "SignalFit — Validate before you build." },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/><link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Instrument+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet"/></head><body suppressHydrationWarning>{children}</body></html>;
}
