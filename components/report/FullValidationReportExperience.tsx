"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, ExternalLink, RotateCcw, ShieldAlert } from "lucide-react";
import type { ValidationReport } from "@/lib/report-schema";
import type { ReportChartDataset } from "./ReportCharts";
import { ReportCharts } from "./ReportCharts";
import { downloadExport, reportToCsv, reportToMarkdown } from "@/lib/report-export";

type Props = { report: ValidationReport; scorecard?: ValidationReport["opportunity"]["scorecard"]; publicMode?: boolean; runId?: string; chartDatasets?: ReportChartDataset[] };
type Decision = {
  factorAnalysis?: Array<{ criterion: string; rawScore: number; effectiveScore: number; evidenceCoefficient: number; evidenceState: string; supportingEvidenceIds: string[]; challengingEvidenceIds: string[]; buyerSegmentApplicability: string[]; unresolvedAssumptions: string[]; scoreSensitivity: { lower: number; current: number; upper: number; explanation: string } }>;
  segmentRankings?: Array<{ segment: string; score: number; evidenceStrength: number; independentEvidenceGroups: number; metrics: Record<string, number>; evidenceIds: string[]; rankReason: string }>;
  recommendedSegment?: string | null;
  alternativeMap?: Array<{ id: string; name: string; classification: string; verified: boolean; targetSegment: string | null; positioning: string | null; verifiedPricing: string | null; strengths: string[]; recurringComplaints: string[]; switchingImplications: string[]; differentiationGap: string | null; evidenceIds: string[] }>;
  economicsScenarios?: Array<{ name: string; price: number | null; currency: string | null; customersRequired: number | null; acquisitionCost: number | null; grossMarginRange: [number, number] | null; breakEvenCustomers: number | null; supportBurden: string; assumptions: string[]; evidenceSourceIds: string[] }>;
  adversarialGate?: { verdict: string; lowered: boolean; blocked: boolean; checks: Record<string, string>; reasons: string[] };
  verdictStructure?: { verdict: string; score: number; scoreRange: string; evidenceConfidence: string; strongestSupportingEvidenceId: string | null; strongestChallengingEvidenceId: string | null; strongestAssumption: string; recommendedTargetSegment: string | null; recommendedProductWedge: string | null; upgradeCondition: string; downgradeCondition: string; killCondition: string };
  founderActionPlan?: { highestValueHypothesis: string; targetBuyer: string; recruitmentChannel: string; sampleSize: number; testMethod: string; durationDays: number; successThreshold: string; failureThreshold: string; maximumBudget: { amount: number; currency: string; assumption: boolean }; decisionUnlocked: string; days: Array<{ days: string; priority: number; action: string }> };
};

const packLabels: Record<string, string> = {
  buyer_problem: "Buyer, frequency and severity", alternatives_competitors: "Alternatives and positioning", pricing_wtp: "Pricing and willingness to pay",
  reachability_acquisition: "Reachability and acquisition", feasibility_operations: "Product and operational feasibility", adversarial_failure: "Adversarial evidence",
  regulatory_legal: "Regulatory or legal", technical_feasibility: "Technical feasibility", marketplace_liquidity: "Marketplace liquidity",
  geographic_differences: "Geographic differences", segment_disagreement: "Segment disagreement", source_concentration: "Source concentration repair",
  contradiction_repair: "Contradiction repair", coverage_repair: "Coverage repair",
};
const statusLabels: Record<string, string> = { completed: "Completed", completed_no_evidence: "Completed with no accepted evidence", provider_failed: "Unavailable", unavailable: "Unavailable", quota_blocked: "Quota blocked", timed_out: "Timed out", skipped: "Not required" };
const human = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const domain = (url: string, fallback: string) => { try { const host = new URL(url).hostname.replace(/^www\./, ""); return host === "vertexaisearch.cloud.google.com" ? fallback.replace(/^www\./, "") : host; } catch { return fallback || "Domain unavailable"; } };

export function FullValidationReportExperience({ report, scorecard, publicMode = false, runId, chartDatasets }: Props) {
  const [toast, setToast] = useState("");
  const decision = report.fullValidationDecision as Decision;
  const o = { ...report.opportunity, scorecard: scorecard ?? report.opportunity.scorecard };
  const verdict = decision.verdictStructure;
  const evidenceById = new Map(o.evidence.map((item) => [item.id, item]));
  const reason = (id: string | null | undefined) => id ? evidenceById.get(id) : undefined;
  const support = reason(verdict?.strongestSupportingEvidenceId);
  const challenge = reason(verdict?.strongestChallengingEvidenceId);
  const exportFile = async (format: "md" | "json" | "csv" | "pdf") => {
    const payload = { ...report, opportunity: o };
    if (!publicMode && runId) {
      const response = await fetch(`/api/research/${runId}/export`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ format }) });
      if (!response.ok) { setToast("This immutable export is unavailable."); return; }
      const blob = await response.blob(); const disposition = response.headers.get("Content-Disposition") ?? "";
      downloadExport(disposition.match(/filename="([^"]+)"/)?.[1] ?? `${o.name}-report.${format}`, blob, blob.type);
    } else if (format === "pdf") window.print();
    else if (format === "md") downloadExport(`${o.name}-report.md`, reportToMarkdown(payload), "text/markdown");
    else if (format === "json") downloadExport(`${o.name}-report.json`, JSON.stringify(payload, null, 2), "application/json");
    else downloadExport(`${o.name}-report.csv`, reportToCsv(payload), "text/csv");
    setToast(`${format.toUpperCase()} export prepared from report version ${report.version}.`);
  };
  const packs = report.researchExecution?.packStatuses ?? [];
  const section = (id: string, eyebrow: string, title: string, body: React.ReactNode) => <section id={id} className="fv-section"><header><span>{eyebrow}</span><h2>{title}</h2></header>{body}</section>;
  const citations = (ids: readonly string[]) => {
    const grouped = new Map<string, typeof o.evidence>();
    ids.map(id => evidenceById.get(id)).filter(Boolean).forEach(item => { const e = item!; const key = e.canonicalDomain || domain(e.url, e.source); grouped.set(key, [...(grouped.get(key) ?? []), e]); });
    return grouped.size ? <div className="fv-citations">{[...grouped].map(([key, items]) => <span key={key}><b>{key}</b>{items.map((e, i) => <a key={e.id} href={e.url} target="_blank" rel="noreferrer" aria-label={`Open ${e.title}`}>{i + 1}<ExternalLink size={10}/></a>)}</span>)}</div> : <small>No accepted citation linked.</small>;
  };
  const conclusion = (title: string, ids: string[], assumptions: string[] = [], segments: string[] = []) => <article className="fv-conclusion"><div><span>{title}</span><b>{ids.length ? "Evidence linked" : "Unresolved"}</b></div>{citations(ids)}{!!assumptions.length && <p><strong>Assumptions:</strong> {assumptions.join(" ")}</p>}{!!segments.length && <p><strong>Applies to:</strong> {segments.join(", ")}</p>}</article>;

  return <main className="validation-report full-validation-report">
    {toast && <div className="report-toast" role="status">{toast}</div>}
    <header className="fv-decision-hero">
      <div><p className="eyebrow">Full Validation · immutable report {report.version}</p><h1>{o.name}</h1><p>{o.oneLiner}</p><div className="fv-verdict"><strong>{verdict?.verdict ?? o.scorecard.verdict}</strong><span>{verdict?.scoreRange ?? o.scorecard.scoreBand?.display ?? `${o.scorecard.total}/100`}</span><span>Evidence Confidence: {verdict?.evidenceConfidence ?? report.evidenceSufficiency?.overallEvidenceConfidence ?? "Not persisted"}</span></div></div>
      <dl><div><dt>Recommended buyer</dt><dd>{verdict?.recommendedTargetSegment ?? "Not supported yet"}</dd></div><div><dt>Product wedge</dt><dd>{verdict?.recommendedProductWedge ?? "Not supported yet"}</dd></div><div><dt>Strongest reason to build</dt><dd>{support?.snippet ?? "No accepted supporting evidence resolved."}</dd></div><div><dt>Strongest reason not to build</dt><dd>{challenge?.snippet ?? "No accepted challenging evidence resolved."}</dd></div></dl>
      <div className="fv-conditions"><article><CheckCircle2/><span>Upgrade</span><p>{verdict?.upgradeCondition}</p></article><article><AlertTriangle/><span>Downgrade</span><p>{verdict?.downgradeCondition}</p></article><article><ShieldAlert/><span>Kill</span><p>{verdict?.killCondition}</p></article></div>
    </header>
    <nav className="fv-nav" aria-label="Report sections">{["Executive decision","Evidence Sufficiency","Recommended buyer and wedge","Problem and behavioural demand","Alternatives and competition","Pricing and willingness to pay","Buyer reachability and acquisition","Product and operational feasibility","Risks and adversarial findings","Scenario economics","Twelve-factor analysis","Validation plan","Evidence ledger and methodology"].map((label, i) => <a key={label} href={`#fv-${i+1}`}>{i+1}. {label}</a>)}</nav>

    {section("fv-1","01 · Decision","Executive decision", <><p className="fv-lead">{report.executiveSummary}</p><div className="fv-gate">{Object.entries(decision.adversarialGate?.checks ?? {}).map(([key,value]) => <span key={key} data-state={value}>{human(key)}: {human(value)}</span>)}</div></>)}
    {section("fv-2","02 · Coverage","Evidence Sufficiency", <><div className="fv-metrics"><b>{report.evidenceSufficiency?.acceptedEvidenceCount ?? 0}<span>Accepted findings</span></b><b>{report.evidenceSufficiency?.independentEvidenceGroups ?? 0}<span>Independent groups</span></b><b>{report.evidenceSufficiency?.primaryDirectEvidenceCount ?? 0}<span>Direct or official</span></b><b>{Math.round((report.evidenceSufficiency?.sourceConcentration ?? 0)*100)}%<span>Source concentration</span></b></div><div className="fv-pack-grid">{packs.map(pack => { const unavailable = ["provider_failed","unavailable","quota_blocked","timed_out"].includes(pack.status ?? ""); return <article key={pack.packKey} data-state={pack.status}><span>{packLabels[pack.packKey ?? ""] ?? human(pack.packKey ?? "Research pack")}</span><b>{statusLabels[pack.status ?? ""] ?? human(pack.status ?? "Not required")}</b><small>{pack.acceptedEvidenceCount ?? 0} accepted</small>{unavailable && <button onClick={() => location.reload()}><RotateCcw size={13}/>Retry research</button>}</article>})}</div></>)}
    {section("fv-3","03 · Focus","Recommended buyer and wedge", <><div className="fv-segments">{decision.segmentRankings?.map((s,i) => <article key={s.segment}><span>#{i+1}</span><h3>{s.segment}</h3><b>{s.score.toFixed(1)}</b><p>{s.rankReason}</p><small>{s.independentEvidenceGroups} independent groups · {Math.round(s.evidenceStrength*100)}% evidence strength</small></article>)}</div>{conclusion("Recommended wedge", verdict?.strongestSupportingEvidenceId ? [verdict.strongestSupportingEvidenceId] : [], [verdict?.strongestAssumption ?? ""].filter(Boolean), verdict?.recommendedTargetSegment ? [verdict.recommendedTargetSegment] : [])}</>)}
    {section("fv-4","04 · Demand","Problem and behavioural demand", <div className="fv-evidence-list">{o.evidence.filter(e => ["Pain","Demand"].includes(e.signal) && !e.excluded).map(e => <EvidenceCard key={e.id} evidence={e}/>)}</div>)}
    {section("fv-5","05 · Landscape","Alternatives and competition", <div className="fv-table-wrap"><table><thead><tr><th>Alternative</th><th>Class</th><th>Verification</th><th>Positioning</th><th>Pricing</th><th>Possible gap</th></tr></thead><tbody>{decision.alternativeMap?.map(a => <tr key={a.id}><th>{a.name}</th><td>{human(a.classification)}</td><td>{a.verified ? "Live verified" : "Unverified seed"}</td><td>{a.verified ? a.positioning ?? "Not found" : "Not presented as live"}</td><td>{a.verifiedPricing ?? "Not verified"}</td><td>{a.differentiationGap ?? "No evidence-backed gap"}</td></tr>)}</tbody></table></div>)}
    {section("fv-6","06 · Commercial","Pricing and willingness to pay", <><p className="fv-lead">{report.fullValidationInsights?.willingnessToPay.finding ?? "No willingness-to-pay finding was persisted."}</p><div className="fv-evidence-list">{o.evidence.filter(e => e.signal === "Pricing" && !e.excluded).map(e => <EvidenceCard key={e.id} evidence={e}/>)}</div></>)}
    {section("fv-7","07 · Distribution","Buyer reachability and acquisition", conclusion("Reachability conclusion", o.evidence.filter(e => e.evidenceTopic === "gtm" && !e.excluded).map(e => e.id), [], verdict?.recommendedTargetSegment ? [verdict.recommendedTargetSegment] : []))}
    {section("fv-8","08 · Delivery","Product and operational feasibility", <><p className="fv-lead">{o.mvp.outcome}</p><div className="fv-columns"><article><h3>Build first</h3><ul>{o.mvp.scope.map(x=><li key={x}>{x}</li>)}</ul></article><article><h3>Do not build yet</h3><ul>{o.mvp.exclusions.map(x=><li key={x}>{x}</li>)}</ul></article></div></>)}
    {section("fv-9","09 · Challenge","Risks and adversarial findings", <><div className="fv-risk-grid">{o.risks.map(r => <article key={r.id} data-severity={r.severity}><span>{r.severity} · {r.category}</span><h3>{r.description}</h3><p>{r.mitigation}</p></article>)}</div>{decision.adversarialGate?.reasons.map(x=><p key={x} className="fv-warning">{human(x)}</p>)}</>)}
    {section("fv-10","10 · Economics","Scenario economics", <div className="fv-scenarios">{decision.economicsScenarios?.map(s => <article key={s.name}><span>{human(s.name)}</span><h3>{s.price == null ? "Price unresolved" : `${s.currency ?? ""} ${s.price}`}</h3><dl><div><dt>Customers required</dt><dd>{s.customersRequired ?? "Unresolved"}</dd></div><div><dt>Acquisition cost</dt><dd>{s.acquisitionCost ?? "Unresolved"}</dd></div><div><dt>Gross margin</dt><dd>{s.grossMarginRange ? `${s.grossMarginRange[0]}–${s.grossMarginRange[1]}%` : "Unresolved"}</dd></div><div><dt>Break-even customers</dt><dd>{s.breakEvenCustomers ?? "Unresolved"}</dd></div><div><dt>Support burden</dt><dd>{human(s.supportBurden)}</dd></div></dl><small>{s.assumptions.join(" ")}</small></article>)}</div>)}
    {section("fv-11","11 · Factors","Twelve-factor analysis", <><ReportCharts report={report} datasets={chartDatasets}/><div className="fv-factor-list">{decision.factorAnalysis?.map(f => <article key={f.criterion}><header><h3>{human(f.criterion)}</h3><span data-state={f.evidenceState}>{human(f.evidenceState)}</span><b>{f.effectiveScore}</b></header><div className="fv-range" aria-label={`${human(f.criterion)} score range ${f.scoreSensitivity.lower} to ${f.scoreSensitivity.upper}, current ${f.scoreSensitivity.current}`}><i style={{left:`${f.scoreSensitivity.lower}%`,width:`${f.scoreSensitivity.upper-f.scoreSensitivity.lower}%`}}/><b style={{left:`${f.scoreSensitivity.current}%`}}/></div><p>Raw {f.rawScore} · confidence {Math.round(f.evidenceCoefficient*100)}% · range {f.scoreSensitivity.lower}–{f.scoreSensitivity.upper}</p>{conclusion("Factor evidence", [...f.supportingEvidenceIds,...f.challengingEvidenceIds], f.unresolvedAssumptions, f.buyerSegmentApplicability)}</article>)}</div></>)}
    {section("fv-12","12 · Next 30 days","Validation plan", decision.founderActionPlan ? <><div className="fv-plan-summary"><h3>{decision.founderActionPlan.highestValueHypothesis}</h3><p><b>Target:</b> {decision.founderActionPlan.targetBuyer} · <b>Recruit via:</b> {decision.founderActionPlan.recruitmentChannel}</p><p><b>Maximum budget:</b> {decision.founderActionPlan.maximumBudget.currency} {decision.founderActionPlan.maximumBudget.amount}{decision.founderActionPlan.maximumBudget.assumption ? " (assumption)" : ""}</p></div><ol className="fv-timeline">{decision.founderActionPlan.days.map((d,i) => <li key={d.days}><span>Week {Math.min(4,Math.floor(i*4/5)+1)} · days {d.days}</span><p>{d.action}</p><dl><div><dt>Sample</dt><dd>{decision.founderActionPlan?.sampleSize}</dd></div><div><dt>Success</dt><dd>{decision.founderActionPlan?.successThreshold}</dd></div><div><dt>Failure</dt><dd>{decision.founderActionPlan?.failureThreshold}</dd></div><div><dt>Decision</dt><dd>{decision.founderActionPlan?.decisionUnlocked}</dd></div></dl></li>)}</ol></> : <p>No action plan persisted.</p>)}
    {section("fv-13","13 · Audit trail","Evidence ledger and methodology", <><p className="fv-lead">{report.methodology}</p><div className="fv-ledger">{[...new Set(o.evidence.map(e => e.canonicalDomain || domain(e.url,e.source)))].map(d => { const items=o.evidence.filter(e => (e.canonicalDomain || domain(e.url,e.source))===d); const groups=new Set(items.map(e=>e.independenceKey || e.canonicalSourceId || e.url)); return <details key={d}><summary><b>{d}</b><span>{items.length} citations · {groups.size} independent group{groups.size===1?"":"s"}</span></summary>{items.map(e=><EvidenceCard key={e.id} evidence={e}/>)}</details>})}</div></>)}
    <footer className="fv-export"><div><h2>Immutable report exports</h2><p>Every format is generated from report version {report.version} and the same frozen payload.</p></div>{(["pdf","md","json","csv"] as const).map(f=><button key={f} onClick={()=>exportFile(f)}><Download size={14}/>{f.toUpperCase()}</button>)}</footer>
  </main>;
}

function EvidenceCard({ evidence: e }: { evidence: ValidationReport["opportunity"]["evidence"][number] }) {
  const kind = e.sourceTier && e.sourceTier <= 2 ? "Official / primary" : e.sourceType;
  return <article className="fv-evidence-card"><div><span>{e.evidenceRole === "challenging" || e.disconfirming ? "Challenging" : "Supporting"}</span><b>{e.strength} confidence</b></div><h3>{e.title}</h3><p>{e.snippet}</p><small>{kind} · {e.sourceFamily ?? "Unclassified family"} · {e.independenceKey ? "Independent group tracked" : "Independence unresolved"} · {e.acceptanceDecision === "accepted_core" || !e.acceptanceDecision ? "Accepted" : human(e.acceptanceDecision)}</small>{e.url && <a href={e.url} target="_blank" rel="noreferrer">{e.canonicalDomain || domain(e.url,e.source)} <ExternalLink size={11}/></a>}</article>;
}
