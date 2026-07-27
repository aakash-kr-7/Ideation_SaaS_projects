import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/layout/auth-provider";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://shouldbuild.app"),
  title: "ShouldBuild — Startup Idea Validation Before You Build",
  description: "Stop building on assumptions. Get an evidence-backed market validation report with real cited sources, competitor analysis, and a definitive build or avoid verdict.",
  alternates: {
    canonical: "/",
  },
  applicationName: "ShouldBuild",
  keywords: ["startup idea validation", "validate business idea before building", "business idea validation report", "market demand analysis", "startup market research", "AI validation tool", "should I build this"],
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  openGraph: { 
    title: "ShouldBuild — Startup Idea Validation Before You Build", 
    description: "Don't waste months building the wrong thing. ShouldBuild searches real public sources and delivers a cited verdict on whether to build, pivot, or walk away.",
    type: "website",
    url: "/",
    siteName: "ShouldBuild",
    images: [{ url: "/brand/shouldbuild-mark.svg", width: 1199, height: 1198, alt: "ShouldBuild — Startup idea validation" }],
  },
  twitter: { 
    card: "summary_large_image", 
    title: "ShouldBuild — Startup Idea Validation Before You Build",
    description: "Get a definitive verdict on your startup idea based on cited market evidence, competitor gaps, and real pricing signals.",
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
