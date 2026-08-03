"use client";

import { useMemo, useState, type ReactNode } from "react";
import type { ValidationReport } from "@/lib/report-schema";
import { countEvidenceSources, hasMixedResearchDepth } from "@/lib/report-mode-ui";
import { Button } from "@/components/ui/button";
import { ScoreDisplay } from "@/components/ui/score-display";
import { ScrollReveal } from "@/components/ui/scroll-reveal";
import { VerdictBadge } from "@/components/ui/verdict-badge";

export function CompareMatrix({ allReports }: { allReports: ValidationReport[] }) {
  const [selected, setSelected] = useState<string[]>(() => allReports.slice(0, 3).map((report) => report.opportunity.id));
  const reports = useMemo(() => allReports.filter((report) => selected.includes(report.opportunity.id)), [selected, allReports]);
  const mixedDepth = hasMixedResearchDepth(reports);

  function toggle(id: string) {
    setSelected((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length < 4 ? [...current, id] : current);
  }

  const metric = (key: "painSeverity" | "willingnessToPay" | "distributionClarity" | "retentionPotential" | "platformDependencyRisk" | "regulatoryRisk") =>
    (report: ValidationReport) => report.opportunity.scorecard.scores[key];

  return (
    <section className="mx-auto grid w-full max-w-screen-2xl gap-sb-6" aria-labelledby="compare-title">
      <ScrollReveal className="grid gap-sb-6" sessionKey="compare-supporting-copy-v1">
      <header className="max-w-3xl">
        <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Portfolio comparison</p>
        <h1 data-scroll-reveal-text id="compare-title" className="mb-0 mt-sb-1 font-sb-display text-3xl font-[480] tracking-[-0.02em]">Hold every idea against the same rows</h1>
        <p data-scroll-reveal-text className="mb-0 mt-sb-2 text-sm leading-relaxed text-sb-text-secondary">Select up to four reports. Cells stay neutral so verdict labels, scores, and the underlying values remain the comparison.</p>
      </header>

      <div data-scroll-reveal-item className="flex flex-wrap gap-sb-2" role="group" aria-label="Choose reports to compare">
        {allReports.map((report) => {
          const active = selected.includes(report.opportunity.id);
          const disabled = !active && selected.length >= 4;
          return (
            <Button
              variant={active ? "secondary" : "ghost"}
              className="min-h-9 px-sb-3 text-xs"
              key={report.opportunity.id}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => toggle(report.opportunity.id)}
            >
              {active ? "Selected" : "Add"} · {report.opportunity.name}
            </Button>
          );
        })}
      </div>

      {mixedDepth && (
        <p data-scroll-reveal-item className="m-0 rounded-sb-md border border-dashed border-sb-border-hairline-strong p-sb-3 text-sm leading-relaxed text-sb-text-secondary" role="note">
          This table includes different research depths. Missing Full Validation detail in a Quick Scan reflects narrower research scope, not negative evidence.
        </p>
      )}
      </ScrollReveal>

      <ScrollReveal
        sessionKey="compare-matrix-rows-v1"
        splitSelector={false}
        itemSelector="tbody > tr"
        durationMs={180}
        stepMs={35}
        maxItems={16}
        blurPx={0}
        start="top 86%"
      >
      <div className="overflow-x-auto border-y border-sb-border-hairline">
        <table className="w-full min-w-max border-collapse text-left text-sm">
          <caption className="sr-only">Comparison of selected ShouldBuild validation reports</caption>
          <thead>
            <tr className="border-b border-sb-border-hairline">
              <th className="w-52 border-r border-sb-border-hairline bg-sb-accent-muted px-sb-3 py-sb-3 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary" scope="col">ShouldBuild criterion</th>
              {reports.map((report) => (
                <th className="min-w-64 border-r border-sb-border-hairline px-sb-3 py-sb-3 align-top last:border-r-0" key={report.opportunity.id} scope="col">
                  <div className="grid gap-sb-2">
                    <span className="font-sb-mono text-xs uppercase tracking-[0.02em] text-sb-text-tertiary">{report.reportMode === "quick_scan" ? "Quick Scan" : "Full Validation"}</span>
                    <b className="font-sb-body text-sm font-medium text-sb-text-primary">{report.opportunity.name}</b>
                    <small className="font-normal leading-relaxed text-sb-text-secondary">{report.opportunity.targetCustomer}</small>
                    <Button variant="ghost" className="min-h-8 w-fit px-sb-2 text-xs" onClick={() => toggle(report.opportunity.id)} aria-label={`Remove ${report.opportunity.name}`}>Remove</Button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Overall score" reports={reports} value={(report) => <ScoreDisplay score={report.opportunity.scorecard.total} size="sm" showMax animate={false}/>}/>
            <Row label="Verdict" reports={reports} value={(report) => <VerdictBadge verdict={report.opportunity.scorecard.verdict}/>}/>
            <Row label="Buyer pain severity" reports={reports} value={metric("painSeverity")}/>
            <Row label="Willingness to pay" reports={reports} value={metric("willingnessToPay")}/>
            <Row label="Build complexity" reports={reports} value={(report) => report.opportunity.mvp.buildComplexity ?? "Unavailable"}/>
            <Row label="Distribution clarity" reports={reports} value={metric("distributionClarity")}/>
            <Row label="Retention potential" reports={reports} value={metric("retentionPotential")}/>
            <Row label="Platform risk" reports={reports} value={(report) => `${metric("platformDependencyRisk")(report)} risk`}/>
            <Row label="Regulatory risk" reports={reports} value={(report) => `${metric("regulatoryRisk")(report)} risk`}/>
            <Row label="Pricing direction" reports={reports} value={(report) => report.opportunity.pricing.pricePoint}/>
            <Row label="Evidence states" reports={reports} value={evidenceStateSummary}/>
            <Row label="Evidence confidence" reports={reports} value={evidenceConfidenceSummary}/>
            <Row label="Distinct cited sources" reports={reports} value={(report) => countEvidenceSources(report.opportunity.evidence)}/>
            <Row label="First validation step" reports={reports} value={(report) => report.opportunity.launch.validationExperiment?.[0] ?? report.opportunity.launch.successMetric}/>
          </tbody>
        </table>
      </div>
      </ScrollReveal>

      {!reports.length && <p className="m-0 text-sm text-sb-text-secondary">No reports are selected. Add at least one report to restore the table.</p>}
    </section>
  );
}

function evidenceStateSummary(report: ValidationReport) {
  const factors = Object.values(report.opportunity.scorecard.factorEvidence ?? {});
  const evidenced = factors.filter((factor) => factor?.evidenceState === "EVIDENCED").length;
  const suggestive = factors.filter((factor) => factor?.evidenceState === "SUGGESTIVE").length;
  const assumed = factors.filter((factor) => factor?.evidenceState === "ASSUMED").length;
  return <span className="font-sb-mono text-xs tabular-nums">{evidenced} E · {suggestive} S · {assumed} A</span>;
}

function evidenceConfidenceSummary(report: ValidationReport) {
  const band = report.evidenceSufficiency?.overallEvidenceConfidence
    ?? report.opportunity.scorecard.scoreBand?.label
    ?? "Legacy confidence metadata";
  const assumed = Object.values(report.opportunity.scorecard.factorEvidence ?? {}).filter((factor) => factor?.evidenceState === "ASSUMED").length;
  return <span>{band}<small className="mt-sb-1 block text-xs text-sb-text-tertiary">{assumed} assumed factor{assumed === 1 ? "" : "s"}</small></span>;
}

function Row({ label, reports, value }: { label: string; reports: ValidationReport[]; value: (report: ValidationReport) => ReactNode }) {
  return (
    <tr className="border-b border-sb-border-hairline last:border-b-0">
      <th className="border-r border-sb-border-hairline bg-sb-accent-muted px-sb-3 py-sb-3 align-top text-xs font-medium text-sb-text-secondary" scope="row">{label}</th>
      {reports.map((report) => <td className="border-r border-sb-border-hairline px-sb-3 py-sb-3 align-top text-sm leading-relaxed text-sb-text-secondary last:border-r-0" key={report.opportunity.id}>{value(report)}</td>)}
    </tr>
  );
}
