import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/layout/auth-provider";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://shouldbuild.app"),
  title: "ShouldBuild — Evidence-backed idea research",
  description: "ShouldBuild searches public web sources and produces cited reports with a deterministic 12-factor score and verdict.",
  alternates: {
    canonical: "/",
  },
  applicationName: "ShouldBuild",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: { 
    title: "ShouldBuild — Evidence-backed idea research", 
    description: "Choose a Quick Scan or Full Validation and review cited public-source evidence with a deterministic score.",
    type: "website",
    url: "/",
    siteName: "ShouldBuild",
    images: [{ url: "/brand/shouldbuild-mark.svg", width: 1199, height: 1198, alt: "ShouldBuild" }],
  },
  twitter: { 
    card: "summary_large_image", 
    title: "ShouldBuild — Evidence-backed idea research",
    description: "Review cited public-source evidence through Quick Scan or Full Validation.",
    images: ["/brand/shouldbuild-mark.svg"],
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
