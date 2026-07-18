"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, CircleHelp, RotateCcw, ShieldCheck, WalletCards } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { launchPricing, regionalPrice, type PricingRegionHint } from "@/lib/pricing";
import { usePricingRegion } from "@/components/pricing/use-pricing-region";

const oneOffProducts = [
  {
    key: "quick" as const,
    name: "Quick Scan",
    description: "Find out whether an idea deserves a serious investigation.",
    credits: "1 credit",
    href: "/research/new?mode=quick_scan",
    items: ["12-factor score and official verdict", "Evidence confidence and clickable citations", "Competitor, pricing, risk, and next-step snapshots", "Branded PDF and permanent report history"],
  },
  {
    key: "full" as const,
    name: "Full Validation",
    description: "Stress-test the idea before committing meaningful time or money.",
    credits: "3 credits",
    href: "/research/new?mode=full_validation",
    featured: true,
    items: ["Multi-pass and adversarial research", "Competition, demand, market, pricing, risk, and GTM analysis", "Detailed 12-factor score and MVP scope", "PDF, Markdown, CSV, and JSON exports"],
  },
  {
    key: "compare" as const,
    name: "Compare Pack",
    description: "Three Full Validations for comparing multiple directions.",
    credits: "9 credits · valid for 12 months",
    href: "/compare",
    items: ["Three complete Full Validations", "Side-by-side comparison", "All export formats", "No subscription required"],
  },
];

const faq = [
  ["Is the free report genuinely useful?", "Yes. It includes the complete Quick Scan experience, citations, a verdict, risks, next steps, and a branded PDF. It is not a blurred teaser."],
  ["How do report credits work?", "A Quick Scan uses 1 credit and a Full Validation uses 3. Pro includes 6 credits monthly, so you can run six Quick Scans, two Full Validations, or any equivalent mix."],
  ["Do paid credits roll over?", "Yes, while Pro remains active, up to a 12-credit balance. One-off report credits are valid for 12 months from purchase."],
  ["What happens if a report fails?", "A verified technical failure restores the affected credit automatically. A negative verdict is a valid report and does not count as a failure."],
  ["Can I cancel Pro anytime?", "Yes. Cancellation stops the next renewal, access continues through the paid period, and generated reports remain available afterward."],
  ["Are prices tax inclusive?", "Yes. Taxes are included where applicable. Dodo Payments is the Merchant of Record and the billing country and currency confirmed at checkout are authoritative."],
];

export function PricingPageClient({ initialRegion }: { initialRegion: PricingRegionHint }) {
  const region = usePricingRegion(initialRegion);
  const [annual, setAnnual] = useState(false);
  const currencyLabel = region === "india" ? "INR for India" : "USD globally";
  const proPrice = regionalPrice(annual ? launchPricing.plans.proAnnual : launchPricing.plans.proMonthly, region);

  return <AppShell title="Pricing"><div className="page-content pricing-page production-pricing">
    <header className="pricing-heading pricing-hero">
      <p className="eyebrow">Simple, tax-inclusive pricing</p>
      <h2>Start free. Pay only when an idea deserves deeper research.</h2>
      <p>One free Quick Scan every 30 days. No card required. Choose a one-off report or subscribe when you validate repeatedly.</p>
      <div className="pricing-region-note"><WalletCards size={15}/><b>{currencyLabel}</b><span>Location-based display; checkout confirms the final billing currency.</span></div>
    </header>

    <section className="pricing-section" aria-labelledby="one-off-heading">
      <div className="pricing-section-head"><div><p className="eyebrow">No subscription required</p><h2 id="one-off-heading">One-off reports</h2></div><small>Passes remain valid for 12 months</small></div>
      <div className="plans three-plans one-off-plans">
        {oneOffProducts.map(product => <article className={product.featured ? "plan featured" : "plan"} key={product.key}>
          {product.featured && <span className="popular">FLAGSHIP REPORT</span>}
          <p>{product.name.toUpperCase()}</p>
          <h3>{regionalPrice(launchPricing.oneOff[product.key], region)}</h3>
          <span>{product.description}</span>
          <small className="credit-label">{product.credits}</small>
          <Link className={product.featured ? "button" : "button ghost"} href={product.href}>Choose {product.name}</Link>
          <ul>{product.items.map(item => <li key={item}><Check size={15}/>{item}</li>)}</ul>
        </article>)}
      </div>
    </section>

    <section className="pricing-section" aria-labelledby="plans-heading">
      <div className="pricing-section-head"><div><p className="eyebrow">For repeat validation</p><h2 id="plans-heading">Monthly plans</h2></div>
        <div className="billing-toggle" role="group" aria-label="Billing period">
          <button type="button" className={!annual ? "active" : ""} aria-pressed={!annual} onClick={() => setAnnual(false)}>Monthly</button>
          <button type="button" className={annual ? "active" : ""} aria-pressed={annual} onClick={() => setAnnual(true)}>Annual <small>2 months free</small></button>
        </div>
      </div>
      <div className="plans two-plans">
        <article className="plan">
          <p>FREE</p><h3>{regionalPrice(launchPricing.plans.free, region)}</h3>
          <span>For checking one idea at a time without a purchase.</span>
          <Link href="/research/new?mode=quick_scan" className="button ghost">Start free — no card</Link>
          <ul>{["1 Quick Scan every 30 days", "Unlimited saved reports", "Branded PDF download", "Compare up to 2 reports", "Self-service support", "Free credits do not roll over"].map(item => <li key={item}><Check size={15}/>{item}</li>)}</ul>
        </article>
        <article className="plan featured">
          <span className="popular">MOST POPULAR</span>
          <p>PRO</p><h3>{proPrice}<small>/{annual ? "year" : "month"}</small></h3>
          <span>For founders and builders who validate several ideas each year.</span>
          <Link href="/research/new" className="button">Start with Pro</Link>
          <ul>{["6 report credits every month", "Up to 2 Full Validations monthly", "Unlimited projects and saved reports", "All export formats", "Compare up to 5 reports", "Complete report-version history", "Faster processing and email support", annual ? "Credits granted monthly" : "Rollover up to 12 credits"].map(item => <li key={item}><Check size={15}/>{item}</li>)}</ul>
        </article>
      </div>
    </section>

    <div className="billing-note production-billing-note">
      <ShieldCheck size={20}/><div><b>Predictable international billing</b><p>Prices shown are tax inclusive where applicable. ShouldBuild absorbs supported adaptive-currency conversion fees. Dodo Payments acts as Merchant of Record.</p></div>
    </div>
    <div className="billing-note production-billing-note">
      <RotateCcw size={20}/><div><b>Seven-day first-purchase guarantee</b><p>Refunds are available within seven calendar days of a first paid purchase when the published usage conditions are met. Duplicate charges and unresolved technical failures are always refunded or credited.</p><Link href="/legal/refunds">Read the refund policy</Link></div>
    </div>

    <section className="pricing-faq">
      <p className="eyebrow">Common questions</p><h2>Clear before checkout</h2>
      <div>{faq.map(([question, answer]) => <article key={question}><CircleHelp size={16}/><div><h3>{question}</h3><p>{answer}</p></div></article>)}</div>
    </section>
  </div></AppShell>;
}
