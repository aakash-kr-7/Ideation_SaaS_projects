import type { Metadata } from "next";
import { PricingPageClient } from "@/components/pricing/pricing-page-client";
import { getPricingRegionHint } from "@/lib/pricing-region.server";

export const metadata: Metadata = {
  title: "Pricing | ShouldBuild",
  description: "One free Quick Scan every month, affordable one-off validation reports, and a flexible Pro plan.",
};

export default async function PricingPage() {
  return <PricingPageClient initialRegion={await getPricingRegionHint()} />;
}
