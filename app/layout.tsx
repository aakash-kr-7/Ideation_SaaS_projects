import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://signalfit.app"),
  title: "SignalFit — Founder intelligence before commitment",
  description: "Research the buyer, market, risks, and next test before committing weeks to a product idea.",
  openGraph: { title: "SignalFit — Research before commitment.", description: "Founder intelligence for the decisions that happen before the build." },
  twitter: { card: "summary_large_image", title: "SignalFit" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body suppressHydrationWarning>{children}</body></html>;
}
