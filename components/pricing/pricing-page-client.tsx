"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { GlassPanel } from "@/components/ui/glass-panel";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { getReportModeConfig } from "@/lib/report-modes";
import { FACTOR_EVIDENCE_POLICY } from "@/supabase/functions/_shared/research/scoring-engine";

const quickScan = getReportModeConfig("quick_scan");
const fullValidation = getReportModeConfig("full_validation");

const reportProducts = [
  {
    config: quickScan,
    access: "One monthly entitlement where eligible",
    status: "Available",
    recommended: false,
    description: quickScan.customerDescription,
    items: [
      "One Readiness Score and verdict",
      "Strongest supporting and challenging evidence",
      "Cited source links and explicit evidence limitations",
      `${quickScan.exports.map((item) => item === "markdown" ? "Markdown" : item.toUpperCase()).join(", ")} exports`,
    ],
  },
  {
    config: fullValidation,
    access: "Paid-credit access",
    status: "Checkout pending",
    recommended: true,
    description: fullValidation.customerDescription,
    items: [
      "Twelve expandable factor evidence trails",
      "Prosecution vs. Defence adjudication",
      "Score-movement conditions and validation plan",
      `${fullValidation.exports.map((item) => item === "markdown" ? "Markdown" : item.toUpperCase()).join(", ")} exports`,
    ],
  },
] as const;

const evidenceStates = [
  {
    name: "EVIDENCED",
    border: "border-solid",
    rule: `Requires independent, relevant support. Its coefficient is at least ${FACTOR_EVIDENCE_POLICY.evidenced.minimumCoefficient.toFixed(2)}, so evidence can carry the factor away from the neutral baseline.`,
  },
  {
    name: "SUGGESTIVE",
    border: "border-dashed",
    rule: `Has relevant support but has not cleared the evidenced threshold. Its coefficient stays between ${FACTOR_EVIDENCE_POLICY.suggestive.minimumCoefficient.toFixed(2)} and ${FACTOR_EVIDENCE_POLICY.suggestive.maximumCoefficient.toFixed(2)}.`,
  },
  {
    name: "ASSUMED",
    border: "border-dotted",
    rule: `Missing or weak support caps the coefficient at ${FACTOR_EVIDENCE_POLICY.assumed.maximumCoefficient.toFixed(2)} and pulls the effective factor score toward ${FACTOR_EVIDENCE_POLICY.neutralBaseline}.`,
  },
] as const;

const faq = [
  ["Is the monthly Quick Scan a blurred preview?", "No. It runs the Quick Scan research mode and returns its real score, verdict, evidence on both sides, and stored exports. Its evidence requirements are intentionally narrower than Full Validation."],
  ["How do report credits work?", `Quick Scan uses ${quickScan.creditCost} credit. Full Validation uses ${fullValidation.creditCost}. A reserved credit is restored when a run ends in a verified technical failure.`],
  ["Can I buy credits or subscribe?", "Not yet. Paid checkout, subscriptions, packs, and final commercial prices are not active."],
  ["Does a negative verdict restore a credit?", "No. Avoid and other negative verdicts are completed research outcomes. Credit restoration applies to verified technical failures, not conclusions."],
] as const;

const primaryLinkClass = "inline-flex min-h-10 items-center justify-center gap-sb-2 rounded-sb-md border border-sb-accent bg-sb-accent px-sb-4 py-sb-2 text-sm font-medium text-sb-text-primary transition-colors duration-sb-fast ease-sb-standard hover:border-sb-accent-hover hover:bg-sb-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus";
const secondaryLinkClass = "inline-flex min-h-10 items-center justify-center gap-sb-2 rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 px-sb-4 py-sb-2 text-sm font-medium text-sb-text-primary transition-colors duration-sb-fast ease-sb-standard hover:bg-sb-bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus";

export function PricingPageClient() {
  return (
    <AppShell title="Pricing and access">
      <main className="mx-auto grid w-full max-w-6xl gap-sb-16 px-sb-5 py-sb-10 sm:px-sb-8 sm:py-sb-12">
        <header className="grid gap-sb-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-end">
          <div className="max-w-3xl">
            <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Access before pricing</p>
            <h1 className="mb-0 mt-sb-2 font-sb-display text-4xl font-[480] tracking-[-0.03em] sm:text-5xl">Pay for a harder standard of evidence, not a longer feature list.</h1>
            <p className="mb-0 mt-sb-4 max-w-2xl text-base leading-relaxed text-sb-text-secondary">Start with the monthly Quick Scan where eligible. Full Validation uses a higher evidence burden for decisions that justify deeper research.</p>
            <Link className={`${primaryLinkClass} mt-sb-6`} href="/research/new?mode=quick_scan">Run a Quick Scan<ArrowRight size={14}/></Link>
          </div>

          <Card className="grid gap-sb-4 p-sb-5">
            <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Current access</p>
            <dl className="m-0 grid gap-sb-3 text-sm">
              <div className="flex items-center justify-between gap-sb-4 border-t border-sb-border-hairline pt-sb-3"><dt className="text-sb-text-secondary">Quick Scan</dt><dd className="m-0 font-medium text-sb-text-primary">Monthly entitlement</dd></div>
              <div className="flex items-center justify-between gap-sb-4 border-t border-sb-border-hairline pt-sb-3"><dt className="text-sb-text-secondary">Full Validation</dt><dd className="m-0 font-medium text-sb-text-primary">Checkout pending</dd></div>
              <div className="flex items-center justify-between gap-sb-4 border-t border-sb-border-hairline pt-sb-3"><dt className="text-sb-text-secondary">Payment controls</dt><dd className="m-0 font-medium text-sb-text-primary">Inactive</dd></div>
            </dl>
          </Card>
        </header>

        <ScrollReveal sessionKey="pricing-report-depth-v1">
        <section className="grid gap-sb-5" aria-labelledby="report-depth-title">
          <header className="max-w-3xl">
            <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Two burdens of proof</p>
            <h2 data-scroll-reveal-text id="report-depth-title" className="mb-0 mt-sb-1 font-sb-display text-3xl font-[480] tracking-[-0.02em]">Choose the depth by the cost of being wrong</h2>
          </header>
          <div className="grid gap-sb-4 lg:grid-cols-12">
            {reportProducts.map((product) => {
              const rules = product.config.evidenceSufficiency;
              return (
                <SpotlightCard
                  data-scroll-reveal-item
                  className={product.recommended ? "lg:col-span-7" : "lg:col-span-5"}
                  style={{ backgroundColor: "transparent", borderColor: "transparent" }}
                  key={product.config.mode}
                >
                  <GlassPanel className="relative isolate grid h-full content-start gap-sb-5 p-sb-6">
                    {product.recommended && <BorderBeam persistent thickness={2}/>}
                    <header className="grid gap-sb-2">
                      <div className="flex flex-wrap items-center justify-between gap-sb-3">
                        <h3 className="m-0 font-sb-display text-2xl font-[480]">{product.config.label}</h3>
                        <div className="flex flex-wrap items-center justify-end gap-sb-2">
                          {product.recommended && <span className="rounded-sb-pill border border-sb-accent px-sb-3 py-sb-1 font-sb-mono text-xs uppercase tracking-[0.02em] text-sb-text-secondary">Recommended</span>}
                          <span className="rounded-sb-pill border border-sb-border-hairline-strong px-sb-3 py-sb-1 font-sb-mono text-xs uppercase tracking-[0.02em] text-sb-text-secondary">{product.status}</span>
                        </div>
                      </div>
                      <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{product.description}</p>
                      <p className="m-0 font-sb-mono text-xs tabular-nums text-sb-text-tertiary">{product.config.creditCost} report credit{product.config.creditCost === 1 ? "" : "s"} · {product.access}</p>
                    </header>

                    <div className="rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 p-sb-4">
                      <span className="text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Research publication gate</span>
                      <dl className="mt-sb-3 grid grid-cols-[1fr_auto] gap-x-sb-4 gap-y-sb-2 text-xs">
                        <dt className="text-sb-text-secondary">Minimum usable findings</dt><dd className="m-0 font-sb-mono tabular-nums">{rules.minimumUsableEvidence}</dd>
                        <dt className="text-sb-text-secondary">Problem sources</dt><dd className="m-0 font-sb-mono tabular-nums">{rules.minimumProblemSources}</dd>
                        <dt className="text-sb-text-secondary">Solution sources</dt><dd className="m-0 font-sb-mono tabular-nums">{rules.minimumSolutionSources}</dd>
                        <dt className="text-sb-text-secondary">Disconfirming findings</dt><dd className="m-0 font-sb-mono tabular-nums">{rules.minimumDisconfirmingEvidence}</dd>
                        <dt className="text-sb-text-secondary">Required source quality</dt><dd className="m-0 text-right">{rules.requireTierOneEvidence ? "Tier 1 required" : rules.requireTierOneOrTwoEvidence ? "Tier 1 or 2 required" : "No tier gate"}</dd>
                      </dl>
                    </div>

                    <ul className="m-0 grid list-none gap-sb-2 p-0 text-sm text-sb-text-secondary">
                      {product.items.map((item) => <li className="border-t border-sb-border-hairline pt-sb-2" key={item}>{item}</li>)}
                    </ul>

                    {product.config.mode === "quick_scan" ? (
                      <Link className={secondaryLinkClass} href="/research/new?mode=quick_scan">Use monthly access<ArrowRight size={14}/></Link>
                    ) : (
                      <Button variant="secondary" disabled>Available when checkout launches</Button>
                    )}
                  </GlassPanel>
                </SpotlightCard>
              );
            })}
          </div>
        </section>
        </ScrollReveal>

        <ScrollReveal sessionKey="pricing-evidence-gates-v1">
        <section className="grid gap-sb-5" aria-labelledby="evidence-gates-title">
          <header className="max-w-3xl">
            <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">What the score is allowed to claim</p>
            <h2 data-scroll-reveal-text id="evidence-gates-title" className="mb-0 mt-sb-1 font-sb-display text-3xl font-[480] tracking-[-0.02em]">Evidence state changes the effective factor score</h2>
            <p data-scroll-reveal-text className="mb-0 mt-sb-2 text-sm leading-relaxed text-sb-text-secondary">Report depth controls the research burden. The same deterministic evidence policy still labels every factor and pulls unsupported conclusions toward neutral.</p>
          </header>
          <div className="grid gap-sb-3 lg:grid-cols-3">
            {evidenceStates.map((state) => (
              <Card data-scroll-reveal-item className={`grid gap-sb-3 ${state.border} p-sb-5`} key={state.name}>
                <code className="font-sb-mono text-xs font-semibold tracking-[0.02em] text-sb-text-primary">{state.name}</code>
                <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{state.rule}</p>
              </Card>
            ))}
          </div>
        </section>
        </ScrollReveal>

        <ScrollReveal sessionKey="pricing-commercial-status-v1">
        <section className="grid gap-sb-4" aria-labelledby="commercial-status-title">
          <header>
            <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Commercial status</p>
            <h2 data-scroll-reveal-text id="commercial-status-title" className="mb-0 mt-sb-1 font-sb-display text-2xl font-[480]">No paid checkout is active</h2>
          </header>
          {/* TODO(product): replace with verified paid prices and terms before checkout is enabled. */}
          <Card data-scroll-reveal-item className="border-dashed p-sb-5 text-sm leading-relaxed text-sb-text-secondary">
            Paid pricing, subscriptions, report packs, taxes, renewal terms, and regional availability — pending. Nothing on this page can initiate a charge today.
          </Card>
        </section>
        </ScrollReveal>

        <ScrollReveal sessionKey="pricing-access-questions-v1">
        <section className="grid gap-sb-4" aria-labelledby="pricing-faq-title">
          <header>
            <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Operating reality</p>
            <h2 data-scroll-reveal-text id="pricing-faq-title" className="mb-0 mt-sb-1 font-sb-display text-2xl font-[480]">Access questions</h2>
          </header>
          <div className="divide-y divide-sb-border-hairline border-y border-sb-border-hairline">
            {faq.map(([question, answer]) => (
              <Disclosure
                data-scroll-reveal-item
                className="py-sb-4"
                buttonClassName="text-sm font-medium"
                panelClassName="pt-sb-3"
                key={question}
                summary={question}
              >
                <p className="m-0 max-w-3xl text-sm leading-relaxed text-sb-text-secondary">{answer}</p>
              </Disclosure>
            ))}
          </div>
        </section>
        </ScrollReveal>
      </main>
    </AppShell>
  );
}
