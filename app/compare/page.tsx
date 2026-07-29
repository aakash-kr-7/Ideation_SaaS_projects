import Link from "next/link";
import { ArrowRight, Scale, SearchCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { CompareMatrix } from "@/components/opportunity/CompareMatrix";
import { validationReportSchema } from "@/lib/report-schema";
import { createClient } from "@/lib/supabase/server";
import { firstRelation } from "@/lib/supabase/relations";

export const dynamic = "force-dynamic";

export default async function ComparePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reports")
    .select("report_versions(payload, created_at), research_runs!inner(status)")
    .eq("research_runs.status", "Completed")
    .order("created_at", { referencedTable: "report_versions", ascending: false });
  if (error) throw error;
  const reports = (data || []).flatMap((row) => {
    const parsed = validationReportSchema.safeParse(firstRelation(row.report_versions)?.payload);
    return parsed.success ? [parsed.data] : [];
  });

  if (reports.length < 2) {
    return (
      <AppShell title="Compare">
        <div className="page-content">
          <section className="dashboard-empty-state">
            <div className="empty-state-card compare-empty-state">
              <div className="empty-state-icon">
                <Scale size={28} />
              </div>
              <p className="eyebrow">Portfolio judgment</p>
              <h2>Stop letting the loudest idea win.</h2>
              <p>
                Put two completed validations under the same lens. Buyer pain, pricing power,
                distribution, risk, and build complexity become comparable—not merely memorable.
              </p>
              <div className="empty-state-meta">
                <span className="empty-state-count">
                  <SearchCheck size={14} />
                  {reports.length === 0
                    ? "Two completed decision files unlock the comparison room"
                    : "One decision file ready · one more unlocks comparison"}
                </span>
              </div>
              <Link className="button" href="/research/new">
                Put {reports.length === 0 ? "the first idea" : "another idea"} on trial <ArrowRight size={15} />
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
