"use client";
import { useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { ValidationReport } from "@/lib/report-schema";

export function CompareMatrix({ allReports }: { allReports: ValidationReport[] }) {
  const [selected, setSelected] = useState<string[]>(() => {
    // Select first 3 reports by default
    return allReports.slice(0, 3).map(r => r.opportunity.id);
  });

  const reports = useMemo(() => allReports.filter(r => selected.includes(r.opportunity.id)), [selected, allReports]);
  
  const toggle = (id: string) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : s.length < 4 ? [...s, id] : s);
  
  const metric = (key: "painSeverity" | "willingnessToPay" | "distributionClarity" | "retentionPotential" | "platformDependencyRisk" | "regulatoryRisk") => 
    (r: ValidationReport) => r.opportunity.scorecard.scores[key];

  return <section className="compare-engine">
    <div className="compare-library-note">
      <b>Opportunity decision deck</b>
      <span>Compare dynamic investigations alongside standard framework benchmarks.</span>
    </div>
    
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
            <th>Decision factor</th>
            {reports.map(r => <th key={r.opportunity.id}>
              <b>{r.opportunity.name}</b>
              <small>{r.opportunity.targetCustomer}</small>
              <button onClick={() => toggle(r.opportunity.id)} aria-label={`Remove ${r.opportunity.name}`}>
                <X size={13} />
              </button>
            </th>)}
          </tr>
        </thead>
        <tbody>
          <Row label="Final score" reports={reports} value={r => `${r.opportunity.scorecard.total} / 100`} />
          <Row label="Verdict" reports={reports} value={r => r.opportunity.scorecard.verdict} />
          <Row label="Pain severity" reports={reports} value={r => metric("painSeverity")(r)} />
          <Row label="Willingness to pay" reports={reports} value={r => metric("willingnessToPay")(r)} />
          <Row label="Build complexity" reports={reports} value={r => r.opportunity.mvp.buildComplexity} />
          <Row label="Distribution ease" reports={reports} value={r => metric("distributionClarity")(r)} />
          <Row label="Retention potential" reports={reports} value={r => metric("retentionPotential")(r)} />
          <Row label="Platform risk" reports={reports} value={r => `${metric("platformDependencyRisk")(r)} risk`} />
          <Row label="Regulatory risk" reports={reports} value={r => `${metric("regulatoryRisk")(r)} risk`} />
          <Row label="Path to $500 MRR" reports={reports} value={r => {
            const p = r.opportunity.pricing;
            let val = 79;
            const match = p.pricePoint.match(/\d+/);
            if (match) val = Number(match[0]);
            return `${Math.ceil(500/val)} Starter customers`;
          }} />
          <Row label="Path to $3,000 MRR" reports={reports} value={r => {
            const p = r.opportunity.pricing;
            let val = 79;
            const match = p.pricePoint.match(/\d+/);
            if (match) val = Number(match[0]);
            return `${Math.ceil(3000/(val*2))} Pro customers`;
          }} />
          <Row label="First validation experiment" reports={reports} value={r => r.opportunity.launch.validationExperiment?.[0] ?? r.opportunity.launch.successMetric} />
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

