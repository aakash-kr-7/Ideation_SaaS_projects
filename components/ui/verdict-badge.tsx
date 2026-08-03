import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type VerdictState = "build" | "conditional" | "avoid" | "kill";

export interface VerdictBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  verdict: VerdictState | string;
}

const verdictStyles: Record<VerdictState, string> = {
  build: "bg-sb-verdict-build-bg text-sb-verdict-build",
  conditional: "bg-sb-verdict-conditional-bg text-sb-verdict-conditional",
  avoid: "bg-sb-verdict-avoid-bg text-sb-verdict-avoid",
  kill: "bg-sb-verdict-kill-bg text-sb-verdict-kill",
};

export function normalizeVerdict(verdict: string): VerdictState {
  const normalized = verdict.trim().toLowerCase().replace(/[_-]+/g, " ");
  if (normalized === "build" || normalized === "build now") return "build";
  if (normalized === "avoid" || normalized === "avoid for now") return "avoid";
  if (normalized === "kill" || normalized === "killed") return "kill";
  return "conditional";
}

export function VerdictBadge({ verdict, className, ...props }: VerdictBadgeProps) {
  const state = normalizeVerdict(verdict);

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-sb-pill px-sb-3 py-sb-1 font-sb-mono text-xs font-semibold uppercase leading-none tracking-[0.02em] tabular-nums",
        verdictStyles[state],
        className,
      )}
      data-verdict={state}
      {...props}
    >
      {state}
    </span>
  );
}
