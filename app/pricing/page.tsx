import type { Metadata } from "next";
import { PricingPageClient } from "@/components/pricing/pricing-page-client";

export const metadata: Metadata = {
  title: "Pricing & Access | ShouldBuild",
  description: "Start with a free monthly Quick Scan. Full Validation available via paid credits. See what each report includes and how access works.",
  openGraph: {
    title: "Pricing & Access | ShouldBuild",
    description: "One free Quick Scan every month. Full Validation depth for ideas worth committing to.",
  },
};

export default async function PricingPage() {
  return <PricingPageClient />;
}
