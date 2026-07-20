"use client";
import { useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { ValidationReport } from "@/lib/report-schema";
import { countEvidenceSources, hasMixedResearchDepth } from "@/lib/report-mode-ui";

export function CompareMatrix({ allReports }: { allReports: ValidationReport[] }) {
  const [selected, setSelected] = useState<string[]>(() => {
    return allReports.slice(0, 3).map(r => r.opportunity.id);
  });

  const reports = useMemo(() => allReports.filter(r => selected.includes(r.opportunity.id)), [selected, allReports]);
  const mixedDepth = hasMixedResearchDepth(reports);
  
  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : s.length < 4 ? [...s, id] : s);
  
  const metric = (key: "painSeverity" | "willingnessToPay" | "distributionClarity" | "retentionPotential" | "platformDependencyRisk" | "regulatoryRisk") => 
    (r: ValidationReport) => r.opportunity.scorecard.scores[key];

  return <section className="compare-engine">
    <div className="compare-library-note">
      <b>Compare your ideas side by side</b>
      <span>Select up to 4 ideas. Canonical score factors are comparable; report depth and evidence coverage may differ.</span>
    </div>
    {mixedDepth && <div className="comparison-depth-warning" role="note"><b>Different research depth</b><span>This comparison includes a Quick Scan and a Full Validation. Missing detail in a Quick Scan reflects its narrower evidence scope, not negative evidence.</span></div>}
    
    <div className="compare-picker">
      {allReports.map(r => {
        const active = selected.includes(r.opportunity.id);
        return <button key={r.opportunity.id} className={active ? "selected" : ""} onClick={() => toggle(r.opportunity.id)}>
          {active ? <Check size={14} /> : <Plus size={14} />} {r.opportunity.name}
        </button>
      })}
    </div>
    
    <div className="matrix-wrap">
      <table className="engine-matrix expanded-matrix">
        <thead>
          <tr>
            <th>Criteria</th>
            {reports.map(r => <th key={r.opportunity.id}>
              <span className={`report-mode-badge ${r.reportMode}`}>{r.reportMode === "quick_scan" ? "Quick Scan" : "Full Validation"}</span>
              <b>{r.opportunity.name}</b>
              <small>{r.opportunity.targetCustomer}</small>
              <button onClick={() => toggle(r.opportunity.id)} aria-label={`Remove ${r.opportunity.name}`}>
                <X size={13} />
              </button>
            </th>)}
          </tr>
        </thead>
        <tbody>
          <Row label="Overall score" reports={reports} value={r => `${r.opportunity.scorecard.total} / 100`} />
          <Row label="Verdict" reports={reports} value={r => r.opportunity.scorecard.verdict} />
          <Row label="Buyer pain severity" reports={reports} value={r => metric("painSeverity")(r)} />
          <Row label="Willingness to pay" reports={reports} value={r => metric("willingnessToPay")(r)} />
          <Row label="Build complexity" reports={reports} value={r => r.opportunity.mvp.buildComplexity} />
          <Row label="Distribution clarity" reports={reports} value={r => metric("distributionClarity")(r)} />
          <Row label="Retention potential" reports={reports} value={r => metric("retentionPotential")(r)} />
          <Row label="Platform risk" reports={reports} value={r => `${metric("platformDependencyRisk")(r)} risk`} />
          <Row label="Regulatory risk" reports={reports} value={r => `${metric("regulatoryRisk")(r)} risk`} />
          <Row label="Pricing direction" reports={reports} value={r => r.opportunity.pricing.pricePoint} />
          <Row label="Evidence confidence" reports={reports} value={r => `${r.opportunity.scorecard.confidence}%`} />
          <Row label="Distinct cited sources" reports={reports} value={r => countEvidenceSources(r.opportunity.evidence)} />
          <Row label="First validation step" reports={reports} value={r => r.opportunity.launch.validationExperiment?.[0] ?? r.opportunity.launch.successMetric} />
        </tbody>
      </table>
    </div>
  </section>;
}

function Row({ label, reports, value }: { label: string; reports: ValidationReport[]; value: (report: ValidationReport) => string | number }) {
  return <tr>
    <td>{label}</td>
    {reports.map(r => <td key={r.opportunity.id}>{value(r)}</td>)}
  </tr>;
}
