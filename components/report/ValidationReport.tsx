"use client";
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Download, FileJson, FileSpreadsheet, FileText, ListChecks, ShieldCheck, Circle, CheckCircle2 } from "lucide-react";
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

export function ValidationReport({ report, scorecard, publicMode = false, runId, chartDatasets }: { report: ReportType; scorecard?: ReportType["opportunity"]["scorecard"]; publicMode?: boolean; runId?: string; chartDatasets?: ReportChartDataset[] }) {
  const [tab, setTab] = useState<ReportTab>("Conclusion");
  const [toast, setToast] = useState("");
  const [sourcePreview, setSourcePreview] = useState<EvidenceItem | null>(null);
  const o = useMemo(() => ({ ...report.opportunity, scorecard: scorecard ?? report.opportunity.scorecard }), [report, scorecard]);
  const config = getReportModeConfig(report.reportMode);
  const tabs = REPORT_TABS[report.reportMode] as readonly ReportTab[];
  const strongestPositive = o.evidence.find((item) => item.id === report.strongestPositiveEvidenceId) ?? o.evidence.find((item) => !item.disconfirming && !item.excluded);
  const strongestNegative = o.evidence.find((item) => item.id === report.strongestNegativeEvidenceId) ?? o.evidence.find((item) => item.disconfirming && !item.excluded) ?? o.evidence.find((item) => item.signal === "Risk");
  const canonicalSourceCount = countEvidenceSources(o.evidence);
  const independentDomainCount = new Set(o.evidence.map((item) => {
    try { return new URL(item.url).hostname.replace(/^www\./, ""); } catch { return item.source; }
  }).filter(Boolean)).size;
  const primarySourceCount = o.evidence.filter((item) => !item.excluded && (item.sourceTier ?? 4) <= 2).length;
  const contradictoryEvidenceCount = o.evidence.filter((item) => !item.excluded && item.disconfirming).length;

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

  return <div className={publicMode ? "validation-report public-report premium-report" : "validation-report premium-report"}>
    {toast && <div className="report-toast sf-confirmation" role="status">{toast}</div>}

    <header className="report-engine-hero">
      <div>
        <p className="eyebrow">{publicMode ? "Sample validation report" : config.label} · {report.generatedAt}</p>
        <span className={`report-mode-badge mode-${report.reportMode}`}>{config.label}</span>
        <h2>{o.name}</h2>
        <p>{o.oneLiner}</p>
        <div className="report-header-meta">
          <span>{o.targetCustomer}</span>
          <span>{o.market}</span>
          <span>{o.pricing.model}</span>
          <span>{o.mvp.buildComplexity} complexity</span>
          <span>{o.mvp.buildEstimate} to validation</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <ScoreBadge score={o.scorecard.total} size="lg" />
          <div style={{ textAlign: 'left' }}>
            <b style={{ fontSize: 28, fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--text-primary)' }}>{o.scorecard.total}</b>
            <small style={{ display: 'block', fontSize: 10, color: 'var(--text-tertiary)', fontFamily: 'var(--mono)' }}>/100 SCORE</small>
          </div>
        </div>
        <i className={`verdict-${verdictClass}`}>{o.scorecard.verdict}</i>
      </div>
    </header>

    <section className="report-decision-strip" aria-label={`${config.label} decision summary`}>
      <article><span>Official verdict</span><b>{o.scorecard.verdict}</b></article>
      <article><span>Evidence confidence</span><b>{o.scorecard.confidence}%</b></article>
      <article><span>Sources analyzed</span><b>{canonicalSourceCount}</b></article>
      <article><span>Independent domains</span><b>{independentDomainCount}</b></article>
      {report.reportMode === "full_validation" && <><article><span>Primary / official sources</span><b>{primarySourceCount}</b></article><article><span>Contradictory evidence</span><b>{contradictoryEvidenceCount}</b></article></>}
      <article><span>{report.reportMode === "quick_scan" ? "Strongest positive signal" : "Most important opportunity"}</span><b>{strongestPositive?.title ?? "Not enough supporting evidence"}</b></article>
      <article><span>{report.reportMode === "quick_scan" ? "Strongest negative signal" : "Most important objection"}</span><b>{strongestNegative?.title ?? report.adversarialGate?.objection ?? "No independent negative signal resolved"}</b></article>
      <article className="report-recommendation"><span>Recommendation</span><b>{report.topRecommendation ?? o.launch.successMetric}</b></article>
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
          <ScoreBadge score={o.scorecard.total} size="lg" />
          <div>
            <b style={{ fontSize: 16 }}>{o.scorecard.total}<small style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>/100</small></b>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-secondary)' }}>{o.scorecard.confidence}% confidence</p>
          </div>
        </div>
        <div className="sidebar-metrics">
          <Metric label="Report date" value={report.generatedAt}/>
          <Metric label="Report type" value={config.label}/>
          <Metric label="Sources analyzed" value={String(canonicalSourceCount)}/>
          <Metric label="Evidence found" value={String(o.evidence.length)}/>
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
          {tab === "Conclusion" && <Verdict report={report}/>}
          {tab === "Evidence" && <EvidenceView report={report} onPreview={setSourcePreview}/>}
          {tab === "Demand" && <EvidenceSignalView report={report} signals={["Pain", "Demand"]}/>}
          {tab === "Competition" && <CompetitorView report={report}/>}
          {tab === "Market" && <EvidenceSignalView report={report} signals={["Demand", "Pricing"]}/>}
          {tab === "Score breakdown" && <ScoringView scorecard={o.scorecard}/>}
          {tab === "MVP scope" && <MvpView report={report}/>}
          {tab === "Pricing" && <PricingView report={report}/>}
          {tab === "Go-to-market" && <LaunchView report={report}/>}
          {tab === "Next actions" && <ChecklistView report={report}/>}
          {tab === "Risks" && <RiskView report={report}/>}
          {tab === "Adversarial" && <AdversarialView report={report}/>}
          {tab === "Sources" && <SourcesView report={report}/>}
          {tab === "Exports" && <ExportView onExport={exportFile} formats={report.availableExports}/>}
        </div>
        <FinalBlock report={report}/>
        {report.reportMode === "quick_scan" && !publicMode && <section className="quick-upgrade-card"><div><p className="eyebrow">Need a deeper answer?</p><h3>Run Full Validation using the same idea.</h3><p>Your project, buyer, geography, brief, and saved assumptions will be carried forward. Entitlement is confirmed before a new run is created.</p></div><Link className="button" href={`/research/new?mode=full_validation&upgradeFrom=${runId ?? report.id}`}>Run Full Validation</Link></section>}
      </div>
    </div>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><b>{value}</b></div>;
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
        <p><b>Validate first:</b> {o.launch.successMetric}</p>
        {!!report.narrativeCitations?.executive_summary.length && <div className="sentence-citations">
          {report.narrativeCitations.executive_summary.map((claim, index) => <p key={`${claim.text}-${index}`}>{claim.text}<EvidenceCitations report={report} evidenceIds={claim.evidence_ids}/></p>)}
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
  return <div className="competitor-table-wrap">
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
        {report.opportunity.competitors.map((c, index) => <tr className={revealUpClass} style={getStaggerDelay(index)} key={c.id}>
          <td><b>{c.name}</b></td>
          <td>{c.target}</td>
          <td>{c.pricing}</td>
          <td>{c.strength}</td>
          <td>{c.positioning}</td>
          <td>{c.gap}</td>
        </tr>)}
      </tbody>
    </table>
  </div>;
}

function ScoringView({ scorecard }: { scorecard: ReportType["opportunity"]["scorecard"] }) {
  const entries = Object.entries(scorecard.scores);
  const ordered = [...entries].sort((a, b) => b[1] - a[1]);
  return <>
    <div className="canonical-scorecard"><div><p className="eyebrow">Official deterministic score</p><h3>{scorecard.total}/100 · {scorecard.verdict}</h3><p>The displayed verdict is computed by the shared scoring engine. Narrative generation cannot override it.</p></div><ScoreBreakdown scorecard={scorecard}/></div>
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
    ...(p.targetCustomers > 0 ? [["Initial target", `${p.targetCustomers} customers`, "Persisted customer target", p.rationale]] : [])
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
        <p className="eyebrow">First 10 customers</p>
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

function EvidenceCitations({ report, evidenceIds }: { report: ReportType; evidenceIds: readonly string[] }) {
  const evidence = new Map(report.opportunity.evidence.map((item) => [item.id, item]));
  const resolved = evidenceIds.map((id) => evidence.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item?.url));
  if (!resolved.length) return <small className="citation-missing">No resolvable citation</small>;
  return <small className="claim-citations">{resolved.map((item, index) => <a key={item.id} href={item.url} target="_blank" rel="noreferrer" aria-label={`Open citation ${index + 1}: ${item.title}`}>[{index + 1}]</a>)}</small>;
}

function AdversarialView({ report }: { report: ReportType }) {
  return <div className="adversarial-report-view">
    <section><p className="eyebrow">Adversarial verdict gate</p><h3>{report.adversarialGate?.outcome ?? "Gate incomplete"}</h3><p>{report.adversarialGate?.objection ?? "No adversarial conclusion was persisted."}</p><EvidenceCitations report={report} evidenceIds={report.adversarialGate?.evidence_ids ?? []}/></section>
  </div>;
}

function SourcesView({ report }: { report: ReportType }) {
  return <div className="report-source-list">
    {report.opportunity.evidence.map((item) => <article key={item.id}><div><b>{item.source}</b><span>{item.sourceTier ? `Tier ${item.sourceTier}` : item.sourceType}</span>{item.excluded && <i>Excluded from scoring</i>}</div><p>{item.title}</p>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">Inspect source ↗</a> : <span>Source URL unavailable</span>}</article>)}
  </div>;
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
  return <section className="final-verdict-block">
    <p className="eyebrow">Final recommendation</p>
    <h3>{o.scorecard.verdict}</h3>
    <div>
      <span><b>Next action: </b>{o.launch.successMetric}</span>
      {report.reportMode === "full_validation" && <span><b>Build first: </b>{o.mvp.scope[0]}</span>}
      {report.reportMode === "full_validation" && <span><b>Do not build: </b>{o.mvp.exclusions[0]}</span>}
      <span><b>Prove before scaling: </b>{o.launch.successMetric}</span>
    </div>
  </section>;
}
