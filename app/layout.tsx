import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/layout/auth-provider";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://signalfit.app"),
  title: "SignalFit — Startup Idea Validation Tool",
  description: "Automated product-market fit research. SignalFit uses a multi-pass pipeline to test your idea against real market signals and delivers a 12-factor cited verdict.",
  alternates: {
    canonical: "/",
  },
  openGraph: { 
    title: "SignalFit — Startup Idea Validation Tool", 
    description: "Automated product-market fit research. Run your startup idea through an adversarial pipeline to find willingness-to-pay and competitor gaps.",
    type: "website",
    url: "/",
  },
  twitter: { 
    card: "summary_large_image", 
    title: "SignalFit — Automated Market Validation",
    description: "Test your startup idea against real market signals in minutes.",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=Instrument+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body suppressHydrationWarning>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
