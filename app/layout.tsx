import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://signalfit.app"),
  title: "SignalFit — Decision intelligence for builders",
  description: "Structured research memos that separate evidence from assumption — so you know what to build, what to test, and what to walk away from.",
  openGraph: { title: "SignalFit — Know the answer before you write the code.", description: "Decision intelligence for founders and product teams. Evidence-backed research memos, not opinions." },
  twitter: { card: "summary_large_image", title: "SignalFit — Decision Intelligence" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><head><link rel="preconnect" href="https://fonts.googleapis.com"/><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous"/><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet"/></head><body suppressHydrationWarning>{children}</body></html>;
}
