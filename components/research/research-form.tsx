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
import {
  buildInterpretedDecisionBrief,
  type FullValidationDecisionContract,
} from "@/lib/readiness-contract";

const markets: MarketType[] = [
  "B2B", "D2C", "Creator", "Developer Tool", "Local Business",
  "Agency Tool", "Student/Career", "Other",
];

const modePresentation = {
  quick_scan: {
    icon: SearchCheck,
    number: "01",
    bestFor: "Find whether this idea earns another hour.",
    included: ["12-factor ShouldBuild Readiness Score", "Explicit verdict and decisive signals", "Risks, pricing direction, and next actions", "Clickable citations and portable exports"],
    excluded: ["No deep competitor or GTM analysis", "No MVP scope or go-to-market report"],
  },
  full_validation: {
    icon: Telescope,
    number: "02",
    bestFor: "Build the case before the team, money, or code commits.",
    included: ["Deeper adversarial evidence search", "Competitor, pricing, risk, and positioning map", "MVP scope, launch sequence, and 12-factor ShouldBuild Readiness Score", "Clickable citations and portable exports"],
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
    decisionContract?: Partial<FullValidationDecisionContract>;
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
  const initialContract = initialValues.assumptions?.decisionContract;
  const [contractDraft, setContractDraft] = useState({
    decisionBeingConsidered: initialContract?.decisionBeingConsidered ?? "",
    targetMilestone: initialContract?.targetMilestone ?? "",
    deadline: initialContract?.deadline ?? "",
    availableTimeHoursPerWeek:
      String(initialContract?.availableTimeHoursPerWeek ?? ""),
    availableBudgetAmount: String(initialContract?.availableBudgetAmount ?? ""),
    budgetCurrency: initialContract?.budgetCurrency ?? "",
    founderSkills: initialContract?.founderSkills ?? "",
    skillFit: initialContract?.skillFit ?? "",
    domainExperience: initialContract?.domainExperience ?? "",
    domainExperienceLevel: initialContract?.domainExperienceLevel ?? "",
    existingAudience: initialContract?.existingAudience ?? "",
    existingAudienceDetails: initialContract?.existingAudienceDetails ?? "",
    buyerAccess: initialContract?.buyerAccess ?? "",
    buyerAccessDetails: initialContract?.buyerAccessDetails ?? "",
    platformTolerance: initialContract?.platformTolerance
      ? initialContract.platformTolerance[0].toUpperCase() +
        initialContract.platformTolerance.slice(1)
      :
      (defaultMode === "quick_scan"
        ? initialValues.assumptions?.platformTolerance ?? "Low"
        : ""),
    regulatoryTolerance: initialContract?.regulatoryTolerance
      ? initialContract.regulatoryTolerance[0].toUpperCase() +
        initialContract.regulatoryTolerance.slice(1)
      :
      (defaultMode === "quick_scan"
        ? initialValues.assumptions?.regulatoryTolerance ?? "Low"
        : ""),
    abandonmentConditions: initialContract?.abandonmentConditions ?? "",
  });
  const [decisionBriefConfirmed, setDecisionBriefConfirmed] = useState(
    initialContract?.confirmed === true,
  );
  const selected = getReportModeConfig(mode);
  const available = canLaunchReport(mode, creditSnapshot?.paid_credits ?? 0, creditSnapshot?.free_quick_scans_remaining ?? 0);
  const setContractValue = (key: keyof typeof contractDraft, value: string) => {
    setContractDraft((current) => ({ ...current, [key]: value }));
    setDecisionBriefConfirmed(false);
  };
  const contractComplete = Object.entries(contractDraft).every(([key, value]) =>
    ["existingAudienceDetails", "buyerAccessDetails"].includes(key) ||
    String(value).trim().length > 0
  );
  const interpretedBrief = contractComplete
    ? buildInterpretedDecisionBrief({
      ...contractDraft,
      availableTimeHoursPerWeek:
        Number(contractDraft.availableTimeHoursPerWeek),
      availableBudgetAmount: Number(contractDraft.availableBudgetAmount),
      skillFit:
        contractDraft.skillFit as FullValidationDecisionContract["skillFit"],
      domainExperienceLevel:
        contractDraft.domainExperienceLevel as FullValidationDecisionContract["domainExperienceLevel"],
      existingAudience:
        contractDraft.existingAudience as FullValidationDecisionContract["existingAudience"],
      buyerAccess:
        contractDraft.buyerAccess as FullValidationDecisionContract["buyerAccess"],
      platformTolerance:
        contractDraft.platformTolerance.toLowerCase() as FullValidationDecisionContract["platformTolerance"],
      regulatoryTolerance:
        contractDraft.regulatoryTolerance.toLowerCase() as FullValidationDecisionContract["regulatoryTolerance"],
      confirmed: true,
    })
    : "Complete the decision, founder, access, and constraint fields to generate the interpreted brief.";

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!available || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      if (mode === "full_validation" && !decisionBriefConfirmed) {
        throw new Error(
          "Confirm the interpreted decision brief before Full Validation research begins.",
        );
      }
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
          ...(mode === "full_validation"
            ? {
              decisionContract: {
                ...contractDraft,
                availableTimeHoursPerWeek:
                  Number(contractDraft.availableTimeHoursPerWeek),
                availableBudgetAmount:
                  Number(contractDraft.availableBudgetAmount),
                platformTolerance:
                  contractDraft.platformTolerance.toLowerCase(),
                regulatoryTolerance:
                  contractDraft.regulatoryTolerance.toLowerCase(),
                confirmed: true,
              } as FullValidationDecisionContract,
            }
            : {}),
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
          <select name="platformTolerance" value={contractDraft.platformTolerance} onChange={(event) => setContractValue("platformTolerance", event.target.value)} required={mode === "full_validation"}>
            {mode === "full_validation" && <option value="" disabled>Choose a tolerance</option>}
            <option>Low</option><option>Medium</option><option>High</option>
          </select>
        </label>
        <label className="field full">
          <span>Regulatory exposure ceiling</span>
          <select name="regulatoryTolerance" value={contractDraft.regulatoryTolerance} onChange={(event) => setContractValue("regulatoryTolerance", event.target.value)} required={mode === "full_validation"}>
            {mode === "full_validation" && <option value="" disabled>Choose a tolerance</option>}
            <option>Low</option><option>Medium</option><option>High</option>
          </select>
        </label>
      </div>
    </section>

    {mode === "full_validation" && <section className={`form-section decision-section ${revealUpClass}`} style={getStaggerDelay(2)}>
      <div className="decision-section-head">
        <span>03</span>
        <div>
          <p className="eyebrow">Confirm the decision contract</p>
          <h2>Define the decision before research begins.</h2>
          <p>These are founder-provided constraints. ShouldBuild will not fill in missing skills, access, time, budget, tolerance, or stop conditions.</p>
        </div>
      </div>
      <div className="field-grid decision-field-grid">
        <label className="field full"><span>Decision being considered</span><input value={contractDraft.decisionBeingConsidered} onChange={(event) => setContractValue("decisionBeingConsidered", event.target.value)} placeholder="e.g. Whether to fund and build a paid pilot" required /></label>
        <label className="field"><span>Target milestone</span><input value={contractDraft.targetMilestone} onChange={(event) => setContractValue("targetMilestone", event.target.value)} placeholder="e.g. Two paid pilots" required /></label>
        <label className="field"><span>Decision deadline</span><input type="date" value={contractDraft.deadline} onChange={(event) => setContractValue("deadline", event.target.value)} required /></label>
        <label className="field"><span>Available hours per week</span><input type="number" min="1" max="168" value={contractDraft.availableTimeHoursPerWeek} onChange={(event) => setContractValue("availableTimeHoursPerWeek", event.target.value)} required /></label>
        <label className="field"><span>Validation budget</span><span className="field-inline"><input aria-label="Budget currency" value={contractDraft.budgetCurrency} onChange={(event) => setContractValue("budgetCurrency", event.target.value.toUpperCase())} placeholder="USD" minLength={3} maxLength={3} required /><input aria-label="Budget amount" type="number" min="0" value={contractDraft.availableBudgetAmount} onChange={(event) => setContractValue("availableBudgetAmount", event.target.value)} placeholder="Amount" required /></span></label>
        <label className="field"><span>Founder skills</span><textarea value={contractDraft.founderSkills} onChange={(event) => setContractValue("founderSkills", event.target.value)} placeholder="Relevant product, technical, sales, or operating skills" required /></label>
        <label className="field"><span>Skill fit for this idea</span><select value={contractDraft.skillFit} onChange={(event) => setContractValue("skillFit", event.target.value)} required><option value="" disabled>Choose based on your profile</option><option value="strong">Strong match</option><option value="partial">Partial match</option><option value="gap">Material gap</option></select></label>
        <label className="field"><span>Domain experience</span><textarea value={contractDraft.domainExperience} onChange={(event) => setContractValue("domainExperience", event.target.value)} placeholder="Relevant roles, years, workflows, or none" required /></label>
        <label className="field"><span>Domain experience level</span><select value={contractDraft.domainExperienceLevel} onChange={(event) => setContractValue("domainExperienceLevel", event.target.value)} required><option value="" disabled>Choose based on your experience</option><option value="deep">Deep</option><option value="some">Some</option><option value="none">None</option></select></label>
        <label className="field"><span>Existing audience or distribution</span><select value={contractDraft.existingAudience} onChange={(event) => setContractValue("existingAudience", event.target.value)} required><option value="" disabled>Choose current access</option><option value="owned_target_audience">Owned target-buyer audience</option><option value="relevant_network">Relevant network</option><option value="none">None</option></select></label>
        <label className="field"><span>Audience details <small>Optional</small></span><input value={contractDraft.existingAudienceDetails} onChange={(event) => setContractValue("existingAudienceDetails", event.target.value)} placeholder="Channel, size, and relevance" /></label>
        <label className="field"><span>Access to target buyers</span><select value={contractDraft.buyerAccess} onChange={(event) => setContractValue("buyerAccess", event.target.value)} required><option value="" disabled>Choose current access</option><option value="direct">Direct access</option><option value="warm">Warm introductions</option><option value="cold">Cold outreach only</option><option value="none">No current access</option></select></label>
        <label className="field"><span>Buyer-access details <small>Optional</small></span><input value={contractDraft.buyerAccessDetails} onChange={(event) => setContractValue("buyerAccessDetails", event.target.value)} placeholder="Who you can reach and how" /></label>
        <label className="field full"><span>Conditions that would make you abandon the idea</span><textarea value={contractDraft.abandonmentConditions} onChange={(event) => setContractValue("abandonmentConditions", event.target.value)} placeholder="State a falsifiable stop condition, not a feeling" required /></label>
      </div>
      <article className="grounding-readiness" role="status"><Radar size={15}/><span><b>Interpreted brief</b> {interpretedBrief}</span></article>
      <label className="field full">
        <span><input type="checkbox" checked={decisionBriefConfirmed} onChange={(event) => setDecisionBriefConfirmed(event.target.checked)} disabled={!contractComplete} required /> I confirm this interpreted brief is accurate and authorize research against these constraints.</span>
      </label>
    </section>}

    <section className={`form-section mode-section decision-section depth-section ${revealUpClass}`} style={getStaggerDelay(2)}>
      <div className="decision-section-head depth-section-head">
        <span>{mode === "full_validation" ? "04" : "03"}</span>
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
            onClick={() => {
              setMode(reportMode);
              if (reportMode === "quick_scan") {
                setContractDraft((current) => ({
                  ...current,
                  platformTolerance: current.platformTolerance || "Low",
                  regulatoryTolerance: current.regulatoryTolerance || "Low",
                }));
              }
            }}
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
