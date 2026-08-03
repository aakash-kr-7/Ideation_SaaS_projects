"use client";

import { useId, useState, type FocusEvent } from "react";
import { PanelTransition } from "@/components/ui/panel-transition";
import { cn } from "@/lib/utils";

export type EvidenceTier = "evidenced" | "suggestive" | "assumed";

export interface EvidenceBadgeProps {
  tier: EvidenceTier;
  whatWasFound: string;
  sourceCount: number;
  independenceGrouping: string;
  freshnessDate: string;
  className?: string;
  settleDelayMs?: number;
  animateSettle?: boolean;
}

const tierStyles: Record<EvidenceTier, string> = {
  evidenced:
    "border-solid border-sb-evidence-evidenced bg-sb-accent-muted text-sb-evidence-evidenced opacity-100",
  suggestive:
    "border-dashed border-sb-evidence-suggestive bg-transparent text-sb-evidence-suggestive opacity-[0.85]",
  assumed:
    "border-dotted border-sb-evidence-assumed bg-transparent italic text-sb-evidence-assumed opacity-[0.65]",
};

export function EvidenceBadge({
  tier,
  whatWasFound,
  sourceCount,
  independenceGrouping,
  freshnessDate,
  className,
  settleDelayMs = 0,
  animateSettle = true,
}: EvidenceBadgeProps) {
  const detailsId = useId();
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);

  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
      setPinned(false);
    }
  }

  return (
    <div
      className={cn("relative inline-flex w-fit flex-col items-start", className)}
      onBlur={handleBlur}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => {
        if (!pinned) setOpen(false);
      }}
    >
      <button
        type="button"
        className={cn(
          "inline-flex items-center rounded-sb-pill border px-sb-3 py-sb-1",
          animateSettle && "sb-evidence-settle",
          "font-sb-body text-xs font-normal uppercase leading-none tracking-[0.02em]",
          "transition-[background-color,border-color,color,opacity] duration-sb-base ease-sb-standard",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus",
          tierStyles[tier],
        )}
        style={animateSettle ? { animationDelay: `${Math.max(0, settleDelayMs)}ms` } : undefined}
        data-evidence-tier={tier}
        aria-expanded={open}
        aria-controls={detailsId}
        onClick={() => {
          const nextPinned = !pinned;
          setPinned(nextPinned);
          setOpen(nextPinned);
        }}
        onFocus={() => setOpen(true)}
      >
        {tier}
      </button>

      <PanelTransition
          isOpen={open}
          variant="popover"
          id={detailsId}
          role="tooltip"
          className="absolute left-0 top-[calc(100%+var(--sb-space-2))] z-50 w-72 rounded-sb-md border border-sb-border-hairline-strong bg-sb-bg-surface-2 p-sb-4 text-left not-italic text-sb-text-primary opacity-100"
        >
          {/* TODO(data): pass evidence metadata from the persisted evidence model at each call site. */}
          <p className="m-0 text-sm leading-relaxed">{whatWasFound}</p>
          <dl className="mt-sb-3 grid grid-cols-[auto_1fr] gap-x-sb-3 gap-y-sb-2 text-xs">
            <dt className="text-sb-text-tertiary">Sources</dt>
            <dd className="m-0 font-sb-mono tabular-nums">{sourceCount}</dd>
            <dt className="text-sb-text-tertiary">Independence</dt>
            <dd className="m-0 text-sb-text-secondary">{independenceGrouping}</dd>
            <dt className="text-sb-text-tertiary">Freshness</dt>
            <dd className="m-0 font-sb-mono text-sb-text-secondary tabular-nums">{freshnessDate}</dd>
          </dl>
      </PanelTransition>
    </div>
  );
}
