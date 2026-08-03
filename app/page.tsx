import type { Metadata } from "next";
import { LandingPage } from "@/components/landing/landing-page";
import { sampleFullValidation } from "@/lib/sample-reports";

export const metadata: Metadata = {
  title: "Startup Idea Validation & Market Research | ShouldBuild",
  description:
    "Validate your startup idea with cited market research, 12-factor scoring, evidence grading, competitor analysis, and an adversarial build, validate, or walk-away verdict.",
  alternates: {
    canonical: "/",
  },
  keywords: [
    "startup idea validation",
    "startup market research",
    "business idea validation",
    "product market fit research",
    "validate startup idea",
    "competitor analysis for startups",
  ],
  openGraph: {
    title: "Startup Idea Validation & Market Research | ShouldBuild",
    description:
      "Research demand, competition, pricing, and risk before you build. Get a cited, adversarial startup validation report with explicit evidence gaps.",
    type: "website",
    url: "/",
    siteName: "ShouldBuild",
    images: [
      {
        url: "/brand/shouldbuild-mark.svg",
        width: 1199,
        height: 1198,
        alt: "ShouldBuild startup idea validation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Startup Idea Validation & Market Research | ShouldBuild",
    description:
      "Validate demand, competition, pricing, and risk with a cited, adversarial startup research report.",
    images: ["/brand/shouldbuild-mark.svg"],
  },
};

export default function Page() {
  return <LandingPage report={sampleFullValidation}/>;
}
