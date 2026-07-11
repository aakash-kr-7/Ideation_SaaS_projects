import Link from "next/link";
import { Check, CircleHelp, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { productCopy } from "@/lib/copy";

const plans = [
  { name: "Free", price: "$0", intro: productCopy.pricing.Free, items: ["1 fast scan each month", "Limited public evidence", "Explainable core score", "No exports"] },
  { name: "Builder", price: "$19", intro: productCopy.pricing.Builder, items: ["10 scans each month", "3 deep reports", "Markdown export", "Evidence and scoring controls"] },
  { name: "Pro", price: "$49", intro: productCopy.pricing.Pro, items: ["15 deep reports", "Compare ideas side-by-side", "PDF + JSON exports", "Custom weights and GTM scripts"], featured: true },
  { name: "Studio", price: "$149", intro: productCopy.pricing.Studio, items: ["50 reports each month", "White-label exports", "Client-ready reports", "Team workspace"] },
];

const faq = [
  ["Can a report guarantee demand?", "No. Reports reduce uncertainty by showing the evidence, assumptions, and risks behind a decision. They cannot guarantee a buyer will pay."],
  ["Can I change the score?", "Yes. Pro includes adjustable weights so the decision model can match the speed, risk, and revenue constraints that matter to you."],
  ["What is a Deep Report Pass?", "A one-time $29 report for a focused decision without a recurring subscription. It includes the full deep-validation workflow."],
];

export default function PricingPage() {
  return <AppShell title="Pricing"><div className="page-content pricing-page"><div className="pricing-heading"><p className="eyebrow">Pricing that follows the work</p><h2>Pay for clearer product decisions, not louder promises.</h2><p>{productCopy.positioning}</p></div><div className="plans four-plans">{plans.map((plan) => <article className={plan.featured ? "plan featured" : "plan"} key={plan.name}>{plan.featured && <span className="popular">RECOMMENDED</span>}<p>{plan.name.toUpperCase()}</p><h3>{plan.price}<small>/ month</small></h3><span>{plan.intro}</span><Link href="/auth" className={plan.featured ? "button" : "button ghost"}>{plan.name === "Free" ? "Get your first signal" : `Choose ${plan.name}`}</Link><ul>{plan.items.map((item) => <li key={item}><Check size={15}/>{item}</li>)}</ul></article>)}</div><div className="report-pass"><div><p className="eyebrow">One-time option</p><h3>Deep Report Pass <span>$29 / report</span></h3><p>{productCopy.pricing.Pass}</p></div><Link href="/research/new" className="button ghost">Run one deep report</Link></div><div className="billing-note"><ShieldCheck size={18}/><div><b>Reports reduce uncertainty. They do not guarantee market success.</b><p>Inspect the sources, challenge assumptions, and adjust the weights. The point is a clearer customer test—not false certainty.</p></div></div><section className="pricing-faq"><p className="eyebrow">Before you choose</p><h2>Questions worth asking</h2><div>{faq.map(([question, answer]) => <article key={question}><CircleHelp size={16}/><div><h3>{question}</h3><p>{answer}</p></div></article>)}</div></section></div></AppShell>;
}
