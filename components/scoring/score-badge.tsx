export function ScoreBadge({ score, size = "md" }: { score: number; size?: "sm" | "md" | "lg" }) {
  const r = size === "sm" ? 16 : size === "lg" ? 28 : 22;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const svgSize = (r + 4) * 2;
  const colorClass = score >= 70 ? "high" : score >= 45 ? "mid" : "low";
  const fontSize = size === "sm" ? 10 : size === "lg" ? 16 : 12;

  return <span className="score-ring" style={{ width: svgSize, height: svgSize }}>
    <svg width={svgSize} height={svgSize}>
      <circle className="ring-track" cx={svgSize/2} cy={svgSize/2} r={r}/>
      <circle className={`ring-fill ${colorClass}`} cx={svgSize/2} cy={svgSize/2} r={r}
        strokeDasharray={circ} strokeDashoffset={offset}/>
    </svg>
    <b style={{ fontSize }}>{score}</b>
  </span>;
}
