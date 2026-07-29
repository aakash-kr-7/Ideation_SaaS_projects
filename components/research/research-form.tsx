"use client";

import { FormEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Check, Fingerprint, Loader2, Radar, SearchCheck, ShieldAlert,
  Sparkles, Telescope, WalletCards, X,
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
    number: "01",
    bestFor: "Find whether this idea earns another hour.",
    included: ["12-factor opportunity score", "Explicit verdict and decisive signals", "Risks, pricing direction, and next actions", "Clickable citations and portable exports"],
    excluded: ["No deep competitor or GTM analysis", "No MVP scope or go-to-market report"],
  },
  full_validation: {
    icon: Telescope,
    number: "02",
    bestFor: "Build the case before the team, money, or code commits.",
    included: ["Deeper adversarial evidence search", "Competitor, pricing, risk, and positioning map", "MVP scope, launch sequence, and 12-factor score", "Clickable citations and portable exports"],
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
    if (!available || submitting) return;
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

  return <form onSubmit={submit} className="research-form decision-intake-form">
    <header className="intake-command-bar">
      <div><Fingerprint size={15}/><span><b>Private decision brief</b><small>Your inputs stay attached to this workspace.</small></span></div>
      <div className="intake-command-status"><i/><span>Research system ready</span></div>
    </header>

    <section className={`form-section decision-section ${revealUpClass}`} style={getStaggerDelay(0)}>
      <div className="decision-section-head">
        <span>01</span>
        <div>
          <p className="eyebrow">Frame the opportunity</p>
          <h2>Give the market something precise to judge.</h2>
          <p>Name the product, the buyer, and the job it should do. Precision here creates a sharper evidence trail later.</p>
        </div>
      </div>
      <div className="field-grid decision-field-grid">
        <label className="field full">
          <span>Working title</span>
          <input name="ideaName" defaultValue={initialValues.ideaName} placeholder="e.g. Appointment recovery assistant for salons" required />
          <small>Clear beats clever. You can rename it later.</small>
        </label>
        <label className="field full decision-textarea">
          <span>The product promise</span>
          <textarea name="ideaDescription" defaultValue={initialValues.ideaDescription} placeholder="What happens, for whom, and what becomes meaningfully easier or better?" required />
          <small>Describe the workflow, current pain, and intended outcome—not a list of features.</small>
        </label>
        <label className="field">
          <span>The buyer <small>Optional</small></span>
          <input name="targetCustomer" defaultValue={initialValues.targetCustomer === "Not specified" ? "" : initialValues.targetCustomer} placeholder="e.g. Independent salons with repeat bookings" />
        </label>
        <label className="field">
          <span>Market geography <small>Optional</small></span>
          <input name="targetRegion" defaultValue={initialValues.targetRegion ?? "Global"} />
        </label>
        <label className="field">
          <span>Industry context <small>Optional</small></span>
          <input name="industry" defaultValue={initialValues.assumptions?.industry} placeholder="e.g. Beauty and personal care" />
        </label>
        <label className="field">
          <span>Market motion</span>
          <select name="marketType" defaultValue={initialValues.marketType ?? "B2B"}>{markets.map(market => <option key={market}>{market}</option>)}</select>
        </label>
      </div>
    </section>

    <section className={`form-section decision-section ${revealUpClass}`} style={getStaggerDelay(1)}>
      <div className="decision-section-head">
        <span>02</span>
        <div>
          <p className="eyebrow">Set the reality</p>
          <h2>Make the recommendation fit the business you can build.</h2>
          <p>These constraints stop an attractive market from turning into an impossible first move. They carry forward if you deepen the same idea later.</p>
        </div>
      </div>
      <div className="field-grid decision-field-grid">
        <label className="field">
          <span>Outcome worth reaching</span>
          <select name="revenueTarget" defaultValue={initialValues.assumptions?.revenueTarget ?? "$5k MRR"}><option>$1k MRR</option><option>$5k MRR</option><option>$10k MRR</option><option>Venture-scale</option></select>
        </label>
        <label className="field">
          <span>Preferred revenue engine</span>
          <select name="monetization" defaultValue={initialValues.assumptions?.monetization ?? "Subscription"}><option>Subscription</option><option>Usage-based</option><option>One-time purchase</option><option>Service + software</option></select>
        </label>
        <label className="field">
          <span>Build complexity ceiling</span>
          <select name="complexityTolerance" defaultValue={initialValues.assumptions?.complexityTolerance ?? "Low"}><option>Low</option><option>Medium</option><option>High</option></select>
        </label>
        <label className="field">
          <span>Platform dependency ceiling</span>
          <select name="platformTolerance" defaultValue={initialValues.assumptions?.platformTolerance ?? "Low"}><option>Low</option><option>Medium</option><option>High</option></select>
        </label>
        <label className="field full">
          <span>Regulatory exposure ceiling</span>
          <select name="regulatoryTolerance" defaultValue={initialValues.assumptions?.regulatoryTolerance ?? "Low"}><option>Low</option><option>Medium</option><option>High</option></select>
        </label>
      </div>
    </section>

    <section className={`form-section mode-section decision-section depth-section ${revealUpClass}`} style={getStaggerDelay(2)}>
      <div className="decision-section-head depth-section-head">
        <span>03</span>
        <div>
          <p className="eyebrow">Choose the burden of proof</p>
          <h2>How much confidence does this decision deserve?</h2>
          <p>Use the fast filter for idea triage. Use the full dossier before a consequential commitment.</p>
        </div>
        <div className="credit-balance"><WalletCards size={16} /><span><b>{creditSnapshot ? creditSnapshot.paid_credits : "Unavailable"}</b> paid credits</span><small>{creditSnapshot ? (creditSnapshot.free_quick_scans_remaining ? "Free Quick Scan available this month" : "Monthly Quick Scan used") : "Credit status unavailable"}</small></div>
      </div>

      <div className="grounding-readiness" role="status"><Radar size={15} /><span><b>Source availability is checked at launch.</b> If a research provider is unavailable, the system falls back to alternative sources.</span></div>

      <div className="mode-grid production-mode-grid">
        {(["quick_scan", "full_validation"] as const).map(reportMode => {
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
            <span className="mode-card-number">{presentation.number}</span>
            <span className="mode-card-top"><Icon size={19} /><i>{config.creditCost} {config.creditCost === 1 ? "credit" : "credits"}</i>{active && <Check size={15} />}</span>
            <b>{config.label}</b>
            <em>{presentation.bestFor}</em>
            <small>{config.customerDescription}</small>
            <ul>{presentation.included.map(item => <li key={item}><Check size={13} />{item}</li>)}</ul>
            <div className="mode-exclusions">{presentation.excluded.map(item => <span key={item}><X size={12} />{item}</span>)}</div>
            <div className="mode-card-select">{active ? <><Sparkles size={13}/> Selected for this trial</> : <>Choose this depth <ArrowRight size={13}/></>}</div>
          </button>;
        })}
      </div>
    </section>

    <footer className="form-footer production-form-footer decision-launch-dock">
      <div className="decision-launch-summary">
        <span>Decision run</span>
        {error
          ? <p className="form-error" role="alert"><ShieldAlert size={15}/>{error}</p>
          : <p><b>{selected.label}</b><small>{selected.creditCost} {selected.creditCost === 1 ? "credit" : "credits"} used only when the run starts.</small></p>}
      </div>
      {available
        ? <button className={`button ${motion.buttonBase} ${submitting ? "is-loading" : ""}`} type="submit" disabled={submitting}>
            {submitting ? <><Loader2 className="animate-spin" size={17}/> Opening the evidence room...</> : <>Put my idea on trial <ArrowRight size={17}/></>}
          </button>
        : <button className={`button ${motion.buttonBase}`} type="button" disabled title="Paid checkout is not available yet">
            {creditSnapshot ? `${selected.label} unavailable` : "Credit status unavailable"}
          </button>}
    </footer>
  </form>;
}
