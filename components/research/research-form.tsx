"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Loader2,
  SearchCheck,
  ShieldAlert,
  Telescope,
  WalletCards,
  X,
} from "lucide-react";
import type { MarketType, ResearchMode } from "@/lib/types";
import { createProject, startResearchRun } from "@/lib/actions/research";
import type { CreditSnapshot } from "@/lib/services/research";
import { canLaunchReport, getReportModeConfig } from "@/lib/report-modes";
import { motion, getStaggerDelay, revealUpClass } from "@/lib/motion";

const markets: MarketType[] = [
  "B2B", "D2C", "Creator", "Developer Tool", "Local Business",
  "Agency Tool", "Student/Career", "Other",
];

const modePresentation = {
  quick_scan: {
    icon: SearchCheck,
    bestFor: "Best for filtering ideas before spending more.",
    included: ["12-factor score and verdict", "Concise evidence screen", "Risks, pricing direction, and next actions", "Clickable citations and branded PDF"],
    excluded: ["No full specialist checker suite", "No detailed MVP or go-to-market report"],
  },
  full_validation: {
    icon: Telescope,
    bestFor: "Best before committing meaningful time or money.",
    included: ["All three research passes", "Six specialists and independent checkers", "MVP, pricing, GTM, and adversarial analysis", "PDF, Markdown, CSV, and JSON exports"],
    excluded: ["No guaranteed outcome", "Market sizing only when verifiably cited"],
  },
} as const;

export interface ResearchFormInitialValues {
  ideaName?: string;
  ideaDescription?: string;
  targetCustomer?: string;
  targetRegion?: string;
  marketType?: MarketType;
  assumptions?: {
    revenueTarget?: string;
    monetization?: string;
    complexityTolerance?: string;
    platformTolerance?: string;
    regulatoryTolerance?: string;
  };
}
export function ResearchForm({
  projectId,
  defaultMode = "full_validation",
  creditSnapshot,
  initialValues = {},
}: {
  projectId?: string;
  defaultMode?: ResearchMode;
  creditSnapshot: CreditSnapshot | null;
  initialValues?: ResearchFormInitialValues;
}) {
  const router = useRouter();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [mode, setMode] = useState<ResearchMode>(defaultMode);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const selected = getReportModeConfig(mode);
  const available = canLaunchReport(mode, creditSnapshot?.paid_credits ?? 0, creditSnapshot?.free_quick_scans_remaining ?? 0);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!available) return;
    setSubmitting(true);
    setError("");
    try {
      const form = new FormData(event.currentTarget);
      const project = projectId ? { id: projectId } : await createProject({ name: "Default Project" });
      const result = await startResearchRun({
        project_id: project.id,
        idea_name: String(form.get("ideaName") ?? ""),
        idea_description: String(form.get("ideaDescription") ?? ""),
        target_customer: String(form.get("targetCustomer") ?? ""),
        market_type: String(form.get("marketType") ?? "B2B") as MarketType,
        target_region: String(form.get("targetRegion") ?? "Global"),
        assumptions: {
          revenueTarget: String(form.get("revenueTarget") ?? ""),
          monetization: String(form.get("monetization") ?? ""),
          complexityTolerance: String(form.get("complexityTolerance") ?? ""),
          platformTolerance: String(form.get("platformTolerance") ?? ""),
          regulatoryTolerance: String(form.get("regulatoryTolerance") ?? ""),
        },
        mode,
        idempotency_key: idempotencyKey.current,
      });
      router.push(`/research/${result.id}/progress`);
    } catch (caught) {
      let message = caught instanceof Error ? caught.message : "The report could not start.";
      try {
        const parsed = JSON.parse(message);
        message = parsed.message ?? message;
      } catch {}
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return <form onSubmit={submit} className="research-form">
    <section className={`form-section ${revealUpClass}`} style={getStaggerDelay(0)}>
      <div>
        <p className="eyebrow">Your idea</p>
        <h2>What do you want to validate?</h2>
        <p>Describe the product, buyer, and problem precisely. These details are preserved if you later move from Quick Scan to Full Validation.</p>
      </div>
      <div className="field-grid">
        <label className="field full"><span>Idea name</span><input name="ideaName" defaultValue={initialValues.ideaName} placeholder="e.g. Appointment recovery assistant for salons" required /></label>
        <label className="field full"><span>What does it do?</span><textarea name="ideaDescription" defaultValue={initialValues.ideaDescription} placeholder="Describe the workflow, problem, and intended outcome." required /></label>
        <label className="field"><span>Who would pay for this?</span><input name="targetCustomer" defaultValue={initialValues.targetCustomer} placeholder="e.g. Independent salons with repeat bookings" required /></label>
        <label className="field"><span>Target region</span><input name="targetRegion" defaultValue={initialValues.targetRegion ?? "Global"} required /></label>
        <label className="field full"><span>Market type</span><select name="marketType" defaultValue={initialValues.marketType ?? "B2B"}>{markets.map((market) => <option key={market}>{market}</option>)}</select></label>
      </div>
    </section>

    <section className={`form-section ${revealUpClass}`} style={getStaggerDelay(1)}>
      <div>
        <p className="eyebrow">Decision assumptions</p>
        <h2>What constraints should the report preserve?</h2>
        <p>These remain attached to the run and carry into a deeper validation.</p>
      </div>
      <div className="field-grid">
        <label className="field"><span>Revenue target</span><select name="revenueTarget" defaultValue={initialValues.assumptions?.revenueTarget ?? "$5k MRR"}><option>$1k MRR</option><option>$5k MRR</option><option>$10k MRR</option><option>Venture-scale</option></select></label>
        <label className="field"><span>Monetization preference</span><select name="monetization" defaultValue={initialValues.assumptions?.monetization ?? "Subscription"}><option>Subscription</option><option>Usage-based</option><option>One-time purchase</option><option>Service + software</option></select></label>
        <label className="field"><span>Build complexity tolerance</span><select name="complexityTolerance" defaultValue={initialValues.assumptions?.complexityTolerance ?? "Low"}><option>Low</option><option>Medium</option><option>High</option></select></label>
        <label className="field"><span>Platform dependency tolerance</span><select name="platformTolerance" defaultValue={initialValues.assumptions?.platformTolerance ?? "Low"}><option>Low</option><option>Medium</option><option>High</option></select></label>
        <label className="field full"><span>Regulatory risk tolerance</span><select name="regulatoryTolerance" defaultValue={initialValues.assumptions?.regulatoryTolerance ?? "Low"}><option>Low</option><option>Medium</option><option>High</option></select></label>
      </div>
    </section>

    <section className={`form-section mode-section ${revealUpClass}`} style={getStaggerDelay(2)}>
      <div className="mode-heading-row">
        <div><p className="eyebrow">Report type</p><h2>Choose the depth of this decision.</h2></div>
        <div className="credit-balance"><WalletCards size={16} /><span><b>{creditSnapshot ? creditSnapshot.paid_credits : "Unavailable"}</b> paid credits</span><small>{creditSnapshot ? (creditSnapshot.free_quick_scans_remaining ? "Monthly Quick Scan available" : "Monthly Quick Scan used") : "Entitlement status unavailable"}</small></div>
      </div>
      <div className="mode-grid production-mode-grid">
        {(["quick_scan", "full_validation"] as const).map((reportMode) => {
          const config = getReportModeConfig(reportMode);
          const presentation = modePresentation[reportMode];
          const Icon = presentation.icon;
          const active = mode === reportMode;
          return <button
            type="button"
            aria-pressed={active}
            onClick={() => setMode(reportMode)}
            className={`${active ? "mode-card selected" : "mode-card"} ${motion.transitionBase} ${motion.press}`}
            key={reportMode}
          >
            <span className="mode-card-top"><Icon size={19} /><i>{config.creditCost} {config.creditCost === 1 ? "credit" : "credits"}</i>{active && <Check size={15} />}</span>
            <b>{config.label}</b>
            <small>{config.customerDescription}</small>
            <em>{presentation.bestFor}</em>
            <ul>{presentation.included.map((item) => <li key={item}><Check size={13} />{item}</li>)}</ul>
            <div className="mode-exclusions">{presentation.excluded.map((item) => <span key={item}><X size={12} />{item}</span>)}</div>
          </button>;
        })}
      </div>
    </section>

    <footer className="form-footer production-form-footer">
      <div>
        {error ? <p className="form-error" role="alert"><ShieldAlert size={15} />{error}</p> : <p><b>{selected.label} selected.</b> {selected.creditCost} {selected.creditCost === 1 ? "credit" : "credits"} will be reserved securely when the run starts.</p>}
      </div>
      {available ? <button className={`button ${motion.buttonBase} ${submitting ? "is-loading" : ""}`} type="submit" disabled={submitting}>
        {submitting ? <><Loader2 className="animate-spin" size={17} /> Reserving credit…</> : <>Run {selected.label} <ArrowRight size={17} /></>}
      </button> : <button className={`button ${motion.buttonBase}`} type="button" disabled title="Paid checkout is not available yet">
        {creditSnapshot ? `${selected.label} unavailable` : "Entitlement unavailable"}
      </button>}
    </footer>
  </form>;
}
