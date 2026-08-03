import { LandingPage } from "@/components/landing/landing-page";
import { sampleFullValidation } from "@/lib/sample-reports";

export default function Page() {
  return <LandingPage report={sampleFullValidation}/>;
}
