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
    bestFor: "The fast decision checkpoint.",
    included: ["12-factor score and verdict", "Core evidence screen with clickable citations", "Risks, pricing direction, and next actions", "PDF, Markdown, CSV, and JSON exports"],
    excluded: ["No deep competitor or GTM analysis", "No MVP scope or go-to-market report"],
  },
  full_validation: {
    icon: Telescope,
    bestFor: "The comprehensive dossier. Essential before writing code, raising money, or hiring.",
    included: ["Deep adversarial research across more evidence dimensions", "Competitor analysis, pricing strategy, risk, and GTM plan", "MVP scope, build estimate, and 12-factor score", "PDF, Markdown, CSV, and JSON exports"],
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
    industry?: string;
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
        target_customer: String(form.get("targetCustomer") || "Not specified"),
        market_type: String(form.get("marketType") ?? "B2B") as MarketType,
        target_region: String(form.get("targetRegion") ?? "Global"),
        assumptions: {
          industry: String(form.get("industry") ?? ""),
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
        <p className="eyebrow">Your idea brief</p>
        <h2>What do you want to validate?</h2>
        <p>Describe the product, buyer, and problem as specifically as you can. The more precise the brief, the stronger the evidence search.</p>
      </div>
      <div className="field-grid">
        <label className="field full"><span>Idea name</span><input name="ideaName" defaultValue={initialValues.ideaName} placeholder="e.g. Appointment recovery assistant for salons" required /></label>
        <label className="field full"><span>What does it do?</span><textarea name="ideaDescription" defaultValue={initialValues.ideaDescription} placeholder="Describe the workflow, problem, and intended outcome." required /></label>
        <label className="field"><span>Target customer <small>Optional</small></span><input name="targetCustomer" defaultValue={initialValues.targetCustomer === "Not specified" ? "" : initialValues.targetCustomer} placeholder="e.g. Independent salons with repeat bookings" /></label>
        <label className="field"><span>Geography <small>Optional</small></span><input name="targetRegion" defaultValue={initialValues.targetRegion ?? "Global"} /></label>
        <label className="field full"><span>Industry <small>Optional</small></span><input name="industry" defaultValue={initialValues.assumptions?.industry} placeholder="e.g. Beauty and personal care" /></label>
        <label className="field full"><span>Market type</span><select name="marketType" defaultValue={initialValues.marketType ?? "B2B"}>{markets.map((market) => <option key={market}>{market}</option>)}</select></label>
      </div>
    </section>

    <section className={`form-section ${revealUpClass}`} style={getStaggerDelay(1)}>
      <div>
        <p className="eyebrow">Your constraints</p>
        <h2>What constraints should the report respect?</h2>
        <p>These carry forward if you later run a deeper validation on the same idea.</p>
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
        <div><p className="eyebrow">Report type</p><h2>Choose your validation depth.</h2></div>
        <div className="credit-balance"><WalletCards size={16} /><span><b>{creditSnapshot ? creditSnapshot.paid_credits : "Unavailable"}</b> paid credits</span><small>{creditSnapshot ? (creditSnapshot.free_quick_scans_remaining ? "Free Quick Scan available this month" : "Monthly Quick Scan used") : "Credit status unavailable"}</small></div>
      </div>
      <div className="grounding-readiness" role="status"><ShieldAlert size={15} /><span><b>Source availability is checked when your validation starts.</b> If any research provider is unavailable, the system automatically falls back to alternative sources.</span></div>
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
        {error ? <p className="form-error" role="alert"><ShieldAlert size={15}/>{error}</p> : <p><b>{selected.label} selected.</b> {selected.creditCost} {selected.creditCost === 1 ? "credit" : "credits"} will be reserved when the run starts.</p>}
      </div>
      {available ? <button className={`button ${motion.buttonBase} ${submitting ? "is-loading" : ""}`} type="submit" disabled={submitting}>
        {submitting ? <><Loader2 className="animate-spin" size={17}/> Starting your validation…</> : <>Start {selected.label} <ArrowRight size={17}/></>}
      </button> : <button className={`button ${motion.buttonBase}`} type="button" disabled title="Paid checkout is not available yet">
        {creditSnapshot ? `${selected.label} unavailable` : "Credit status unavailable"}
      </button>}
    </footer>
  </form>;
}
