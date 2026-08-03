"use client";

import { useLayoutEffect, useRef, useState, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ScoreDisplayProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  score: number;
  max?: number;
  size?: "sm" | "md" | "lg" | "xl";
  showMax?: boolean;
  animate?: boolean;
  durationMs?: number;
  animationKey?: string;
}

const sizeClasses = {
  sm: "text-xl",
  md: "text-4xl",
  lg: "text-4xl",
  xl: "text-6xl",
} as const;

export function ScoreDisplay({
  score,
  max = 100,
  size = "lg",
  showMax = false,
  animate = true,
  durationMs = 600,
  animationKey,
  className,
  ...props
}: ScoreDisplayProps) {
  const target = Number.isFinite(score) ? score : 0;
  const [displayedScore, setDisplayedScore] = useState(target);
  const animationStarted = useRef(false);

  useLayoutEffect(() => {
    if (animationStarted.current) {
      setDisplayedScore(target);
      return;
    }

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const duration = Math.min(Math.max(durationMs, 0), 600);
    const storageKey = animationKey ? `sb-score-counted:${animationKey}` : null;
    let alreadyCounted = false;
    if (storageKey) {
      try {
        alreadyCounted = window.sessionStorage.getItem(storageKey) === "true";
      } catch {
        // Continue with the in-memory one-shot gate when storage is unavailable.
      }
    }

    const rememberCounted = () => {
      if (!storageKey) return;
      try {
        window.sessionStorage.setItem(storageKey, "true");
      } catch {
        // The ref still prevents a replay for this mounted instance.
      }
    };

    if (!animate || duration === 0 || alreadyCounted) {
      animationStarted.current = true;
      setDisplayedScore(target);
      return;
    }

    if (motionQuery.matches) {
      animationStarted.current = true;
      rememberCounted();
      setDisplayedScore(target);
      return;
    }

    let cancelled = false;
    let frame = 0;
    let startedAt = 0;
    const tick = (now: number) => {
      if (cancelled) return;
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayedScore(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    const finishImmediately = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      cancelAnimationFrame(frame);
      animationStarted.current = true;
      rememberCounted();
      setDisplayedScore(target);
    };

    motionQuery.addEventListener("change", finishImmediately);

    // Keep the real value in SSR markup so a session-gated revisit is already
    // settled before hydration. Fresh reports reset in the layout phase only.
    setDisplayedScore(0);

    // Consume the one-shot gate only after the first frame begins. React Strict
    // Mode cancels its probe frame, then the real effect still gets to count.
    frame = requestAnimationFrame((now) => {
      if (cancelled) return;
      animationStarted.current = true;
      rememberCounted();
      startedAt = now;
      tick(now);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      motionQuery.removeEventListener("change", finishImmediately);
    };
  }, [animate, animationKey, durationMs, target]);

  return (
    <span
      className={cn(
        "inline-flex items-baseline font-sb-mono font-semibold leading-none tracking-[-0.02em] text-sb-text-primary tabular-nums",
        sizeClasses[size],
        className,
      )}
      aria-label={`Readiness Score: ${target} out of ${max}`}
      {...props}
    >
      <span aria-hidden="true">{displayedScore}</span>
      {showMax && (
        <span aria-hidden="true" className="ml-sb-1 text-[0.35em] font-medium tracking-normal text-sb-text-tertiary">
          /{max}
        </span>
      )}
    </span>
  );
}
