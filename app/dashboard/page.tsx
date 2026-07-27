import Link from "next/link";
import { ArrowRight, Bookmark, FileText, Gauge, Radar, Rocket, SearchCheck, Target } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { ProjectCard } from "@/components/dashboard/project-card";
import { ScoreBadge } from "@/components/scoring/score-badge";
import { ScoreGuide } from "@/components/scoring/ScoreGuide";
import { VerdictBadge } from "@/components/opportunity/verdict-badge";
import { ResearchRun, Opportunity, ScoreBreakdown, MarketType } from "@/lib/types";
import { validationReportSchema } from "@/lib/report-schema";
import { createClient } from "@/lib/supabase/server";
import { motion, getStaggerDelay, revealUpClass } from "@/lib/motion";
import { ReportHistory } from "@/components/dashboard/report-history";
import { countEvidenceSources } from "@/lib/report-mode-ui";
import { firstRelation, relationArray } from "@/lib/supabase/relations";
import { isResearchStatus } from "@/supabase/functions/_shared/research/status";

export const dynamic = "force-dynamic";

const marketTypes: readonly MarketType[] = ["B2B", "D2C", "Creator", "Developer Tool", "Local Business", "Agency Tool", "Student/Career", "Other"];
function isMarketType(value: string): value is MarketType {
  return marketTypes.some((market) => market === value);
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
    id: string; sourceCount: number; independentDomains: number; durationMs: number | null; completedAt: string | null;
    groundingDegraded: boolean; publicReason: string | null; creditRestored: boolean;
  }>).map((item) => [item.id, item]));

  const mappedRuns: ResearchRun[] = (databaseRuns || []).map((run) => {
    let opportunity: Opportunity | undefined = undefined;
    const versions = relationArray(firstRelation(run.reports)?.report_versions).sort((a, b) => b.version_number - a.version_number);
    const parsed = validationReportSchema.safeParse(versions[0]?.payload);
    if (parsed.success) {
      const o = parsed.data.opportunity;
      const scorecard = o.scorecard;
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
        total: scorecard.total
      };
      opportunity = {
        id: o.id,
        name: o.name,
        one_liner: o.oneLiner,
        target_customer: o.targetCustomer,
        market: isMarketType(o.market) ? o.market : "Other",
        score: legacyScore,
        verdict: scorecard.verdict === "Build Now" ? "Build now" : scorecard.verdict === "Avoid" ? "Avoid for now" : "Validate first",
        confidence: scorecard.confidence,
        evidence: o.evidence,
        competitors: o.competitors,
        pricing: o.pricing,
        mvp: o.mvp,
        launch: o.launch,
        risks: o.risks
      };
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
      opportunity
    };
  });

  const completedRuns = mappedRuns.filter(r => r.status === "Completed");
  const averageScore = completedRuns.length > 0
    ? Math.round(completedRuns.reduce((sum, r) => sum + (r.opportunity?.score.total ?? 0), 0) / completedRuns.length)
    : 0;

  const openInvestigations = mappedRuns.filter(r => r.status !== "Completed" && r.status !== "Failed").length;
  const readyCount = completedRuns.filter(r => r.opportunity?.verdict === "Build now" || r.opportunity?.verdict === "Validate first").length;

  const hasData = mappedRuns.length > 0;
  const hasCompleted = completedRuns.length > 0;

  const activeFiles = mappedRuns.slice(0, 4);
  const rankedFiles = [...completedRuns].sort((a, b) => (b.opportunity?.score.total ?? 0) - (a.opportunity?.score.total ?? 0)).slice(0, 4);

  const primaryInvestigation = rankedFiles[0];

  // Dynamic priority actions from actual data
  const priorityActions = rankedFiles.filter(run=>run.opportunity?.launch.weekOne[0]).slice(0, 3).map((run, index) => ({
    num: `0${index + 1}`,
    name: run.ideaName,
    desc: run.opportunity!.launch.weekOne[0],
    action: run.opportunity?.verdict === "Build now" ? "Start building" : "Test next"
  }));

  return <AppShell title="Dashboard" action={<Link className={`button button-small violet-button ${motion.buttonBase}`} href="/research/new">Validate idea <ArrowRight size={15}/></Link>}>
    <div className="page-content command-center" data-tour="dashboard-canvas">

      {/* ─── EMPTY STATE ─── */}
      {!hasData && (
        <section className="dashboard-empty-state">
          <div className="empty-state-card" data-tour="reports">
            <div className="empty-state-icon">
              <SearchCheck size={28} />
            </div>
            <h2>Your first validation is one step away.</h2>
            <p>
              Describe your idea, tell us who the buyer is, and ShouldBuild will search real public sources,
              challenge your assumptions, and deliver a cited verdict in minutes.
            </p>
            <div className="empty-state-steps">
              <div>
                <span>1</span>
                <div>
                  <b>Describe your idea</b>
                  <small>Who is the buyer? What workflow pain does it solve?</small>
                </div>
              </div>
              <div>
                <span>2</span>
                <div>
                  <b>We search for real evidence</b>
                  <small>Real public sources, adversarial analysis, and contradiction detection</small>
                </div>
              </div>
              <div>
                <span>3</span>
                <div>
                  <b>Get your verdict</b>
                  <small>Build Now, Validate First, Niche Down, or Avoid — with citations</small>
                </div>
              </div>
            </div>
            <Link className={`button ${motion.buttonBase}`} href="/research/new">
              Validate my first idea <ArrowRight size={15} />
            </Link>
          </div>
        </section>
      )}

      {/* ─── DATA STATE ─── */}
      {hasData && (
        <>
          <section className="command-intro">
            <div>
              <p className="eyebrow cyan-eyebrow">Your validation pipeline</p>
              <h2>What to do next</h2>
              <p>See every idea you&apos;ve tested, their verdicts, and what to do next.</p>
            </div>
            {primaryInvestigation && (
              <div className="command-focus">
                <Target size={17}/>
                <span>
                  <b>Top-scored idea: {primaryInvestigation.ideaName}</b>
                  <small>{primaryInvestigation.opportunity?.one_liner}</small>
                </span>
                <Link href={`/research/${primaryInvestigation.id}/results`}>View report <ArrowRight size={13}/></Link>
              </div>
            )}
          </section>

          <section className="stats-grid command-stats">
            <StatCard icon={FileText} label="Ideas validated" value={String(completedRuns.length).padStart(2, "0")} detail={`${completedRuns.length} completed`}/>
            <StatCard icon={Gauge} label="Average score" value={String(averageScore)} detail="Across all validations"/>
            <StatCard icon={Bookmark} label="In progress" value={String(openInvestigations).padStart(2, "0")} detail="Being analyzed now"/>
            <StatCard icon={Rocket} label="Passed validation" value={String(readyCount).padStart(2, "0")} detail="Build now or validate first"/>
          </section>

          {hasCompleted && <ScoreGuide score={averageScore}/>}

          <section className="command-grid">
            {/* Next Steps */}
            {priorityActions.length > 0 && (
              <div className="section-card radar-card">
                <header>
                  <div>
                    <p className="eyebrow cyan-eyebrow">Next steps</p>
                    <h2>Do these first</h2>
                  </div>
                  <Radar size={18}/>
                </header>
                <div className="radar-actions">
                  {priorityActions.map((act, index) => <article key={act.num} className={revealUpClass} style={getStaggerDelay(index)}>
                    <span>{act.num}</span>
                    <div><b>{act.name}</b><p>{act.desc}</p></div>
                    <i>{act.action}</i>
                  </article>)}
                </div>
              </div>
            )}

            {/* Previous Validations */}
            <div className="section-card saved-card" data-tour="reports">
              <header>
                <div>
                  <p className="eyebrow cyan-eyebrow">Your reports</p>
                  <h2>Previous validations</h2>
                </div>
                {completedRuns.length >= 2 && <Link href="/compare">Compare ideas</Link>}
              </header>
              {mappedRuns.length > 0 ? (
                <ReportHistory runs={mappedRuns.map(run => {
                  const facts = history.get(run.id);
                  return {
                    id: run.id, ideaName: run.ideaName, mode: run.mode, status: run.status, createdAt: run.createdAt,
                    score: run.opportunity?.score.total, verdict: run.opportunity?.verdict, confidence: run.opportunity?.confidence,
                    sourceCount: facts?.sourceCount ?? countEvidenceSources(run.opportunity?.evidence ?? []),
                    independentDomains: facts?.independentDomains ?? new Set((run.opportunity?.evidence ?? []).map((item) => {
                      try { return new URL(item.url).hostname; } catch { return item.source; }
                    })).size,
                    durationMs: facts?.durationMs, completedAt: facts?.completedAt, degraded: facts?.groundingDegraded,
                    publicReason: facts?.publicReason, creditRestored: facts?.creditRestored,
                  };
                })}/>
              ) : (
                <div className="saved-empty">
                  <p>Your validated ideas will appear here.</p>
                </div>
              )}
            </div>
          </section>

          {/* Bottom Section */}
          {hasCompleted && (
            <section className="command-bottom">
              <div className="section-card">
                <header>
                  <div>
                    <p className="eyebrow cyan-eyebrow">Recent validations</p>
                    <h2>Latest ideas tested</h2>
                  </div>
                  <Link href="/research/new">Validate new idea <ArrowRight size={14}/></Link>
                </header>
                <div className="project-grid">
                  {activeFiles.slice(0, 3).map((run, index) => <div key={run.id} className={revealUpClass} style={getStaggerDelay(index)}><ProjectCard run={run}/></div>)}
                </div>
              </div>
              {rankedFiles.length > 0 && (
                <div className="section-card leaderboard">
                  <header>
                    <div>
                      <p className="eyebrow cyan-eyebrow">Top-scored ideas</p>
                      <h2>Strongest signals</h2>
                    </div>
                  </header>
                  {rankedFiles.map((run, index) => <Link href={`/research/${run.id}/results`} key={run.id} className={`leaderboard-row ${motion.transitionBase} ${motion.hoverElevateSubtle} active:scale-[0.99] ${revealUpClass}`} style={getStaggerDelay(index)}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <div><b>{run.ideaName}</b><small>{run.opportunity?.target_customer}</small></div>
                    <ScoreBadge score={run.opportunity?.score.total ?? 0} size="sm"/>
                    <VerdictBadge verdict={run.opportunity?.verdict ?? "Validate first"}/>
                  </Link>)}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  </AppShell>;
}
