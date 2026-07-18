import type { Metadata } from "next";
import { PricingPageClient } from "@/components/pricing/pricing-page-client";

export const metadata: Metadata = {
  title: "Report Access | ShouldBuild",
  description: "Current Quick Scan access and the status of unavailable paid plans and checkout.",
};

export default async function PricingPage() {
  return <PricingPageClient />;
}
