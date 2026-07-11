import Link from "next/link";
import { ArrowUpRight, Calendar } from "lucide-react";
import { ResearchRun } from "@/lib/types";
import { ScoreBadge } from "@/components/scoring/score-badge";
import { VerdictBadge } from "@/components/opportunity/verdict-badge";
export function ProjectCard({ run }: { run: ResearchRun }) {
  const o = run.opportunity;
  const href = run.status === "Complete" ? `/research/${run.id}/results` : `/research/${run.id}/progress`;
  return <article className="project-card"><div className="project-top"><span className="mini-mark">{run.ideaName.slice(0,2).toUpperCase()}</span>{o && <ScoreBadge score={o.score.total} size="sm"/>}</div><h3>{run.ideaName}</h3><p>{run.ideaDescription}</p><div className="project-meta"><span><Calendar size={13}/> {run.createdAt}</span>{o && <VerdictBadge verdict={o.verdict}/>}</div><Link href={href}>Open report <ArrowUpRight size={14}/></Link></article>;
}

