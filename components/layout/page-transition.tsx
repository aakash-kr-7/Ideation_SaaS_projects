"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { sbMotion } from "@/lib/motion";

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const restingState = { opacity: 1, y: 0 };
  const hiddenState = prefersReducedMotion
    ? restingState
    : { opacity: 0, y: 8 };

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        key={pathname}
        initial={hiddenState}
        animate={restingState}
        exit={hiddenState}
        transition={
          prefersReducedMotion
            ? { duration: 0 }
            : { duration: sbMotion.duration.page, ease: sbMotion.ease }
        }
        className="min-w-0"
        data-page-transition
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
