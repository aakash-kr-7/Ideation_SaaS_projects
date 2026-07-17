import Link from "next/link";
import { ArrowRight, Bookmark, FileText, Gauge, Radar, Rocket, Sparkles, Target } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { ProjectCard } from "@/components/dashboard/project-card";
import { ScoreBadge } from "@/components/scoring/score-badge";
import { ScoreGuide } from "@/components/scoring/ScoreGuide";
import { VerdictBadge } from "@/components/opportunity/verdict-badge";
import { ResearchRun, Opportunity, ScoreBreakdown, MarketType } from "@/lib/types";
import { createClient } from "@/lib/supabase/server";
import { motion, getStaggerDelay, revealUpClass } from "@/lib/motion";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: databaseRuns, error } = await supabase
    .from("research_runs")
    .select(`id, idea_name, idea_description, target_customer, market_type, target_region, mode, status, progress, created_at,
      opportunities(
        id, name, one_liner, target_customer, market, core_pain,
        evidence_items(id, signal_type, strength, title, snippet, created_at, sources(title, source_type, url)),
        competitors(id, name, positioning, pricing, target, strength, gap),
        pricing_models(model, price_point, rationale, first_offer, target_customers),
        mvp_plans(outcome, build_estimate, build_complexity, mvp_scope_items(item_type, description)),
        launch_plans(first_customer_channel, outreach_message, success_metric, launch_strategies(strategy_type, description)),
        risks(id, category, severity, description, mitigation),
        opportunity_scores(total, confidence, verdict, score_breakdowns(criterion, score))
      )`)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const mappedRuns: ResearchRun[] = (databaseRuns || []).map((run: any) => {
    let opportunity: Opportunity | undefined = undefined;
    const o = run.opportunities?.[0];
    const scorecard = Array.isArray(o?.opportunity_scores) ? o?.opportunity_scores[0] : o?.opportunity_scores;
    if (o && scorecard) {
      const scores = Object.fromEntries((scorecard.score_breakdowns || []).map((item: any) => [item.criterion, Number(item.score)]));
      const legacyScore: ScoreBreakdown = {
        pain: scores.painSeverity,
        urgency: scores.purchaseUrgency,
        willingnessToPay: scores.willingnessToPay,
        reachability: scores.buyerReachability,
        competition: scores.competitionGap,
        complexity: scores.mvpSpeed,
        platformRisk: scores.platformDependencyRisk,
        founderFit: scores.founderFit,
        total: Number(scorecard.total)
      };
      const pricing = Array.isArray(o.pricing_models) ? o.pricing_models[0] : o.pricing_models;
      const mvp = Array.isArray(o.mvp_plans) ? o.mvp_plans[0] : o.mvp_plans;
      const launch = Array.isArray(o.launch_plans) ? o.launch_plans[0] : o.launch_plans;
      const strategies = launch?.launch_strategies || [];
      const scopeItems = mvp?.mvp_scope_items || [];

      opportunity = {
        id: o.id,
        name: o.name,
        one_liner: o.one_liner,
        target_customer: o.target_customer,
        market: o.market as MarketType,
        score: legacyScore,
        verdict: scorecard.verdict === "Build Now" ? "Build now" : scorecard.verdict === "Avoid" ? "Avoid for now" : "Validate first",
        confidence: Number(scorecard.confidence),
        evidence: (o.evidence_items || []).map((e: any) => ({ id:e.id,source:e.sources?.title || "Source",sourceType:e.sources?.source_type || "Unknown",title:e.title,snippet:e.snippet,url:e.sources?.url || "",signal:e.signal_type,strength:e.strength,date:e.created_at.slice(0,10) })),
        competitors: o.competitors,
        pricing: {model:pricing?.model || "",pricePoint:pricing?.price_point || "",rationale:pricing?.rationale || "",firstOffer:pricing?.first_offer || "",targetCustomers:pricing?.target_customers || 0},
        mvp: {outcome:mvp?.outcome || "",scope:scopeItems.filter((item:any)=>item.item_type==="Scope").map((item:any)=>item.description),exclusions:scopeItems.filter((item:any)=>item.item_type==="Exclusion").map((item:any)=>item.description),buildEstimate:mvp?.build_estimate || ""},
        launch: {firstCustomerChannel:launch?.first_customer_channel || "",weekOne:strategies.filter((item:any)=>item.strategy_type==="WeekOne").map((item:any)=>item.description),outreachMessage:launch?.outreach_message || "",successMetric:launch?.success_metric || ""},
        risks: o.risks
      };
    }

    return {
      id: run.id,
      ideaName: run.idea_name,
      ideaDescription: run.idea_description,
      targetCustomer: run.target_customer,
      marketType: run.market_type,
      targetRegion: run.target_region,
      mode: run.mode,
      status: run.status,
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
              <Sparkles size={28} />
            </div>
            <h2>Welcome to SignalFit</h2>
            <p>
              Describe your first product idea and get a market-backed verdict in minutes.
              We&apos;ll analyze buyer pain, competition, pricing, risks, and give you a concrete next step.
            </p>
            <div className="empty-state-steps">
              <div>
                <span>1</span>
                <div>
                  <b>Describe your idea</b>
                  <small>Who is the buyer? What pain does it solve?</small>
                </div>
              </div>
              <div>
                <span>2</span>
                <div>
                  <b>We analyze the market</b>
                  <small>Real signals from Reddit, G2, Product Hunt, and more</small>
                </div>
              </div>
              <div>
                <span>3</span>
                <div>
                  <b>Get your verdict</b>
                  <small>Build Now, Validate First, Niche Down, or Avoid</small>
                </div>
              </div>
            </div>
            <Link className={`button ${motion.buttonBase}`} href="/research/new">
              Validate your first idea <ArrowRight size={15} />
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
            <StatCard icon={Rocket} label="Ready to build" value={String(readyCount).padStart(2, "0")} detail="Passed validation"/>
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
                mappedRuns.map((run, index) => <Link className={`saved-row ${motion.transitionBase} ${motion.hoverElevateSubtle} active:scale-[0.99] ${revealUpClass}`} style={getStaggerDelay(index)} href={run.status === "Completed" ? `/research/${run.id}/results` : `/research/${run.id}/progress`} key={run.id}>
                  <span>{run.ideaName.slice(0, 2).toUpperCase()}</span>
                  <div><b>{run.ideaName}</b><small>{run.mode} · {run.createdAt}</small></div>
                  <ArrowRight size={14}/>
                </Link>)
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
