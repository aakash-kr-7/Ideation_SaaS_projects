import { LandingPage } from "@/components/landing/landing-page";
import { getPricingRegionHint } from "@/lib/pricing-region.server";

export default async function Page() {
  return <LandingPage initialRegion={await getPricingRegionHint()} />;
}
