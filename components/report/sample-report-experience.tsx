"use client";

import { useState } from "react";
import { ValidationReport } from "@/components/report/ValidationReport";
import type { ValidationReport as ValidationReportPayload } from "@/lib/report-schema";
import { Button } from "@/components/ui/button";

export function SampleReportExperience({
  quick,
  full,
  initialMode = "quick_scan",
}: {
  quick: ValidationReportPayload;
  full: ValidationReportPayload;
  initialMode?: "quick_scan" | "full_validation";
}) {
  const [mode, setMode] = useState<"quick_scan" | "full_validation">(initialMode);
  const report = mode === "quick_scan" ? quick : full;

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-sb-8 px-sb-5 py-sb-10 sm:px-sb-8 sm:py-sb-12">
      <section className="grid gap-sb-5 border-b border-sb-border-hairline pb-sb-6" aria-labelledby="sample-report-title">
        <div className="max-w-3xl">
          <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Frozen fixture · real renderer</p>
          <h1 id="sample-report-title" className="mb-0 mt-sb-1 font-sb-display text-3xl font-[480] tracking-[-0.02em] sm:text-4xl">Audit the same report component customers receive</h1>
          <p className="mb-0 mt-sb-3 text-sm leading-relaxed text-sb-text-secondary">Switch research depth to see how the real product progressively discloses its verdict, evidence, adversarial case, and next action.</p>
        </div>

        <div className="flex flex-wrap gap-sb-2" role="tablist" aria-label="Sample report depth">
          <Button variant={mode === "quick_scan" ? "secondary" : "ghost"} role="tab" aria-selected={mode === "quick_scan"} onClick={() => setMode("quick_scan")}>
            Quick Scan · gut check
          </Button>
          <Button variant={mode === "full_validation" ? "secondary" : "ghost"} role="tab" aria-selected={mode === "full_validation"} onClick={() => setMode("full_validation")}>
            Full Validation · decision dossier
          </Button>
        </div>

        <p className="m-0 text-xs leading-relaxed text-sb-text-tertiary">Sample data is frozen and explicitly fixture-backed. Missing commercial or external facts remain marked unresolved in the report.</p>
      </section>

      <div key={mode} role="tabpanel" aria-label={`${mode === "quick_scan" ? "Quick Scan" : "Full Validation"} sample report`}>
        {/* This is the production report renderer in public/read-only mode. Do not fork it into a sample-only mock. */}
        <ValidationReport report={report} publicMode/>
      </div>
    </div>
  );
}
