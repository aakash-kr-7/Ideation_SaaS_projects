import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { ProjectCard } from "@/components/dashboard/project-card";
import { ReportHistory } from "@/components/dashboard/report-history";
import { StatCard } from "@/components/dashboard/stat-card";
import { FirstSessionStagger } from "@/components/ui/session-stagger";
import { EmptyState } from "@/components/ui/state-message";
import type { MarketType, Opportunity, ResearchRun, ScoreBreakdown } from "@/lib/types";
import { validationReportSchema } from "@/lib/report-schema";
import { countEvidenceSources } from "@/lib/report-mode-ui";
import { createClient } from "@/lib/supabase/server";
import { firstRelation, relationArray } from "@/lib/supabase/relations";
import { isResearchStatus } from "@/supabase/functions/_shared/research/status";

export const dynamic = "force-dynamic";

const marketTypes: readonly MarketType[] = ["B2B", "D2C", "Creator", "Developer Tool", "Local Business", "Agency Tool", "Student/Career", "Other"];

function isMarketType(value: string): value is MarketType {
  return marketTypes.some((market) => market === value);
}

function evidenceNeedsRevalidation(evidence: { freshnessState?: string; revalidationDueAt?: string }) {
  if (evidence.freshnessState === "stale" || evidence.freshnessState === "revalidation_due") return true;
  if (!evidence.revalidationDueAt) return false;
  const dueAt = new Date(evidence.revalidationDueAt).getTime();
  return Number.isFinite(dueAt) && dueAt <= Date.now();
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const [{ data: databaseRuns, error }, { data: historyData, error: historyError }] = await Promise.all([
    supabase.from("research_runs")
      .select(`id, idea_name, idea_description, target_customer, market_type, target_region, mode, status, progress, created_at,
        reports(report_versions(version_number, payload))`)
      .order("created_at", { ascending: false }),
    supabase.rpc("get_research_history_snapshot"),
  ]);
  if (error) throw error;
  if (historyError) throw historyError;

  const history = new Map(((historyData ?? []) as Array<{
    id: string;
    sourceCount: number;
    independentDomains: number;
    durationMs: number | null;
    completedAt: string | null;
    groundingDegraded: boolean;
    publicReason: string | null;
    creditRestored: boolean;
  }>).map((item) => [item.id, item]));
  const revalidationByRun = new Map<string, boolean>();

  const mappedRuns: ResearchRun[] = (databaseRuns ?? []).map((run) => {
    let opportunity: Opportunity | undefined;
    const versions = relationArray(firstRelation(run.reports)?.report_versions).sort((left, right) => right.version_number - left.version_number);
    const parsed = validationReportSchema.safeParse(versions[0]?.payload);

    if (parsed.success) {
      const report = parsed.data;
      const payload = report.opportunity;
      const scorecard = payload.scorecard;
      const scores = scorecard.scores;
      const legacyScore: ScoreBreakdown = {
        pain: scores.painSeverity,
        urgency: scores.purchaseUrgency,
        willingnessToPay: scores.willingnessToPay,
        reachability: scores.buyerReachability,
        competition: scores.competitionGap,
        complexity: scores.mvpSpeed,
        platformRisk: scores.platformDependencyRisk,
        founderFit: scores.founderFit,
        total: scorecard.total,
      };
      opportunity = {
        id: payload.id,
        name: payload.name,
        one_liner: payload.oneLiner,
        target_customer: payload.targetCustomer,
        market: isMarketType(payload.market) ? payload.market : "Other",
        score: legacyScore,
        verdict: scorecard.verdict === "Build Now" ? "Build now" : scorecard.verdict === "Avoid" ? "Avoid for now" : "Validate first",
        confidence: scorecard.confidence,
        evidence: payload.evidence,
        competitors: payload.competitors,
        pricing: payload.pricing,
        mvp: payload.mvp,
        launch: payload.launch,
        risks: payload.risks,
      };
      revalidationByRun.set(
        run.id,
        Boolean(report.staleEvidenceWarning?.trim()) || payload.evidence.some(evidenceNeedsRevalidation),
      );
    }

    return {
      id: run.id,
      ideaName: run.idea_name,
      ideaDescription: run.idea_description,
      targetCustomer: run.target_customer,
      marketType: isMarketType(run.market_type) ? run.market_type : "Other",
      targetRegion: run.target_region,
      mode: run.mode,
      status: isResearchStatus(run.status) ? run.status : "Failed",
      createdAt: run.created_at.slice(0, 10),
      progress: run.progress,
      opportunity,
    };
  });

  const completedRuns = mappedRuns.filter((run) => run.status === "Completed" && run.opportunity);
  const rankedIdeas = [...completedRuns].sort((left, right) => (right.opportunity?.score.total ?? 0) - (left.opportunity?.score.total ?? 0));
  const averageScore = completedRuns.length
    ? Math.round(completedRuns.reduce((total, run) => total + (run.opportunity?.score.total ?? 0), 0) / completedRuns.length)
    : 0;
  const revalidationCount = completedRuns.filter((run) => revalidationByRun.get(run.id)).length;
  const hasData = mappedRuns.length > 0;

  const historyRows = mappedRuns.map((run) => {
    const facts = history.get(run.id);
    return {
      id: run.id,
      ideaName: run.ideaName,
      mode: run.mode,
      status: run.status,
      createdAt: run.createdAt,
      score: run.opportunity?.score.total,
      verdict: run.opportunity?.verdict,
      sourceCount: facts?.sourceCount ?? countEvidenceSources(run.opportunity?.evidence ?? []),
      independentDomains: facts?.independentDomains ?? new Set((run.opportunity?.evidence ?? []).map((item) => {
        try { return new URL(item.url).hostname; } catch { return item.source; }
      })).size,
      durationMs: facts?.durationMs,
      completedAt: facts?.completedAt,
      degraded: facts?.groundingDegraded,
      publicReason: facts?.publicReason,
      creditRestored: facts?.creditRestored,
    };
  });

  const action = hasData ? (
    <Link className="inline-flex min-h-10 items-center rounded-sb-md border border-sb-accent bg-sb-accent px-sb-4 py-sb-2 text-sm font-medium text-sb-text-primary transition-colors duration-sb-fast ease-sb-standard hover:border-sb-accent-hover hover:bg-sb-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href="/research/new?mode=quick_scan">
      Validate idea
    </Link>
  ) : undefined;

  return (
    <AppShell title="Dashboard" action={action}>
      <main className="mx-auto grid w-full max-w-6xl gap-sb-8 px-sb-5 py-sb-8 sm:px-sb-8 sm:py-sb-10" data-tour="dashboard-canvas">
        {!hasData ? (
          <section className="mx-auto grid w-full max-w-2xl gap-sb-5 py-sb-12">
            <header>
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Dashboard</p>
              <h1 className="mb-0 mt-sb-1 font-sb-display text-3xl font-[480] tracking-[-0.02em]">Your idea list starts with evidence</h1>
            </header>
            <EmptyState
              message="No ideas have been validated yet. Run a Quick Scan to create the first Readiness Score and verdict."
              action={
                <Link className="inline-flex min-h-10 items-center rounded-sb-md border border-sb-accent bg-sb-accent px-sb-4 py-sb-2 text-sm font-medium text-sb-text-primary transition-colors duration-sb-fast ease-sb-standard hover:border-sb-accent-hover hover:bg-sb-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href="/research/new?mode=quick_scan">
                  Run a Quick Scan
                </Link>
              }
            />
          </section>
        ) : (
          <>
            <header className="max-w-3xl">
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Validation portfolio</p>
              <h1 className="mb-0 mt-sb-1 font-sb-display text-3xl font-[480] tracking-[-0.02em]">Ideas, ranked by readiness</h1>
              <p className="mb-0 mt-sb-2 text-sm leading-relaxed text-sb-text-secondary">Scan verdicts first, then open the evidence behind the scores that deserve attention.</p>
            </header>

            <section className="grid gap-sb-3 sm:grid-cols-3" aria-label="Actionable portfolio metrics">
              <StatCard label="Ideas" value={String(mappedRuns.length)} detail={`${completedRuns.length} with a completed verdict`} resolveKey="dashboard:stat:ideas"/>
              <StatCard label="Average score" value={completedRuns.length ? String(averageScore) : "—"} detail="Across completed validations" resolveKey="dashboard:stat:average-score" score={completedRuns.length > 0}/>
              <StatCard label="Needs revalidation" value={String(revalidationCount)} detail="Reports with stale or due evidence" resolveKey="dashboard:stat:revalidation"/>
            </section>

            <section className="grid gap-sb-4" aria-labelledby="ranked-ideas-title">
              <div className="flex items-end justify-between gap-sb-4 border-b border-sb-border-hairline pb-sb-3">
                <div>
                  <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Score order</p>
                  <h2 id="ranked-ideas-title" className="mb-0 mt-sb-1 font-sb-display text-xl font-[480]">Validated ideas</h2>
                </div>
                <span className="font-sb-mono text-xs tabular-nums text-sb-text-tertiary">{rankedIdeas.length} scored</span>
              </div>
              {rankedIdeas.length ? (
                <FirstSessionStagger
                  className="grid gap-sb-2"
                  sessionKey="dashboard:project-list:v1"
                  maxItems={10}
                  stepMs={70}
                  durationMs={180}
                >
                  {rankedIdeas.map((run, index) => <ProjectCard run={run} rank={index + 1} key={run.id}/>)}
                </FirstSessionStagger>
              ) : (
                <EmptyState message="No completed scores are available yet. Open an in-progress run in report history to see its current research stage."/>
              )}
            </section>

            <section className="grid gap-sb-4" aria-labelledby="history-title" data-tour="reports">
              <div className="flex flex-col gap-sb-2 border-b border-sb-border-hairline pb-sb-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Chronological record</p>
                  <h2 id="history-title" className="mb-0 mt-sb-1 font-sb-display text-xl font-[480]">Report history</h2>
                </div>
                {completedRuns.length >= 2 && <Link className="text-sm text-sb-text-secondary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href="/compare">Compare ideas</Link>}
              </div>
              <ReportHistory runs={historyRows}/>
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
