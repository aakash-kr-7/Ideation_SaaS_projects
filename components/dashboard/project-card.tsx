import Link from "next/link";
import { ArrowUpRight, Calendar } from "lucide-react";
import { ResearchRun } from "@/lib/types";
import { ScoreBadge } from "@/components/scoring/score-badge";
import { VerdictBadge } from "@/components/opportunity/verdict-badge";
import { motion } from "@/lib/motion";
import { getReportModeConfig } from "@/lib/report-modes";
export function ProjectCard({ run }: { run: ResearchRun }) {
  const o = run.opportunity;
  const mode = getReportModeConfig(run.mode);
  const href = run.status === "Completed" ? `/research/${run.id}/results` : `/research/${run.id}/progress`;
  return <article className={`project-card group ${motion.cardInteractive}`}><div className="project-top"><span className={`report-mode-badge ${run.mode}`}>{mode.label}</span>{o && <ScoreBadge score={o.score.total} size="sm"/>}</div><h3>{run.ideaName}</h3><p>{run.ideaDescription}</p><div className="project-meta"><span><Calendar size={13}/> {run.createdAt}</span><span>{run.status}{o ? ` · ${o.evidence.length} sources` : ""}</span>{o && <VerdictBadge verdict={o.verdict}/>}</div><Link href={href} className="project-card-link">{run.status === "Completed" ? "Open report" : "View progress"} <ArrowUpRight size={14}/></Link></article>;
}
