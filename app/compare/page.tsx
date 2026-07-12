import Link from "next/link";
import { ArrowRight, Scale, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { CompareMatrix } from "@/components/opportunity/CompareMatrix";
import { researchStore } from "@/lib/research/store";

export const dynamic = "force-dynamic";

export default function ComparePage() {
  const reports = researchStore.list()
    .filter(run => run.stage === "complete" && run.report)
    .map(run => run.report!);

  if (reports.length < 2) {
    return (
      <AppShell title="Compare">
        <div className="page-content">
          <section className="dashboard-empty-state">
            <div className="empty-state-card">
              <div className="empty-state-icon">
                <Scale size={28} />
              </div>
              <h2>Compare your best ideas</h2>
              <p>
                Validate at least 2 ideas to compare them side by side.
                You&apos;ll see scores, verdicts, buyer pain, pricing, and build complexity across the same criteria.
              </p>
              <div className="empty-state-meta">
                <span className="empty-state-count">
                  <Sparkles size={14} />
                  {reports.length === 0
                    ? "No completed validations yet"
                    : "1 completed validation — need 1 more"}
                </span>
              </div>
              <Link className="button" href="/research/new">
                Validate {reports.length === 0 ? "your first" : "another"} idea <ArrowRight size={15} />
              </Link>
            </div>
          </section>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Compare">
      <div className="page-content">
        <CompareMatrix allReports={reports} />
      </div>
    </AppShell>
  );
}
