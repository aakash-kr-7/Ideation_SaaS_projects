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
        <p className="eyebrow">Enter the decision room</p>
        <h1 id="sample-report-title">See the verdict. Then audit every reason behind it.</h1>
        <p>One idea, two levels of scrutiny. Start with the fast signal or open the complete decision dossier to see how the evidence changes the next move.</p>
      </div>
      <div className="sample-mode-tabs" role="tablist" aria-label="Sample report type">
        <button type="button" role="tab" aria-selected={mode === "quick_scan"} onClick={() => setMode("quick_scan")}>Quick Scan <small>Is this worth another hour?</small></button>
        <button type="button" role="tab" aria-selected={mode === "full_validation"} onClick={() => setMode("full_validation")}>Full Validation <span>Complete case</span><small>What should we commit to?</small></button>
      </div>
      <p className="sample-fixture-note">Frozen sample data · Every conclusion remains traceable to its evidence</p>
    </section>
    <div key={mode} className="sample-report-transition">
      <ValidationReport report={report} publicMode />
    </div>
  </>;
}
