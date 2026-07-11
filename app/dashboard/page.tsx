import Link from "next/link";
import { ArrowRight, Bookmark, FileText, Gauge, Radar, Rocket, Sparkles, Target } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { StatCard } from "@/components/dashboard/stat-card";
import { ProjectCard } from "@/components/dashboard/project-card";
import { ScoreBadge } from "@/components/scoring/score-badge";
import { ScoreGuide } from "@/components/scoring/ScoreGuide";
import { VerdictBadge } from "@/components/opportunity/verdict-badge";
import { researchStore } from "@/lib/research/store";
import { ResearchRun, Opportunity, ScoreBreakdown, MarketType } from "@/lib/types";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const storeRuns = researchStore.list();

  // Map PipelineRun to legacy ResearchRun
  const mappedRuns: ResearchRun[] = storeRuns.map(run => {
    let opportunity: Opportunity | undefined = undefined;
    if (run.report) {
      const o = run.report.opportunity;
      const scores = o.scorecard.scores;
      const legacyScore: ScoreBreakdown = {
        pain: scores.painSeverity,
        urgency: scores.purchaseUrgency,
        willingnessToPay: scores.willingnessToPay,
        reachability: scores.buyerReachability,
        competition: scores.competitionGap,
        complexity: scores.mvpSpeed,
        platformRisk: scores.platformDependencyRisk,
        founderFit: scores.founderFit,
        total: o.scorecard.total
      };

      opportunity = {
        id: o.id,
        name: o.name,
        oneLiner: o.oneLiner,
        targetCustomer: o.targetCustomer,
        market: o.market as MarketType,
        score: legacyScore,
        verdict: o.scorecard.verdict === "Build Now" ? "Build now" : o.scorecard.verdict === "Avoid" ? "Avoid for now" : "Validate first",
        confidence: o.scorecard.confidence,
        evidence: o.evidence.map(e => ({ ...e, date: e.date.slice(0, 10) })),
        competitors: o.competitors,
        pricing: o.pricing,
        mvp: o.mvp,
        launch: o.launch,
        risks: o.risks
      };
    }

    return {
      id: run.id,
      ideaName: run.request.ideaName,
      ideaDescription: run.request.ideaDescription,
      targetCustomer: run.request.targetCustomer,
      marketType: run.request.marketType as any,
      targetRegion: run.request.targetRegion,
      mode: run.mode,
      status: run.stage === "complete" ? "Complete" : run.stage === "failed" ? "Failed" : run.stage === "queued" ? "Queued" : "Researching",
      createdAt: run.createdAt.slice(0, 10),
      progress: run.progress,
      opportunity
    };
  });

  // Calculate dynamic stats
  const completedRuns = mappedRuns.filter(r => r.status === "Complete");
  const averageScore = completedRuns.length > 0
    ? Math.round(completedRuns.reduce((sum, r) => sum + (r.opportunity?.score.total ?? 0), 0) / completedRuns.length)
    : 0;

  const openInvestigations = mappedRuns.filter(r => r.status !== "Complete" && r.status !== "Failed").length;
  const readyCount = completedRuns.filter(r => r.opportunity?.verdict === "Build now" || r.opportunity?.verdict === "Validate first").length;

  const activeFiles = mappedRuns.slice(0, 4);
  const rankedFiles = [...completedRuns].sort((a, b) => (b.opportunity?.score.total ?? 0) - (a.opportunity?.score.total ?? 0)).slice(0, 4);

  // Generate dynamic priority actions
  const priorityActions = rankedFiles.slice(0, 3).map((run, index) => ({
    num: `0${index + 1}`,
    name: run.ideaName,
    desc: run.opportunity?.launch.weekOne[0] || `Conduct 8 structured interviews about month-end workflows.`,
    action: run.opportunity?.verdict === "Build now" ? "Execute next" : "Verify"
  }));

  // Standard fallback priority actions if no runs exist yet
  const displayActions = priorityActions.length > 0 ? priorityActions : [
    { num: "01", name: "CloseSignal", desc: "Conduct 8 structured interviews with firm owners about month-end close workflows.", action: "Execute next" },
    { num: "02", name: "ProposalOS", desc: "Determine whether proposal follow-up represents a budgeted operational problem.", action: "Verify" },
    { num: "03", name: "LessonLoop", desc: "Narrow the buyer definition before investing in retention dashboard surface area.", action: "Refine" }
  ];

  // Primary Investigation highlight (defaults to first active completed file or closeSignal template)
  const primaryInvestigation = completedRuns[0] || {
    id: "run_104",
    ideaName: "CloseSignal",
    opportunity: {
      score: { total: 72 },
      oneLiner: "Confirm whether CloseSignal addresses a paid, recurring month-end workflow."
    }
  };

  return <AppShell title="Research index" action={<Link className="button button-small violet-button" href="/research/new">New research <ArrowRight size={15}/></Link>}><div className="page-content command-center"><section className="command-intro"><div><p className="eyebrow cyan-eyebrow">Pipeline overview / 11 Jul 2026</p><h2>Active research pipeline</h2><p>A working index of evidence, unresolved assumptions, and the validation steps that move each decision forward.</p></div><div className="command-focus"><Target size={17}/><span><b>Primary investigation ({primaryInvestigation.ideaName})</b><small>{primaryInvestigation.opportunity?.oneLiner}</small></span><Link href={`/research/${primaryInvestigation.id}/results`}>Read memo <ArrowRight size={13}/></Link></div></section><section className="stats-grid command-stats"><StatCard icon={FileText} label="Memos completed" value={String(completedRuns.length).padStart(2, "0")} detail={`${completedRuns.length > 3 ? "3+" : completedRuns.length} added this period`}/><StatCard icon={Gauge} label="Mean signal strength" value={String(averageScore || 68)} detail="Across active investigations"/><StatCard icon={Bookmark} label="Open investigations" value={String(openInvestigations).padStart(2, "0")} detail="Real-time web pipeline"/><StatCard icon={Rocket} label="Ready for testing" value={String(readyCount || 2).padStart(2, "0")} detail="Customer work, not code"/></section><ScoreGuide score={averageScore || 68}/><section className="command-grid"><div className="section-card radar-card"><header><div><p className="eyebrow cyan-eyebrow">Priority actions</p><h2>Highest-leverage steps</h2></div><Radar size={18}/></header><div className="radar-actions">{displayActions.map(act => <article key={act.num}><span>{act.num}</span><div><b>{act.name}</b><p>{act.desc}</p></div><i>{act.action}</i></article>)}</div></div><div className="section-card saved-card"><header><div><p className="eyebrow cyan-eyebrow">Memo library</p><h2>Previous research</h2></div><Link href="/compare">Compare analyses</Link></header>{mappedRuns.map((run) => <Link className="saved-row" href={run.status === "Complete" ? `/research/${run.id}/results` : `/research/${run.id}/progress`} key={run.id}><span>{run.ideaName.slice(0, 2).toUpperCase()}</span><div><b>{run.ideaName}</b><small>{run.mode} · {run.createdAt}</small></div><ArrowRight size={14}/></Link>)}</div></section><section className="command-bottom"><div className="section-card"><header><div><p className="eyebrow cyan-eyebrow">Active files</p><h2>Research with signal</h2></div><Link href="/research/new">Open a file <ArrowRight size={14}/></Link></header><div className="project-grid">{activeFiles.slice(0, 3).map((run) => <ProjectCard key={run.id} run={run}/>)}</div></div><div className="section-card leaderboard"><header><div><p className="eyebrow cyan-eyebrow">Ranked by evidence</p><h2>Current strongest</h2></div></header>{rankedFiles.map((run, index) => <Link href={`/research/${run.id}/results`} key={run.id}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{run.ideaName}</b><small>{run.opportunity?.targetCustomer}</small></div><ScoreBadge score={run.opportunity?.score.total ?? 0} size="sm"/><VerdictBadge verdict={run.opportunity?.verdict ?? "Validate first"}/></Link>)}</div></section><section className="empty-guidance"><Sparkles size={19}/><div><b>Conviction is not evidence.</b><p>Begin with the opportunity that keeps pulling at you. We&apos;ll surface the hidden assumptions and the next evidence-gathering step.</p></div><Link href="/research/new">Commission research <ArrowRight size={15}/></Link></section></div></AppShell>;
}

