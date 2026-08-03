"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  useLayoutEffect,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { clampDataResolveDuration, sbMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

const resolvedThisSession = new Set<string>();
const STORAGE_PREFIX = "sb-data-resolved:";

type ResolvePhase = "placeholder" | "animate" | "instant";

function wasResolved(resolveKey: string) {
  if (resolvedThisSession.has(resolveKey)) return true;
  try {
    return window.sessionStorage.getItem(`${STORAGE_PREFIX}${resolveKey}`) === "1";
  } catch {
    return false;
  }
}

function rememberResolved(resolveKey: string) {
  resolvedThisSession.add(resolveKey);
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${resolveKey}`, "1");
  } catch {
    // Module memory still prevents replay when sessionStorage is unavailable.
  }
}

export interface DataResolveProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  children: ReactNode;
  /** Stable identity for this value, such as `report:${reportId}:factor:${key}`. */
  resolveKey: string;
  /** Must reflect the real async load state; DataResolve never starts a timer. */
  isResolved: boolean;
  durationMs?: number;
  placeholder?: ReactNode;
}

export function DataResolve({
  children,
  resolveKey,
  isResolved,
  durationMs = 240,
  placeholder = "– –",
  className,
  ...props
}: DataResolveProps) {
  const prefersReducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<ResolvePhase>(() =>
    isResolved ? "instant" : "placeholder",
  );

  useLayoutEffect(() => {
    if (!isResolved) {
      setPhase("placeholder");
      return;
    }

    if (wasResolved(resolveKey)) {
      resolvedThisSession.add(resolveKey);
      setPhase("instant");
      return;
    }

    if (prefersReducedMotion) {
      rememberResolved(resolveKey);
      setPhase("instant");
      return;
    }

    // Real resolved content is the SSR/default state so revisits never flash a
    // placeholder before hydration. A fresh session arms the placeholder in
    // the layout phase, then resolves it on the next frame.
    setPhase("placeholder");
    const frame = window.requestAnimationFrame(() => {
      rememberResolved(resolveKey);
      setPhase("animate");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [isResolved, prefersReducedMotion, resolveKey]);

  const showValue = phase !== "placeholder";
  const duration =
    phase === "animate" && !prefersReducedMotion
      ? clampDataResolveDuration(durationMs)
      : 0;

  return (
    <span
      className={cn(
        "inline-grid font-sb-mono tabular-nums",
        className,
      )}
      aria-busy={!showValue}
      {...props}
    >
      <AnimatePresence initial={false} mode="sync">
        {showValue ? (
          <motion.span
            key="value"
            className="[grid-area:1/1]"
            initial={
              phase === "animate" ? { opacity: 0, y: 4 } : false
            }
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration, ease: sbMotion.ease }}
          >
            {children}
          </motion.span>
        ) : (
          <motion.span
            key="placeholder"
            className="[grid-area:1/1] text-sb-text-tertiary"
            aria-hidden="true"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            exit={
              prefersReducedMotion
                ? { opacity: 0, y: 0 }
                : { opacity: 0, y: -2 }
            }
            transition={{ duration, ease: sbMotion.ease }}
          >
            {placeholder}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
