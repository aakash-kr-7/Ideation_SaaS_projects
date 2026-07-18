import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "@/components/legal/legal-page";
import { SUPPORT_EMAIL } from "@/lib/pricing";

export const metadata: Metadata = { title: "Refund Policy | ShouldBuild", description: "ShouldBuild first-purchase guarantee, renewal, duplicate-charge, and technical-failure refund rules." };

const sections: LegalSection[] = [
  { title: "Seven-day first-purchase guarantee", paragraphs: ["You may request a full refund within seven calendar days of your first paid purchase, subject to the usage limits below. Each account is eligible for one first-purchase guarantee and one goodwill refund unless mandatory law requires otherwise."] },
  { title: "One-off purchases", bullets: ["The request must be made within seven calendar days.", "No more than one paid report may have been successfully generated.", "The account must not have previously received a goodwill refund.", "The request must not show obvious duplicate-account or refund abuse."], paragraphs: ["Unused one-off passes remain valid for 12 months from purchase."] },
  { title: "First subscription purchase", bullets: ["The request must be made within seven calendar days.", "No more than three credits may have been consumed.", "No previous subscription refund may have been issued."], paragraphs: ["Three credits equal one Full Validation or three Quick Scans."] },
  { title: "Renewals and cancellation", bullets: ["Monthly renewals are normally non-refundable.", "An accidental annual renewal may be refunded within seven days if no renewal-period credits were used.", "Cancellation stops the next renewal and access continues through the paid period.", "Generated reports remain accessible; unused subscription credits expire after the paid period ends." ] },
  { title: "Duplicate, unauthorized, and failed transactions", paragraphs: ["Duplicate charges and verified unauthorized transactions are reviewed and refunded where appropriate. Dodo Payments may require verification and applies its own transaction and refund controls as Merchant of Record."] },
  { title: "Technical failures", paragraphs: ["Verified worker failures, evidence-persistence failures, exhausted provider retries, failed report generation, failure before a usable export is produced, or a run exceeding its technical budget will restore the credit or be refunded. Re-downloading an existing export is always free."], bullets: ["A negative or Avoid verdict is not a technical failure.", "Disagreement with a conclusion is not a technical failure.", "Changing the idea, audience, geography, pricing assumption, or requesting fresh research requires a new run."] },
  { title: "How to request a refund", paragraphs: [<>Email <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> from the address associated with your account. Include the payment or invoice reference and a short explanation. We may ask for reasonable verification before acting.</>] },
];

export default function RefundsPage() { return <LegalPage eyebrow="Billing policy" title="Refund Policy" summary="A clear first-purchase guarantee, automatic protection for technical failures, and straightforward renewal rules." sections={sections}/>; }
