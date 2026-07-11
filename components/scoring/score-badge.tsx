import { cn, scoreTone } from "@/lib/utils";
export function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) { return <div className={cn("score-badge", `score-${scoreTone(score)}`, `score-${size}`)}><b>{score}</b><span>/100</span></div>; }
