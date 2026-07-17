import { CircleHelp, MoveRight } from "lucide-react";
import { getScoreGuidance, scoreGuidance } from "@/lib/scoring";

export function ScoreGuide({ score, compact = false }: { score: number; compact?: boolean }) {
  const current = getScoreGuidance(score);
  if (compact) return <aside className="score-guide-compact" aria-label="Score interpretation"><CircleHelp size={15}/><div><b>{score}/100 means {current.verdict}.</b><span>{current.meaning}</span></div></aside>;
  return <section className="score-guide" aria-label="How ShouldBuild scores work"><header><div><p className="eyebrow">Score interpretation</p><h3>What does {score}/100 actually mean?</h3></div><div className="score-guide-current"><b>{current.verdict}</b><span>{current.action}</span></div></header><div className="score-guide-bands">{scoreGuidance.map((band) => <article key={band.verdict} className={band.verdict === current.verdict ? "active" : ""}><span>{band.min}–{band.max}</span><b>{band.verdict}</b><p>{band.meaning}</p></article>)}</div><footer><MoveRight size={14}/> Scores show how strongly the current evidence supports the next commitment—not a guarantee that a market will respond.</footer></section>;
}
