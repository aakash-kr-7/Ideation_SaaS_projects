import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://signalfit.app"),
  title: "SignalFit — Evidence-backed opportunity validation",
  description: "Turn product ideas into evidence-backed validation reports before you build.",
  openGraph: { title: "SignalFit — Stop building products nobody asked for.", description: "Evidence-backed opportunity validation for serious builders." },
  twitter: { card: "summary_large_image", title: "SignalFit" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body suppressHydrationWarning>{children}</body></html>;
}
