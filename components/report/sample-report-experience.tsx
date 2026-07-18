"use client";

import { useState } from "react";
import { ValidationReport } from "@/components/report/ValidationReport";
import type { ValidationReport as ValidationReportPayload } from "@/lib/report-schema";

export function SampleReportExperience({ quick, full, initialMode = "quick_scan" }: { quick: ValidationReportPayload; full: ValidationReportPayload; initialMode?: "quick_scan" | "full_validation" }) {
  const [mode, setMode] = useState<"quick_scan" | "full_validation">(initialMode);
  const report = mode === "quick_scan" ? quick : full;

  return <>
    <section className="sample-mode-switcher" aria-labelledby="sample-report-title">
      <div>
        <p className="eyebrow">Sample validation report</p>
        <h1 id="sample-report-title">See the difference in research depth</h1>
        <p>Both views validate the same appointment-assistant idea. Switch reports to see what Full Validation adds.</p>
      </div>
      <div className="sample-mode-tabs" role="tablist" aria-label="Sample report type">
        <button type="button" role="tab" aria-selected={mode === "quick_scan"} onClick={() => setMode("quick_scan")}>Quick Scan <small>Rapid screen</small></button>
        <button type="button" role="tab" aria-selected={mode === "full_validation"} onClick={() => setMode("full_validation")}>Full Validation <span>Most detailed</span><small>Complete research</small></button>
      </div>
      <p className="sample-fixture-note">Frozen sample data · not live or current market research</p>
    </section>
    <div key={mode} className="sample-report-transition">
      <ValidationReport report={report} publicMode />
    </div>
  </>;
}
