import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { SUPPORT_EMAIL } from "@/lib/pricing";

export const metadata: Metadata = { title: "Payments status | ShouldBuild", description: "Current ShouldBuild paid-checkout and technical-run credit status." };

const sections: LegalSection[] = [
  { title: "Paid purchases are unavailable", paragraphs: ["ShouldBuild does not currently offer an active paid checkout, subscription, report pack, or one-off purchase. Dodo Payments is not connected. ShouldBuild therefore cannot create a product charge or process a product refund at this time.", "Commercial prices, renewal terms, credit expiry, rollover, taxes, cancellation, and refund terms remain undecided. They will be published before any paid checkout is enabled."] },
  { title: "Technical run failures", paragraphs: ["When an entitled research run fails before completion, the database entitlement workflow restores the reserved credit. A negative verdict or disagreement with a report is not a technical failure." ] },
  { title: "Unexpected charge", paragraphs: [<>If you see a charge that appears to reference ShouldBuild, email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> with the descriptor and date. Do not send a complete card number.</>] },
];

export default function RefundsPage() { return <LegalPage eyebrow="Access status" title="Payments and refunds" summary="Paid checkout is not currently available. These statements describe the product as it operates today." sections={sections}/>; }
