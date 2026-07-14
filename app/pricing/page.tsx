import Link from "next/link";
import { Check, CircleHelp, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { productCopy } from "@/lib/copy";

const plans = [
  { name: "Signal", price: "$0", intro: productCopy.pricing.Free, items: ["1 quick scan per month", "Core scoring model", "Basic signal detection", "No exports"] },
  { name: "Analyst", price: "$29", intro: productCopy.pricing.Builder, items: ["10 quick scans per month", "3 full validation reports", "Markdown export", "Evidence & scoring details"] },
  { name: "Principal", price: "$69", intro: productCopy.pricing.Pro, items: ["15 full validation reports", "Side-by-side comparison", "PDF + JSON exports", "Custom scoring weights"], featured: true },
  { name: "Director", price: "$149", intro: productCopy.pricing.Studio, items: ["50 reports per month", "Polished client-ready exports", "White-label formatting", "Team workspace"] },
];

const faq = [
  ["Can this guarantee my idea will succeed?", "No. A report reduces uncertainty by surfacing evidence, risks, and assumptions. It tells you what to test next — not whether to bet the house."],
  ["Can I adjust the scoring model?", "Yes. The Principal tier lets you adjust criterion weights so the score reflects your specific constraints — speed, risk, revenue goals."],
  ["What is a Deep Analysis Pass?", "A one-time $39 full validation without a monthly commitment. Includes the complete research workflow and report."],
];

export default function PricingPage() {
  return <AppShell title="Pricing"><div className="page-content pricing-page">
    <div className="pricing-heading">
      <p className="eyebrow">Pricing</p>
      <h2>Know what to build. Starting at $0.</h2>
      <p>{productCopy.positioning}</p>
    </div>
    <div className="plans four-plans">
      {plans.map((plan) => <article className={plan.featured ? "plan featured" : "plan"} key={plan.name}>
        {plan.featured && <span className="popular">RECOMMENDED</span>}
        <p>{plan.name.toUpperCase()}</p>
        <h3>{plan.price}<small>/ month</small></h3>
        <span>{plan.intro}</span>
        <Link href="/sign-in" className={plan.featured ? "button" : "button ghost"}>{plan.name === "Signal" ? "Start free — no card needed" : `Choose ${plan.name}`}</Link>
        <ul>{plan.items.map((item) => <li key={item}><Check size={15}/>{item}</li>)}</ul>
      </article>)}
    </div>
    <div className="report-pass">
      <div>
        <p className="eyebrow">One-time option</p>
        <h3>Deep Analysis Pass <span>$39 / report</span></h3>
        <p>{productCopy.pricing.Pass}</p>
      </div>
      <Link href="/research/new" className="button ghost">Get one report</Link>
    </div>
    <div className="billing-note">
      <ShieldCheck size={18}/>
      <div>
        <b>Reports reduce uncertainty. They don&apos;t guarantee success.</b>
        <p>Inspect the sources, challenge the assumptions, and adjust the weights. The goal is a clearer next step — never manufactured certainty.</p>
      </div>
    </div>
    <section className="pricing-faq">
      <p className="eyebrow">Common questions</p>
      <h2>Before you decide</h2>
      <div>{faq.map(([question, answer]) => <article key={question}><CircleHelp size={16}/><div><h3>{question}</h3><p>{answer}</p></div></article>)}</div>
    </section>
  </div></AppShell>;
}
