import type { Metadata } from "next";
import { PricingPageClient } from "@/components/pricing/pricing-page-client";

export const metadata: Metadata = {
  title: "Pricing & Access | ShouldBuild",
  description: "See current ShouldBuild access, report credit requirements, and the evidence gates behind Quick Scan and Full Validation.",
  openGraph: {
    title: "Pricing & Access | ShouldBuild",
    description: "Current access terms and the evidence standards behind each ShouldBuild report depth.",
  },
};

export default async function PricingPage() {
  return <PricingPageClient />;
}
