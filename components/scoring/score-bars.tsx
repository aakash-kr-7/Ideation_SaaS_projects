import { scoreLabels } from "@/lib/scoring";
import { ScoreBreakdown } from "@/lib/types";
export function ScoreBars({ score, compact = false }: { score: ScoreBreakdown; compact?: boolean }) { return <div className={compact ? "score-bars compact" : "score-bars"}>{Object.entries(scoreLabels).map(([key, label]) => { const value = score[key as keyof typeof score] as number; return <div className="score-row" key={key}><span>{label}</span><div className="bar"><i style={{ width: `${value}%` }} /></div><b>{value}</b></div>; })}</div>; }
