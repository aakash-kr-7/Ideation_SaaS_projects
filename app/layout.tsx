import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://buildsignal.app"),
  title: "BuildSignal — Evidence-backed opportunity validation",
  description: "Turn product ideas into evidence-backed validation reports before you build.",
  openGraph: {
    title: "BuildSignal — Stop building products nobody asked for.",
    description: "Evidence-backed opportunity validation for serious builders.",
    images: [{ url: "/og.png", width: 1728, height: 912, alt: "BuildSignal opportunity validation dashboard" }],
  },
  twitter: { card: "summary_large_image", title: "BuildSignal", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body suppressHydrationWarning>{children}</body></html>;
}
