"use client";

import Link from "next/link";
import { Check, CircleHelp, Clock3, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";

const reportProducts = [
  {
    name: "Quick Scan",
    description: "The fast decision checkpoint. Is there real demand? Real competition? Obvious risk?",
    credits: "Uses 1 report credit",
    free: true,
    items: ["12-factor score and verdict", "Evidence confidence with clickable citations", "Competitor, pricing, risk, and next-step snapshots", "PDF, Markdown, CSV, and JSON exports"],
  },
  {
    name: "Full Validation",
    description: "The comprehensive decision dossier. Essential before you write a line of code, raise money, or hire.",
    credits: "Uses 3 report credits",
    free: false,
    items: ["Deeper adversarial research across more evidence dimensions", "Competitor mapping, demand analysis, pricing strategy, and GTM plan", "Detailed 12-factor score with MVP scope and build estimate", "PDF, Markdown, CSV, and JSON exports"],
  },
] as const;

const faq = [
  ["Is the free Quick Scan genuinely useful?", "Yes. The monthly Quick Scan runs the complete evidence pipeline — it's not a blurred preview or a limited version. You get the full score, verdict, citations, and next actions."],
  ["How do report credits work?", "Quick Scan uses 1 credit. Full Validation uses 3. If a run fails due to a technical error, the reserved credit is automatically restored."],
  ["Can I buy credits or subscribe?", "Not yet. Paid credit purchases, subscriptions, and checkout are being built. You'll be able to access Full Validation and additional Quick Scans once payment is live."],
  ["What happens if a report fails?", "Technical failures restore your credit automatically. A negative verdict — 'Avoid' or 'Weak Signal' — is a completed report. It's information, not a failure."],
] as const;

export function PricingPageClient() {
  return <AppShell title="Pricing"><div className="page-content pricing-page production-pricing">
    <header className="pricing-heading pricing-hero">
      <p className="eyebrow">Validation access</p>
      <h2>Start free. Go deeper when the evidence justifies it.</h2>
      <p>One Quick Scan is included every calendar month. Paid credits for Full Validation and additional scans are in progress.</p>
      <div className="pricing-region-note" role="status"><ShieldAlert size={15}/><b>No charges active</b><span>No payment button on this page will collect money.</span></div>
    </header>

    <section className="pricing-section" aria-labelledby="reports-heading">
      <div className="pricing-section-head"><div><p className="eyebrow">What each report includes</p><h2 id="reports-heading">Choose the depth your idea deserves</h2></div><small>Credit availability is confirmed before a run starts</small></div>
      <div className="plans two-plans one-off-plans">
        {reportProducts.map((product) => <article className={product.free ? "plan" : "plan featured"} key={product.name}>
          {!product.free && <span className="popular">DEEPER RESEARCH</span>}
          <p>{product.name.toUpperCase()}</p>
          <h3>{product.free ? "Free every month" : "Paid access — coming soon"}</h3>
          <span>{product.description}</span>
          <small className="credit-label">{product.credits}</small>
          {product.free
            ? <Link className="button ghost" href="/research/new?mode=quick_scan">Validate My Idea Free</Link>
            : <button className="button" type="button" disabled aria-disabled="true"><Clock3 size={15}/> Available when checkout launches</button>}
          <ul>{product.items.map((item) => <li key={item}><Check size={15}/>{item}</li>)}</ul>
        </article>)}
      </div>
    </section>

    <section className="pricing-section" aria-labelledby="future-access-heading">
      <div className="pricing-section-head"><div><p className="eyebrow">Coming soon</p><h2 id="future-access-heading">Paid credits and report packs</h2></div></div>
      <div className="billing-note production-billing-note">
        <Clock3 size={20}/><div><b>Checkout is being built</b><p>Full Validation credits, one-off report packs, Pro subscriptions, and regional pricing are in progress. Commercial terms will be published when payment launches.</p></div>
      </div>
    </section>

    <section className="pricing-faq">
      <p className="eyebrow">Common questions</p><h2>Good to know before you start</h2>
      <div>{faq.map(([question, answer]) => <article key={question}><CircleHelp size={16}/><div><h3>{question}</h3><p>{answer}</p></div></article>)}</div>
    </section>
  </div></AppShell>;
}

