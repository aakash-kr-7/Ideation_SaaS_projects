import { ValidationVerdict, EngineVerdict } from "@/lib/types";
import { cn } from "@/lib/utils";

function verdictClass(verdict: string): string {
  const v = verdict.toLowerCase().replace(/\s+/g, "-");
  if (v === "build-now" || v === "build now") return "build-now";
  if (v === "validate-first" || v === "validate first") return "validate-first";
  if (v === "niche-down" || v === "niche down") return "niche-down";
  if (v === "weak-signal" || v === "weak signal") return "weak-signal";
  if (v === "avoid" || v === "avoid for now") return "avoid";
  return "";
}

export function VerdictBadge({ verdict }: { verdict: ValidationVerdict | EngineVerdict | string }) {
  return <span className={cn("verdict", verdictClass(verdict))}>{verdict}</span>;
}
