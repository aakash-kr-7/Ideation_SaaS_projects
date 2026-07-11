import Link from "next/link";
import { Check, CircleHelp, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { productCopy } from "@/lib/copy";

const plans = [
  { name: "Signal", price: "$0", intro: productCopy.pricing.Free, items: ["1 signal scan per month", "Limited public evidence", "Core scoring model", "No exports"] },
  { name: "Analyst", price: "$29", intro: productCopy.pricing.Builder, items: ["10 signal scans per month", "3 structured memos", "Markdown export", "Evidence and scoring controls"] },
  { name: "Principal", price: "$69", intro: productCopy.pricing.Pro, items: ["15 structured memos", "Side-by-side comparison", "PDF + JSON exports", "Custom weights and GTM scripts"], featured: true },
  { name: "Director", price: "$149", intro: productCopy.pricing.Studio, items: ["50 memos per month", "White-label exports", "Client-ready formatting", "Team workspace"] },
];

const faq = [
  ["Can a memo guarantee market demand?", "No. Memos reduce decision uncertainty by surfacing evidence, assumptions, and risks. They cannot guarantee a buyer will pay."],
  ["Can I adjust the scoring model?", "Yes. The Principal tier includes adjustable criterion weights so the decision model reflects your specific speed, risk, and revenue constraints."],
  ["What is a Deep Analysis Pass?", "A one-time $39 analysis for a focused decision without a recurring commitment. Includes the full structured research workflow."],
];

export default function PricingPage() {
  return <AppShell title="Pricing"><div className="page-content pricing-page"><div className="pricing-heading"><p className="eyebrow">Investment</p><h2>Pay for clearer decisions, not louder promises.</h2><p>{productCopy.positioning}</p></div><div className="plans four-plans">{plans.map((plan) => <article className={plan.featured ? "plan featured" : "plan"} key={plan.name}>{plan.featured && <span className="popular">RECOMMENDED</span>}<p>{plan.name.toUpperCase()}</p><h3>{plan.price}<small>/ month</small></h3><span>{plan.intro}</span><Link href="/auth" className={plan.featured ? "button" : "button ghost"}>{plan.name === "Signal" ? "Start with a signal scan" : `Choose ${plan.name}`}</Link><ul>{plan.items.map((item) => <li key={item}><Check size={15}/>{item}</li>)}</ul></article>)}</div><div className="report-pass"><div><p className="eyebrow">One-time option</p><h3>Deep Analysis Pass <span>$39 / analysis</span></h3><p>{productCopy.pricing.Pass}</p></div><Link href="/research/new" className="button ghost">Commission one analysis</Link></div><div className="billing-note"><ShieldCheck size={18}/><div><b>Research memos reduce uncertainty. They do not guarantee commercial success.</b><p>Inspect the sources, challenge the assumptions, and adjust the weights. The objective is a clearer next test — never manufactured certainty.</p></div></div><section className="pricing-faq"><p className="eyebrow">Before you decide</p><h2>Questions worth addressing</h2><div>{faq.map(([question, answer]) => <article key={question}><CircleHelp size={16}/><div><h3>{question}</h3><p>{answer}</p></div></article>)}</div></section></div></AppShell>;
}
