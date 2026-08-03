"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from "framer-motion";
import type { ReactNode } from "react";
import { sbMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type ToastTone = "accent" | "build" | "conditional" | "avoid" | "kill";

export interface ToastProps extends Omit<HTMLMotionProps<"div">, "children"> {
  tone?: ToastTone;
  title: string;
  action?: ReactNode;
  children?: ReactNode;
  open?: boolean;
}

const barColors: Record<ToastTone, string> = {
  accent: "bg-sb-accent",
  build: "bg-sb-verdict-build",
  conditional: "bg-sb-verdict-conditional",
  avoid: "bg-sb-verdict-avoid",
  kill: "bg-sb-verdict-kill",
};

export function Toast({ tone = "accent", title, action, children, className, open = true, ...props }: ToastProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={prefersReducedMotion ? false : { opacity: 0, x: 8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={prefersReducedMotion ? { opacity: 1, x: 0 } : { opacity: 0, x: 8 }}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: sbMotion.duration.base, ease: sbMotion.ease }
          }
          className={cn(
            "relative flex min-h-14 items-start gap-sb-4 overflow-hidden rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 p-sb-4 pl-sb-5 text-sb-text-primary",
            className,
          )}
          {...props}
        >
          <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-1", barColors[tone])} />
          <div className="min-w-0 flex-1">
            <p className="m-0 text-sm font-medium">{title}</p>
            {children && <div className="mt-sb-1 text-sm text-sb-text-secondary">{children}</div>}
          </div>
          {action}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
