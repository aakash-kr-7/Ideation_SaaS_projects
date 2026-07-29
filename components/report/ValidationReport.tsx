"use client";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Download, FileJson, FileSpreadsheet, FileText, ListChecks, ShieldCheck, Circle, CheckCircle2, Globe2 } from "lucide-react";
import { ValidationReport as ReportType } from "@/lib/report-schema";
import type { EvidenceItem } from "@/lib/types";
import { reportToCsv, reportToMarkdown, downloadExport } from "@/lib/report-export";
import { ScoreBreakdown } from "@/components/scoring/ScoreBreakdown";
import { ValidationExperiment } from "@/components/report/ValidationExperiment";
import { VerdictBadge } from "@/components/opportunity/verdict-badge";
import { ScoreBadge } from "@/components/scoring/score-badge";
import { getStaggerDelay, motion, revealUpClass } from "@/lib/motion";
import { getReportModeConfig } from "@/lib/report-modes";
import { countEvidenceSources, REPORT_TABS, type ReportTab } from "@/lib/report-mode-ui";
import { ReportCharts, type ReportChartDataset } from "@/components/report/ReportCharts";
import { FullValidationReportExperience } from "@/components/report/FullValidationReportExperience";

type ValidationReportProps = { report: ReportType; scorecard?: ReportType["opportunity"]["scorecard"]; publicMode?: boolean; runId?: string; chartDatasets?: ReportChartDataset[] };

export function ValidationReport(props: ValidationReportProps) {
  if (props.report.reportMode === "full_validation" && props.report.fullValidationDecision) {
    return <FullValidationReportExperience {...props}/>;
  }
  return <QuickScanReport {...props}/>;
}

function QuickScanReport({ report, scorecard, publicMode = false, runId, chartDatasets }: ValidationReportProps) {
  const [tab, setTab] = useState<ReportTab>("Conclusion");
  const [toast, setToast] = useState("");
  const [sourcePreview, setSourcePreview] = useState<EvidenceItem | null>(null);
  const o = useMemo(() => ({ ...report.opportunity, scorecard: scorecard ?? report.opportunity.scorecard }), [report, scorecard]);
  const config = getReportModeConfig(report.reportMode);
  const tabs = REPORT_TABS[report.reportMode] as readonly ReportTab[];
  const strongestPositive = o.evidence.find((item) => item.id === report.strongestPositiveEvidenceId) ?? o.evidence.find((item) => !item.disconfirming && !item.excluded);
  const strongestNegative = o.evidence.find((item) => item.id === report.strongestNegativeEvidenceId) ?? o.evidence.find((item) => item.disconfirming && !item.excluded) ?? o.evidence.find((item) => item.signal === "Risk");
  const canonicalSourceCount = countEvidenceSources(o.evidence);
  const independentDomainCount = new Set(o.evidence.map(canonicalDomainFor).filter(Boolean)).size;
  const acceptedEvidenceCount = report.evidenceSufficiency?.acceptedEvidenceCount ??
    o.evidence.filter((item) => !item.excluded && (!item.acceptanceDecision || item.acceptanceDecision === "accepted_core")).length;
  const evidenceConfidence = report.decisionProduct?.evidenceConfidence;
  const reportDate = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(report.generatedAt));
  const customerScore = o.scorecard.scoreBand?.display ?? `${o.scorecard.total}/100`;
  const showExactScore = !o.scorecard.scoreBand || o.scorecard.scoreBand.label === "High Evidence Confidence";

  const exportFile = async (format: "md" | "json" | "csv" | "pdf") => {
    const payload = { ...report, opportunity: o };
    if (!publicMode && runId) {
      const response = await fetch(`/api/research/${runId}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format }) });
      if (!response.ok) { const failure = await response.json().catch(() => null); setToast(failure?.error ?? "Stored export is unavailable"); return; }
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? `${o.name}-report.${format}`;
      downloadExport(filename, blob, blob.type);
      setToast(`${format.toUpperCase()} export downloaded`);
      setTimeout(() => setToast(""), 2200);
      return;
    }
    if (format === "pdf") {
      window.print();
      setToast("Print dialog opened for sample PDF");
      return;
    }
    if (format === "md") downloadExport(`${o.name}-report.md`, reportToMarkdown(payload), "text/markdown; charset=utf-8");
    if (format === "json") downloadExport(`${o.name}-report.json`, JSON.stringify(payload, null, 2), "application/json; charset=utf-8");
    if (format === "csv") downloadExport(`${o.name}-summary.csv`, reportToCsv(payload), "text/csv; charset=utf-8");
    setToast(`${format.toUpperCase()} export prepared`);
    setTimeout(() => setToast(""), 2200);
  };

  const verdictClass = o.scorecard.verdict.toLowerCase().replace(/\s+/g, "-");

  return <div className={publicMode ? "validation-report public-report premium-report quick-report-dossier" : "validation-report premium-report quick-report-dossier"}>
    {toast && <div className="report-toast sf-confirmation" role="status">{toast}</div>}

    <div className="report-document-bar">
      <div><span>ShouldBuild / Quick Scan</span><b>Decision brief</b><small>{reportDate} · Report {report.version}</small></div>
      <div>
        <button type="button" onClick={() => exportFile("pdf")}><Download size={14}/> Export PDF</button>
        <button type="button" onClick={() => exportFile("md")}><FileText size={14}/> Markdown</button>
      </div>
    </div>
    <header className="report-engine-hero">
      <div>
        <p className="eyebrow">{publicMode ? "Sample decision brief" : config.label} · {reportDate}</p>
        <span className={`report-mode-badge mode-${report.reportMode}`}>{config.label}</span>
        <h2>{o.name}</h2>
        <p>{o.oneLiner}</p>
        <div className="report-header-meta">
          <span>{o.targetCustomer}</span>
          <span>{o.market}</span>
          <span>{o.pricing.model}</span>
          <span>{o.mvp.buildComplexity ? `${o.mvp.buildComplexity} complexity` : "Build complexity unavailable"}</span>
          <span>{o.mvp.buildEstimate} to validation</span>
        </div>
      </div>
      <div className="report-verdict-lockup">
        <span>Recommended next move</span>
        <i className={`verdict-${verdictClass}`}>{o.scorecard.verdict}</i>
        <div>
          {showExactScore && <ScoreBadge score={o.scorecard.total} size="lg" />}
          <div>
            <b>{customerScore}</b>
            <small>Evidence-adjusted score</small>
          </div>
        </div>
      </div>
    </header>

    <EvidenceSufficiencySummary report={report}/>

    <section className="report-decision-strip" aria-label={`${config.label} decision summary`}>
      <article><span>Official verdict</span><b>{o.scorecard.verdict}</b></article>
      <article><span>Evidence confidence</span><b>{evidenceConfidence?.band ?? report.evidenceSufficiency?.overallEvidenceConfidence ?? "Not persisted"}</b></article>
      <article><span>Evidence findings accepted</span><b>{acceptedEvidenceCount}</b></article>
      <article><span>Independent cited domains</span><b>{independentDomainCount}</b></article>
      <article><span>{report.reportMode === "quick_scan" ? "Strongest positive signal" : "Most important opportunity"}</span><b>{strongestPositive?.title ?? "Not enough supporting evidence"}</b></article>
      <article><span>{report.reportMode === "quick_scan" ? "Strongest negative signal" : "Most important objection"}</span><b>{strongestNegative?.title ?? report.adversarialGate?.objection ?? "No independent negative signal resolved"}</b></article>
      <article className="report-recommendation"><span>Highest-value next experiment</span><b>{report.decisionProduct?.experiments[0]?.name ?? "A decision experiment was not persisted."}</b></article>
    </section>

    {sourcePreview && <aside className="source-preview" aria-label="Evidence source preview">
      <button type="button" onClick={() => setSourcePreview(null)} aria-label="Close source preview">×</button>
      <p className="eyebrow">Evidence source · Tier {sourcePreview.sourceTier ?? "unrated"}</p>
      <h3>{sourcePreview.title}</h3><p>{sourcePreview.snippet}</p>
      <dl><div><dt>Source</dt><dd>{sourcePreview.source}</dd></div><div><dt>Published</dt><dd>{sourcePreview.date ?? "Not available"}</dd></div><div><dt>Type</dt><dd>{sourcePreview.sourceType}</dd></div><div><dt>Why this matters</dt><dd>{sourcePreview.disconfirming ? "This contradictory source tests the opportunity against a credible objection." : "This source directly supports a decision-relevant signal."}</dd></div></dl>
      <a className="button button-small" href={sourcePreview.url} target="_blank" rel="noreferrer">Open original source</a>
    </aside>}

    <div className="report-layout">
      <aside className="verdict-sidebar">
        <p className="eyebrow">Decision snapshot</p>
        <div style={{ margin: "12px 0" }}>
          <VerdictBadge verdict={o.scorecard.verdict} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: "18px 0 10px 0" }}>
          {showExactScore && <ScoreBadge score={o.scorecard.total} size="lg" />}
          <div>
            <b style={{ fontSize: 16 }}>{customerScore}</b>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>{o.scorecard.confidence}% score confidence</p>
          </div>
        </div>
        <div className="sidebar-metrics">
          <Metric label="Report date" value={reportDate}/>
          <Metric label="Report type" value={config.label}/>
          <Metric label="Distinct sources cited" value={String(canonicalSourceCount)}/>
          <Metric label="Accepted findings" value={String(acceptedEvidenceCount)}/>
          <Metric label="Competitors mapped" value={String(o.competitors.length)}/>
        </div>
        <hr/>
        <span><ShieldCheck size={14}/> Sources cited</span>
        <span><ListChecks size={14}/> Assumptions labelled</span>
        <span><AlertTriangle size={14}/> Not a guarantee</span>
        <div className="sidebar-export">
          {report.availableExports.includes("markdown") && <button onClick={() => exportFile("md")}><FileText size={13}/>MD</button>}
          {report.availableExports.includes("pdf") && <button onClick={() => exportFile("pdf")}><FileSpreadsheet size={13}/>PDF</button>}
          {report.availableExports.includes("json") && <button onClick={() => exportFile("json")}><FileJson size={13}/>JSON</button>}
        </div>
      </aside>

        <div className="report-main">
          <ReportCharts report={report} datasets={chartDatasets}/>
          <nav className="report-tabs">
          {tabs.map(t => <button key={t} className={`${tab === t ? "active" : ""} ${motion.buttonTight}`} aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
        </nav>
        <div className="report-tab-content sf-content-enter" key={tab}>
          {tab === "Conclusion" && <><Verdict report={report}/><VerdictClarity report={report}/><DecisionDossier report={report}/></>}
          {tab === "Evidence" && <EvidenceView report={report} onPreview={setSourcePreview}/>}
          {tab === "Demand" && <EvidenceSignalView report={report} signals={["Pain", "Demand"]}/>}
          {tab === "Competition" && <CompetitorView report={report}/>}
          {tab === "Market" && <EvidenceSignalView report={report} signals={["Demand", "Pricing"]}/>}
          {tab === "Score breakdown" && <ScoringView scorecard={o.scorecard} evidence={o.evidence}/>}
          {tab === "MVP scope" && <MvpView report={report}/>}
          {tab === "Pricing" && <PricingView report={report}/>}
          {tab === "Go-to-market" && <LaunchView report={report}/>}
          {tab === "Next actions" && <ChecklistView report={report}/>}
          {tab === "Risks" && <RiskView report={report}/>}
          {tab === "Specialists" && <SpecialistView report={report}/>}
          {tab === "Adversarial" && <AdversarialView report={report}/>}
          {tab === "Sources" && <SourcesView report={report}/>}
          {tab === "Exports" && <ExportView onExport={exportFile} formats={report.availableExports}/>}
        </div>
        {report.reportMode === "full_validation" && <FinalBlock report={report}/>}
        {report.reportMode === "quick_scan" && !publicMode && <section className="quick-upgrade-card"><div><p className="eyebrow">Ready for a final decision?</p><h3>Upgrade to Full Validation.</h3><p>Your idea and context will be carried forward. We'll run deeper adversarial research, model your MVP, build a GTM plan, and deliver a comprehensive decision dossier.</p></div><Link className="button" href={`/research/new?mode=full_validation&upgradeFrom=${runId ?? report.id}`}>Run Full Validation</Link></section>}
      </div>
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><b>{value}</b></div>;
}

function EvidenceSufficiencySummary({ report }: { report: ReportType }) {
  const summary = report.evidenceSufficiency;
  if (!summary) return <section className="report-callout" role="note"><div><p className="eyebrow">Evidence Sufficiency</p><h3>Legacy report — factor-level sufficiency was not persisted.</h3><p>This immutable report remains readable, but no new confidence metadata is inferred retroactively.</p></div></section>;
  const state = report.researchAvailabilityState === "insufficient_evidence" ? "Insufficient Evidence" : "Research Completed";
  const cautious = summary.overallEvidenceConfidence === "Low" || summary.overallEvidenceConfidence === "Insufficient";
  const displayedScore = report.opportunity.scorecard.scoreBand?.display ?? `${report.opportunity.scorecard.total}/100`;
  return <section className={`evidence-sufficiency evidence-confidence-${summary.overallEvidenceConfidence.toLowerCase()}`} aria-label="Evidence Sufficiency">
    <header><div><p className="eyebrow">Evidence Sufficiency</p><h3>{report.opportunity.scorecard.scoreBand?.display ? displayedScore : `${displayedScore} · ${summary.overallEvidenceConfidence} Evidence Confidence`}</h3><p>{cautious ? "Treat this result as a bounded signal, not a settled market conclusion." : "The displayed confidence reflects the persisted evidence behind this report."}</p></div><div><span className="research-state">{state}</span><b>{report.opportunity.scorecard.verdict}</b></div></header>
    <div className="sufficiency-metrics">
      <article><span>Independent groups</span><b>{summary.independentEvidenceGroups}</b></article>
      <article><span>Source-family coverage</span><b>{summary.sourceFamilyCoverage.length}</b><small>{summary.sourceFamilyCoverage.map(humanLabel).join(", ") || "No families covered"}</small></article>
      <article><span>Direct or official evidence</span><b>{summary.primaryDirectEvidenceCount}</b></article>
      <article><span>Source concentration</span><b>{Math.round(summary.sourceConcentration * 100)}%</b></article>
    </div>
    <div className="sufficiency-limitations"><p><b>Missing critical evidence:</b> {summary.missingEvidenceFamilies.map(humanLabel).join(", ") || "No critical family is recorded as missing."}</p><p><b>Strongest confidence limitation:</b> {summary.mostImportantLimitation}</p></div>
    {report.researchExecution && <ResearchPackStatus report={report}/>}
  </section>;
}

const PACK_LABELS: Record<string, string> = { quick_primary: "Primary buyer/problem research", quick_adversarial: "Adversarial research", quick_pricing_wtp: "Pricing and willingness-to-pay research", quick_coverage_repair: "Conditional coverage repair" };
const PACK_STATUS_LABELS: Record<string, string> = { completed: "Completed", completed_no_evidence: "Completed, no accepted evidence", quota_blocked: "Quota blocked", provider_failed: "Provider unavailable", timed_out: "Timed out", skipped: "Not required" };
function ResearchPackStatus({ report }: { report: ReportType }) {
  const statuses = new Map(report.researchExecution?.packStatuses.map((item) => [item.packKey, item]) ?? []);
  return <div className="research-pack-status" aria-label="Research pack status">{Object.entries(PACK_LABELS).map(([key, label]) => {
    const item = statuses.get(key); const status = item?.status ?? "skipped";
    return <article key={key} data-state={status}><span>{label}</span><b>{PACK_STATUS_LABELS[status]}</b>{item?.failureReason && <small>{item.failureReason}</small>}</article>;
  })}</div>;
}

function Verdict({ report }: { report: ReportType }) {
  const o = report.opportunity;
  return <>
    <div className="report-callout executive-summary">
      <ListChecks size={20}/>
      <div>
        <p className="eyebrow">Executive summary</p>
        <h3>{report.executiveSummary}</h3>
        <p><b>Strongest signal:</b> {o.evidence[0]?.snippet}</p>
        <p><b>Primary risk:</b> {o.risks[0]?.description}</p>
        <p><b>Validate first:</b> {report.decisionProduct?.experiments[0]?.name ?? "A validation experiment was not persisted."}</p>
        {!!report.narrativeCitations?.executive_summary.length && <div className="sentence-citations">
          <p><b>Executive-summary evidence:</b><EvidenceCitations report={report} evidenceIds={[...new Set(report.narrativeCitations.executive_summary.flatMap((claim) => claim.evidence_ids))]}/></p>
        </div>}
      </div>
    </div>
    <div className="verdict-grid">
      <article><span>Target buyer</span><b>{o.targetCustomer}</b></article>
      <article><span>Core workflow pain</span><b>{o.corePain}</b></article>
      <article><span>Current workaround</span><b>{o.evidence.find(e => e.signal === "Pain")?.snippet ?? "Requires direct buyer confirmation."}</b></article>
    </div>
    <section className="report-limitations">
      <div><p className="eyebrow">Limitations and missing evidence</p><h3>{report.evidenceGaps.length ? "The decision still has evidence gaps." : "No hidden gaps were removed from the report."}</h3></div>
      <ul>{report.limitations.map((item) => <li key={item}>{item}</li>)}</ul>
    </section>
  </>;
}

function EvidenceView({ report, onPreview }: { report: ReportType; onPreview: (evidence: EvidenceItem) => void }) {
  return <div className="evidence-card-grid">
    {report.opportunity.evidence.map((e, index) => <article tabIndex={0} className={`${motion.cardInteractive} ${revealUpClass}`} style={getStaggerDelay(index)} key={e.id}>
      <div>
        <b>{e.sourceType}</b>
        <span>{categoryFor(e.signal)}</span>
      </div>
      <h3>{e.title}</h3>
      <p>&ldquo;{e.snippet}&rdquo;</p>
      <div className="evidence-meta">
        <span>{e.source}</span>
        <span>{e.date}</span>
        <span>{e.strength} confidence</span>
        {e.sourceTier && <span>Tier {e.sourceTier} source</span>}
        {e.disconfirming && <span>Contradictory evidence</span>}
      </div>
      <footer>
        <button type="button" onClick={() => onPreview(e)}>Inspect evidence</button>
        <a href={e.url} target="_blank" rel="noreferrer">Source URL ↗</a>
        <small>{e.url}</small>
      </footer>
    </article>)}
  </div>;
}

function categoryFor(signal: string) {
  return signal === "Pain" ? "User Complaint" : signal === "Pricing" ? "Competitive Pricing" : signal === "Risk" ? "Risk Factor" : "Market Signal";
}

function CompetitorView({ report }: { report: ReportType }) {
  if (!report.opportunity.competitors?.length) {
    return <div className="report-callout" style={{ margin: '20px' }}>
      <div>
        <p className="eyebrow">Competitive analysis</p>
        <h3>Current competitor details were not verified.</h3>
        <p>Relevant category candidates were identified, but current pricing and positioning could not be verified in this scan.</p>
      </div>
    </div>;
  }

  const hasUnverified = report.opportunity.competitors.some((item) =>
    !["live_verified_competitor", "adjacent_alternative"].includes(item.verificationStatus || (item.evidenceIds?.length ? "live_verified_competitor" : "unverified_seed"))
  );
  return <div className="competitor-table-wrap">
    {hasUnverified && <div className="report-callout" role="note">Relevant category candidates were identified, but current pricing and positioning could not be verified in this scan.</div>}
    <table className="competitor-table">
      <thead>
        <tr>
          <th>Competitor</th>
          <th>Target customer</th>
          <th>Pricing</th>
          <th>Strength</th>
          <th>Weakness</th>
          <th>Exploitable gap</th>
        </tr>
      </thead>
      <tbody>
        {report.opportunity.competitors.map((c, index) => {
          const verification = c.verificationStatus || (c.evidenceIds?.length ? "live_verified_competitor" : "unverified_seed");
          const verified = verification === "live_verified_competitor" || verification === "adjacent_alternative";
          return <tr className={revealUpClass} style={getStaggerDelay(index)} key={c.id}>
          <td><b>{c.name}</b><small>{humanLabel(verification)}</small></td>
          <td>{c.target}</td>
          <td>{verified ? c.pricing : "Not live verified"}</td>
          <td>{c.strength}</td>
          <td>{verified ? c.positioning : "Not live verified"}</td>
          <td>{verified ? c.gap : "Unavailable — evidence gap"}</td>
        </tr>;})}
      </tbody>
    </table>
  </div>;
}

function ScoringView({ scorecard, evidence }: { scorecard: ReportType["opportunity"]["scorecard"]; evidence: EvidenceItem[] }) {
  const entries = Object.entries(scorecard.scores);
  const ordered = [...entries].sort((a, b) => b[1] - a[1]);
  return <>
    <div className="canonical-scorecard"><div><p className="eyebrow">Official deterministic score</p><h3>{scorecard.scoreBand?.display ?? `${scorecard.total}/100`} · {scorecard.verdict}</h3><p>The displayed verdict is computed by the shared scoring engine. Narrative generation cannot override it.</p></div><ScoreBreakdown scorecard={scorecard} evidence={evidence}/></div>
    <section className="score-explanation">
      <p className="eyebrow">Score analysis</p>
      <p><b>Strongest drivers:</b> {ordered.slice(0, 3).map(([key]) => pretty(key)).join(", ")}. <b>Weakest drivers:</b> {ordered.slice(-3).map(([key]) => pretty(key)).join(", ")}.</p>
      <p>The score reflects current evidence, not a forecast. Confidence would increase with direct buyer interviews, a paid pilot commitment, and a source-backed pricing comparison.</p>
      <div>
        <span>Willingness-to-pay evidence</span>
        <small>{scorecard.notes.willingnessToPay}</small>
      </div>
    </section>
  </>;
}

function pretty(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, x => x.toUpperCase());
}

function humanLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function specialistName(value: string) {
  const names: Record<string, string> = {
    competition: "Competitive landscape",
    market: "Market context",
    pricing: "Pricing and willingness to pay",
    risk: "Adoption and execution risk",
    demand: "Buyer demand",
    gtm: "Customer acquisition",
  };
  return names[value] ?? pretty(value);
}

function specialistDirectionLabel(value: string) {
  if (value === "SupportsOpportunity" || value === "Supports opportunity") return "Supports opportunity";
  if (value === "ChallengesOpportunity" || value === "Challenges opportunity") return "Challenges opportunity";
  if (value === "Insufficient" || value === "Insufficient evidence") return "Insufficient evidence";
  return "Mixed evidence";
}

function MvpView({ report }: { report: ReportType }) {
  const o = report.opportunity;
  const m = o.mvp;
  return <>
    <div className="mvp-timeline phased">
      <article>
        <span>Validation target</span>
        <b>{o.launch.successMetric}</b>
        <p>{o.launch.outreachMessage}</p>
      </article>
      <article>
        <span>MVP outcome</span>
        <b>{m.outcome}</b>
        <p>{m.scope.join(" · ")}</p>
      </article>
      <article>
        <span>Initial pricing direction</span>
        <b>{o.pricing.firstOffer}</b>
        <p>{o.pricing.rationale}</p>
      </article>
      <article>
        <span>Persisted build assessment</span>
        <b>{m.buildComplexity} complexity</b>
        <p>{m.buildEstimate}</p>
      </article>
    </div>
    <div className="scope-groups">
      <article>
        <b>Must-have</b>
        <p>{m.scope.join(" · ")}</p>
      </article>
      <article>
        <b>Exclude for now</b>
        <p>{m.exclusions.join(" · ")}</p>
      </article>
    </div>
  </>;
}

function PricingView({ report }: { report: ReportType }) {
  const p = report.opportunity.pricing;
  const cards = [
    ["Pricing model", p.model, "Persisted model", p.rationale],
    ["Core price", p.pricePoint, "Persisted price point", p.rationale],
    ["First offer", p.firstOffer, "Initial paid validation", p.rationale],
    ...(p.targetCustomers !== null && p.targetCustomers > 0 ? [["Initial target", `${p.targetCustomers} customers`, "Persisted customer target", p.rationale]] : [])
  ];
  return <>
    <div className="pricing-strategy-cards">
      {cards.map(([name, price, limits, reason], index) => <article tabIndex={0} className={`${motion.cardInteractive} ${revealUpClass}`} style={getStaggerDelay(index)} key={name}>
        <span>{name}</span>
        <b>{price}</b>
        <small>{limits}</small>
        <p>{reason}</p>
      </article>)}
    </div>
    <div className="report-pricing-caveat"><AlertTriangle size={15}/><p>This is evidence-backed pricing direction, not a revenue projection. Validate willingness to pay with a real purchase or paid pilot.</p></div>
  </>;
}

function LaunchView({ report }: { report: ReportType }) {
  const l = report.opportunity.launch;
  return <div className="launch-plan">
    <div className="launch-columns">
      <article>
        <p className="eyebrow">Early customer strategy</p>
        <b>{l.firstCustomerChannel}</b>
        <ol>{l.firstTenStrategy.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
      </article>
      <article>
        <p className="eyebrow">Week one</p>
        <b>{l.successMetric}</b>
        <ol>{l.weekOne.map((step, index) => <li key={step}><span>{index + 1}</span>{step}</li>)}</ol>
      </article>
    </div>
    <ValidationExperiment steps={l.weekOne}/>
    <div className="outreach-script">
      <b>Outreach script</b>
      <p>&ldquo;{l.outreachMessage}&rdquo;</p>
      <span><strong>Channels:</strong> {l.firstCustomerChannel}</span>
      <span><strong>Success signal:</strong> {l.successMetric}</span>
      <span><strong>Validation target:</strong> {l.successMetric}</span>
    </div>
  </div>;
}

function ChecklistView({ report }: { report: ReportType }) {
  const o = report.opportunity;
  const reportId = o.id;
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const data = window.localStorage.getItem(`checklist-${reportId}`);
    if (data) {
      try { setChecked(JSON.parse(data)); } catch {}
    }
  }, [reportId]);

  if (report.reportMode === "quick_scan") {
    const actions = [...o.launch.weekOne, o.launch.successMetric, o.launch.outreachMessage, `Test the initial offer: ${o.pricing.firstOffer}`].filter((item, index, all) => item && all.indexOf(item) === index).slice(0, 3);
    return <section className="quick-next-actions"><p className="eyebrow">Recommended next three validation actions</p>{actions.map((item, index) => <article key={item}><span>0{index + 1}</span><b>{item}</b></article>)}</section>;
  }
  const sectionInputs = [
    ["Immediate validation actions", o.launch.weekOne],
    ["First-customer plan", o.launch.firstTenStrategy],
    ["MVP scope decisions", [...o.mvp.scope.map(item => `Build: ${item}`), ...o.mvp.exclusions.map(item => `Do not build: ${item}`)]],
    ["Risk mitigation", o.risks.map(risk => `${risk.description} — ${risk.mitigation}`)],
  ] as const;
  const sections = sectionInputs.map(([title, items], sectionIndex) => ({
    title,
    items: items.filter(Boolean).map((text, itemIndex) => ({ key: `${sectionIndex}-${itemIndex}`, text })),
  })).filter(section => section.items.length);

  const toggle = (key: string) => {
    const next = { ...checked, [key]: !checked[key] };
    setChecked(next);
    window.localStorage.setItem(`checklist-${reportId}`, JSON.stringify(next));
  };

  const totalItems = sections.reduce((sum, s) => sum + s.items.length, 0);
  const checkedItems = Object.values(checked).filter(Boolean).length;
  const progressPercent = totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0;

  return <div className="validation-checklist-tab">
    <div className="checklist-progress-card">
      <div>
        <h4>Interactive report checklist</h4>
        <p>These actions, scope choices, and mitigations come from this report payload.</p>
      </div>
      <div className="checklist-progress-bar-wrap">
        <span>{checkedItems} / {totalItems} completed ({progressPercent}%)</span>
        <div className="checklist-progress-track">
          <div className="checklist-progress-fill" style={{ width: `${progressPercent}%` }} />
        </div>
      </div>
    </div>

    <div className="checklist-sections">
      {sections.map(sec => <section key={sec.title} className="checklist-section">
        <h3>{sec.title}</h3>
        <div className="checklist-items">
          {sec.items.map(item => {
            const isActive = checked[item.key];
            return <div key={item.key} className={`checklist-item-row ${isActive ? 'checked' : ''}`} onClick={() => toggle(item.key)}>
              <input type="checkbox" checked={!!isActive} onChange={() => {}} style={{ display: 'none' }} />
              <span className="checkbox-indicator">
                {isActive ? <CheckCircle2 size={16} /> : <Circle size={16} />}
              </span>
              <span className="item-text">{item.text}</span>
            </div>;
          })}
        </div>
      </section>)}
    </div>
  </div>;
}

function RiskView({ report }: { report: ReportType }) {
  return <div className="risk-heatmap detailed-risk">
    {report.opportunity.risks.map(existing => {
      return <article tabIndex={0} key={existing.id} className={`${existing.severity.toLowerCase()} ${motion.cardInteractive}`}>
        <div>
          <span>{existing.category} risk</span>
          <b>{existing.severity} severity</b>
        </div>
        <h3>{existing.description}</h3>
        <p><strong>Mitigation: </strong>{existing.mitigation}</p>
      </article>;
    })}
  </div>;
}

function EvidenceSignalView({ report, signals }: { report: ReportType; signals: Array<"Pain" | "Demand" | "Pricing" | "Risk"> }) {
  const evidence = report.opportunity.evidence.filter((item) => signals.includes(item.signal));
  return <section className="evidence-findings-section"><header><p className="eyebrow">Validated evidence</p><h3>Evidence-backed findings</h3></header>
    {evidence.length ? <div>{evidence.map((item) => <article key={item.id}><b>{item.title}</b><p>{item.snippet}</p><EvidenceCitations report={report} evidenceIds={[item.id]}/></article>)}</div> : <p className="report-empty-section">No attributable evidence is available for this section.</p>}
  </section>;
}

function VerdictClarity({ report }: { report: ReportType }) {
  const evidence = report.opportunity.evidence;
  const supporting = evidence.find((item) => item.id === report.strongestPositiveEvidenceId) ?? evidence.find((item) => !item.excluded && !item.disconfirming);
  const experiment = report.decisionProduct?.experiments[0];
  return <section className="verdict-clarity" aria-label="Verdict clarity">
    <header><p className="eyebrow">What drives this verdict</p><h3>{report.opportunity.scorecard.verdict}</h3></header>
    <div className="verdict-clarity-grid">
      <article><span>Strongest supporting reason</span><p>{supporting?.snippet ?? "No independent supporting reason was accepted."}</p></article>
      <article><span>Strongest uncertainty</span><p>{report.evidenceSufficiency?.mostImportantLimitation ?? report.limitations[0] ?? "Confidence metadata was not persisted."}</p></article>
      <article><span>Evidence that would upgrade it</span><p>{report.verdictChangeConditions?.upgradeCondition ?? "An upgrade condition was not persisted."}</p></article>
      <article><span>Evidence that would downgrade it</span><p>{report.verdictChangeConditions?.downgradeCondition ?? "A downgrade condition was not persisted."}</p></article>
    </div>
    {experiment && <article className="next-experiment">
      <div><span>Highest-value next experiment</span><h4>{experiment.name}</h4></div>
      <dl>
        <div><dt>Target buyer</dt><dd>{experiment.targetParticipant}</dd></div><div><dt>Method</dt><dd>{experiment.method}</dd></div>
        <div><dt>Sample size</dt><dd>{experiment.sampleSize}</dd></div><div><dt>Duration</dt><dd>{experiment.duration}</dd></div>
        <div><dt>Success threshold</dt><dd>{experiment.successCriterion}</dd></div><div><dt>Failure threshold</dt><dd>{experiment.failureCriterion}</dd></div>
        <div><dt>Decision unlocked</dt><dd>{experiment.decisionUnlocked}</dd></div>
      </dl>
    </article>}
  </section>;
}

function DecisionDossier({ report }: { report: ReportType }) {
  const product = report.decisionProduct;
  if (!product) return null;
  return <section className="decision-dossier">
    <header>
      <p className="eyebrow">Decision dossier · version {report.version}</p>
      <h3>{product.headline}</h3>
      <p>{product.evidenceConfidence.explanation}</p>
    </header>
    <div className="decision-section-list">
      {product.sections.map((section, sectionIndex) => <article key={section.key} className={revealUpClass} style={getStaggerDelay(sectionIndex)}>
        <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
        <div>
          <h4>{section.title}</h4>
          <p>{section.summary}</p>
          <ul>{section.statements.map((statement, index) => <li key={`${statement.kind}-${index}`}>
            <b className={`statement-kind kind-${statement.kind.toLowerCase()}`}>{humanLabel(statement.kind)}</b>
            <span>{statement.text}</span>
            {!!statement.evidenceIds.length && <EvidenceCitations report={report} evidenceIds={statement.evidenceIds}/>}
            {!statement.evidenceIds.length && statement.sourceUrls.map((url, sourceIndex) => <a key={url} href={url} target="_blank" rel="noreferrer">[source {sourceIndex + 1}]</a>)}
          </li>)}</ul>
        </div>
      </article>)}
    </div>
    <div className="experiment-grid">
      {product.experiments.map((experiment) => <article key={experiment.name}>
        <span>{experiment.duration}</span><h4>{experiment.name}</h4>
        <p><b>Hypothesis:</b> {experiment.hypothesis}</p>
        <p><b>Participant:</b> {experiment.targetParticipant}</p>
        <p><b>Recruitment:</b> {experiment.recruitmentMethod}</p>
        <p><b>Sample:</b> {experiment.sampleSize}</p>
        <p><b>Method:</b> {experiment.method}</p>
        <p><b>Pass:</b> {experiment.successCriterion}</p>
        <p><b>Fail:</b> {experiment.failureCriterion}</p>
        <p><b>Decision unlocked:</b> {experiment.decisionUnlocked}</p>
      </article>)}
    </div>
  </section>;
}

function SpecialistView({ report }: { report: ReportType }) {
  const specialists = report.specialistAssessments ?? [];
  const decisionSpecialists = new Map((report.decisionProduct?.specialistOutputs ?? []).map((item) => [item.name, item]));
  const insights = report.fullValidationInsights;
  
  if (specialists.length === 0) {
    return <div className="report-callout" style={{ margin: '20px' }}>
      <div>
        <p className="eyebrow">Evidence-bound specialist desk</p>
        <h3>Awaiting specialist review</h3>
        <p>No specialist assessments have been generated for this run.</p>
      </div>
    </div>;
  }

  return <div className="specialist-assessments">
    <section className="report-callout">
      <div>
        <p className="eyebrow">Evidence-bound specialist desk</p>
        <h3>{specialists.length} of 6 assessments completed</h3>
        <p>Each assessment is linked to evidence records from this run. Negative and insufficient findings remain valid decision inputs.</p>
      </div>
    </section>
    <div className="evidence-card-grid">
      {specialists.map((specialist) => {
        const decision = decisionSpecialists.get(specialist.name);
        return <article key={specialist.name}>
        <div><b>{specialistName(specialist.name)}</b><span>{specialistDirectionLabel(specialist.direction)}</span></div>
        <h3>{specialist.assessment}</h3>
        <ul>{(decision?.keyFindings ?? specialist.findings).map((finding) => <li key={finding}>{finding}</li>)}</ul>
        {decision && <dl>
          <div><dt>Confidence</dt><dd>{decision.confidence}</dd></div>
          <div><dt>Brief dimensions</dt><dd>{decision.relevantBriefDimensions.length ? decision.relevantBriefDimensions.join(", ") : "Not established"}</dd></div>
          <div><dt>Opposing evidence</dt><dd>{decision.opposingEvidenceIds.length ? <EvidenceCitations report={report} evidenceIds={decision.opposingEvidenceIds}/> : "None resolved"}</dd></div>
          <div><dt>Unresolved gaps</dt><dd>{decision.unresolvedGaps.length ? decision.unresolvedGaps.map(g => <div key={g} style={{marginBottom: '4px'}}>• {g}</div>) : "None recorded"}</dd></div>
          <div><dt>Decision implication</dt><dd>{decision.decisionImplication}</dd></div>
        </dl>}
        <small>{specialist.evidenceIds.length} linked evidence item{specialist.evidenceIds.length === 1 ? "" : "s"}</small>
      </article>;})}
    </div>
    {insights && <div className="scope-groups">
      <article><b>Target segments and jobs to be done</b>{insights.targetSegments.map((segment) => <p key={segment.name}><strong>{segment.name}:</strong> {segment.jobsToBeDone.join(" · ")}</p>)}</article>
      <article><b>Willingness to pay · {insights.willingnessToPay.strength}</b><p>{insights.willingnessToPay.finding}</p></article>
      <article><b>Market context</b><p>{insights.marketContext.summary}</p>{insights.marketContext.metrics.map((metric) => <p key={`${metric.label}-${metric.value}`}><strong>{metric.label}:</strong> {metric.value}</p>)}</article>
      <article><b>Go-to-market findings</b>{insights.gtmFindings.map((item) => <p key={item.finding}>{item.finding}</p>)}</article>
    </div>}
  </div>;
}

function EvidenceCitations({ report, evidenceIds }: { report: ReportType; evidenceIds: readonly string[] }) {
  const evidence = new Map(report.opportunity.evidence.map((item) => [item.id, item]));
  const resolved = evidenceIds.map((id) => evidence.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item?.url));
  if (!resolved.length) return <small className="citation-missing">No resolvable citation</small>;
  return <small className="claim-citations">{resolved.map((item, index) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" aria-label={`Open citation ${index + 1}: ${item.title}`}>[{index + 1}]</a>)}</small>;
}

function AdversarialView({ report }: { report: ReportType }) {
  const adversarial = report.researchExecution?.packStatuses.find((item) => item.packKey === "quick_adversarial");
  const completed = adversarial && ["completed", "completed_no_evidence"].includes(adversarial.status);
  return <div className="adversarial-report-view">
    <section><p className="eyebrow">Adversarial verdict gate</p><h3>{completed ? report.adversarialGate?.outcome ?? "Completed" : "Adversarial research incomplete"}</h3><p>{completed ? report.researchExecution?.adversarialFinding ?? report.adversarialGate?.objection : "This scan cannot claim that no contradiction exists because the adversarial research pack did not complete."}</p><EvidenceCitations report={report} evidenceIds={report.adversarialGate?.evidence_ids ?? []}/></section>
    {report.contradictions.map((item) => <section className="contradiction-card" key={item.exactClaimTested}>
      <p className="eyebrow">Proposition tested</p><h3>{item.proposition ?? item.exactClaimTested}</h3>
      <div><article><b>Supporting evidence</b><EvidenceCitations report={report} evidenceIds={item.supportingEvidenceIds}/></article><article><b>Challenging evidence</b><EvidenceCitations report={report} evidenceIds={item.challengingEvidenceIds}/></article></div>
      <p><b>Applies to:</b> {item.segmentApplicability ?? "All stated target segments"} · <b>Unresolved implication:</b> {item.unresolvedImplication ?? item.resolutionNote ?? "No unresolved implication persisted."}</p>
    </section>)}
  </div>;
}

function SourcesView({ report }: { report: ReportType }) {
  const evidence = report.opportunity.evidence;
  const groups = new Map<string, EvidenceItem[]>();
  for (const item of evidence) {
    const domain = canonicalDomainFor(item);
    groups.set(domain, [...(groups.get(domain) ?? []), item]);
  }
  const discovered = report.researchExecution?.calls.reduce((sum, call) => sum + call.sourcesDiscovered, 0);
  const accepted = evidence.filter((item) => !item.excluded).length;
  const cited = new Set(evidence.filter((item) => item.url).map((item) => item.canonicalSourceId || item.url)).size;
  const independent = new Set(evidence.filter((item) => !item.excluded).map((item) => item.independenceKey || item.canonicalSourceId || canonicalDomainFor(item))).size;
  return <div className="source-groups">
    <section className="source-counts" aria-label="Source count definitions">
      <Metric label="Sources discovered" value={discovered === undefined ? "Not persisted" : String(discovered)}/>
      <Metric label="Sources fetched" value="Not persisted"/>
      <Metric label="Evidence accepted" value={String(accepted)}/>
      <Metric label="Sources cited" value={String(cited)}/>
      <Metric label="Independent evidence groups" value={String(independent)}/>
    </section>
    {[...groups.entries()].sort((a, b) => b[1].length - a[1].length).map(([domain, items]) => <details key={domain} open={groups.size <= 4}>
      <summary><span className="source-favicon"><Globe2 size={15}/>{domain !== "Domain unavailable" && <img src={`https://${domain}/favicon.ico`} alt="" onError={(event) => { event.currentTarget.style.display = "none"; }}/>}</span><span><b>{domain}</b><small>{items.length} claim{items.length === 1 ? "" : "s"} from this domain · one source group</small></span></summary>
      <div>{items.map((item) => <article key={item.id}>
        <div><b>{item.title}</b><span>{humanLabel(item.sourceType)} · {authorityLabel(item)} · {item.excluded ? "Excluded" : "Accepted"} · {item.evidenceRole === "challenging" || item.disconfirming ? "Challenging" : "Supporting"} · Numeric check: {humanLabel(item.numericValidationState ?? "not checked")}</span></div>
        <p>{item.snippet}</p>
        <small>Factors: {item.associatedFactorIds?.length ? item.associatedFactorIds.map(humanLabel).join(", ") : "No factor link persisted"}</small>
        {meaningfulGroqDisagreement(item) && <p className="model-disagreement"><AlertTriangle size={14}/>Second-model disagreement: this evidence was interpreted differently by the two models, so it carries reduced confidence.</p>}
        {item.url ? <a href={item.url} target="_blank" rel="noreferrer">Inspect source ↗</a> : <span>Source URL unavailable</span>}
      </article>)}</div>
    </details>)}
  </div>;
}

function canonicalDomainFor(item: EvidenceItem) {
  if (item.canonicalDomain && item.canonicalDomain !== "vertexaisearch.cloud.google.com") return item.canonicalDomain.replace(/^www\./, "");
  try {
    const domain = new URL(item.url).hostname.replace(/^www\./, "");
    return domain === "vertexaisearch.cloud.google.com" ? item.source.replace(/^www\./, "") : domain;
  } catch { return item.source || "Domain unavailable"; }
}
function authorityLabel(item: EvidenceItem) {
  if (typeof item.sourceAuthority === "number") return `${Math.round(item.sourceAuthority * 100)}% authority`;
  return item.sourceTier ? `Tier ${item.sourceTier} authority` : "Authority not rated";
}
function meaningfulGroqDisagreement(item: EvidenceItem) {
  const groq = item.modelClassificationMetadata?.optionalGroqClassification as { evidenceRole?: string; semanticAlignment?: string } | null | undefined;
  if (!groq) return false;
  const role = item.evidenceRole ?? (item.disconfirming ? "challenging" : "supporting");
  const roleDisagrees = groq.evidenceRole && !["mixed", "unclear", role].includes(groq.evidenceRole);
  const relevance = String(item.modelClassificationMetadata?.relevanceClass ?? "").toLowerCase();
  const alignmentMap: Record<string, string> = { directly_relevant: "direct", contextually_relevant: "contextual", adjacent: "adjacent", out_of_scope: "unclear" };
  const relevanceDisagrees = groq.semanticAlignment && relevance && groq.semanticAlignment !== (alignmentMap[relevance] ?? relevance) && groq.semanticAlignment !== "unclear";
  return Boolean(roleDisagrees || relevanceDisagrees);
}

function ExportView({ onExport, formats }: { onExport: (format: "md" | "json" | "csv" | "pdf") => void | Promise<void>; formats: ReportType["availableExports"] }) {
  return <div className="export-panel">
    <Download size={21}/>
    <div>
      <h3>Decision-ready exports</h3>
      <p>Only exports included with this report type are shown.</p>
    </div>
    {formats.includes("markdown") && <button onClick={() => onExport("md")}><FileText size={15}/>Markdown</button>}
    {formats.includes("pdf") && <button onClick={() => onExport("pdf")}><FileSpreadsheet size={15}/>PDF</button>}
    {formats.includes("json") && <button onClick={() => onExport("json")}><FileJson size={15}/>JSON</button>}
    {formats.includes("csv") && <button onClick={() => onExport("csv")}><FileSpreadsheet size={15}/>CSV</button>}
  </div>;
}

function FinalBlock({ report }: { report: ReportType }) {
  const o = report.opportunity;
  const experiment = report.decisionProduct?.experiments[0];
  return <section className="final-verdict-block">
    <p className="eyebrow">Final recommendation</p>
    <h3>{o.scorecard.verdict}</h3>
    <div>
      <span><b>Next action: </b>{experiment ? `${experiment.name}: ${experiment.method}` : "No decision experiment was persisted."}</span>
      {report.reportMode === "full_validation" && <span><b>Build first: </b>{o.mvp.scope[0]}</span>}
      {report.reportMode === "full_validation" && <span><b>Do not build: </b>{o.mvp.exclusions[0]}</span>}
      <span><b>Decision threshold: </b>{experiment?.decisionUnlocked ?? "No decision threshold was persisted."}</span>
    </div>
  </section>;
}
