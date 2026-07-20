"use client";

import Link from "next/link";
import { Check, CircleHelp, Clock3, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

const reportProducts = [
  {
    name: "Quick Scan",
    description: "Find out whether an idea deserves a serious investigation.",
    credits: "Uses 1 report credit",
    free: true,
    items: ["12-factor score and official verdict", "Evidence confidence and clickable citations", "Competitor, pricing, risk, and next-step snapshots", "PDF export and report history"],
  },
  {
    name: "Full Validation",
    description: "Stress-test the idea before committing meaningful time or money.",
    credits: "Uses 3 report credits",
    free: false,
    items: ["Deeper grounded and adversarial research", "Competition, demand, market, pricing, risk, and GTM analysis", "Detailed 12-factor score and MVP scope", "PDF, Markdown, CSV, and JSON exports"],
  },
] as const;

const faq = [
  ["Is the free report genuinely useful?", "Yes. The monthly entitlement runs the complete Quick Scan pipeline; it is not a blurred preview."],
  ["How do report credits work?", "Quick Scan reserves 1 credit and Full Validation reserves 3. Failed technical runs restore the reserved credit."],
  ["Can I buy credits or subscribe?", "Not yet. Checkout, paid credit grants, subscriptions, renewals, and cancellations are unavailable until the payment integration is completed."],
  ["What happens if a report fails?", "The entitlement system restores the affected reserved credit when the run reaches a verified technical failure. A negative verdict is still a completed report."],
] as const;

export function PricingPageClient() {
  return <AppShell title="Access"><div className="page-content pricing-page production-pricing">
    <header className="pricing-heading pricing-hero">
      <p className="eyebrow">Report access</p>
      <h2>Start with the monthly Quick Scan entitlement.</h2>
      <p>Paid checkout is not available yet. Prices, subscriptions, rollover rules, tax treatment, and paid report packs have not been launched.</p>
      <div className="pricing-region-note" role="status"><ShieldAlert size={15}/><b>Purchases unavailable</b><span>No payment button on this page will collect money.</span></div>
    </header>

    <section className="pricing-section" aria-labelledby="reports-heading">
      <div className="pricing-section-head"><div><p className="eyebrow">Implemented report modes</p><h2 id="reports-heading">What each report includes</h2></div><small>Entitlements are checked before a run is created</small></div>
      <div className="plans two-plans one-off-plans">
        {reportProducts.map((product) => <article className={product.free ? "plan" : "plan featured"} key={product.name}>
          {!product.free && <span className="popular">DEEPER RESEARCH</span>}
          <p>{product.name.toUpperCase()}</p>
          <h3>{product.free ? "Monthly entitlement" : "Paid access unavailable"}</h3>
          <span>{product.description}</span>
          <small className="credit-label">{product.credits}</small>
          {product.free
            ? <Link className="button ghost" href="/research/new?mode=quick_scan">Run Quick Scan</Link>
            : <button className="button" type="button" disabled aria-disabled="true"><Clock3 size={15}/> Checkout coming later</button>}
          <ul>{product.items.map((item) => <li key={item}><Check size={15}/>{item}</li>)}</ul>
        </article>)}
      </div>
    </section>

    <section className="pricing-section" aria-labelledby="future-access-heading">
      <div className="pricing-section-head"><div><p className="eyebrow">Not yet available</p><h2 id="future-access-heading">Paid plans and report packs</h2></div></div>
      <div className="billing-note production-billing-note">
        <Clock3 size={20}/><div><b>Commercial terms remain undecided</b><p>Pro subscriptions, one-off purchases, report packs, paid-credit expiry, rollover, refunds, taxes, and regional prices require product and legal decisions before checkout is enabled.</p></div>
      </div>
    </section>

    <section className="pricing-faq">
      <p className="eyebrow">Current behavior</p><h2>Clear before starting</h2>
      <div>{faq.map(([question, answer]) => <article key={question}><CircleHelp size={16}/><div><h3>{question}</h3><p>{answer}</p></div></article>)}</div>
    </section>
  </div></AppShell>;
}
