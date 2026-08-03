"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "framer-motion";
import {
  useCallback,
  useEffect,
  type PointerEvent,
  type ReactNode,
} from "react";
import { sbMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface MagneticButtonProps {
  children: ReactNode;
  className?: string;
  /** Disables only the magnetic behavior; pass disabled to the child button too. */
  disabled?: boolean;
  /** Maximum distance, in pixels, that the wrapper can move. */
  radiusPx?: number;
  /** Portion of the pointer's distance from center applied to the wrapper. */
  strength?: number;
}

export function MagneticButton({
  children,
  className,
  disabled = false,
  radiusPx = sbMotion.magnetic.radiusPx,
  strength = sbMotion.magnetic.strength,
}: MagneticButtonProps) {
  const prefersReducedMotion = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, sbMotion.magnetic.spring);
  const springY = useSpring(y, sbMotion.magnetic.spring);

  const settle = useCallback(
    (immediate = false) => {
      x.set(0);
      y.set(0);

      if (immediate) {
        springX.jump(0);
        springY.jump(0);
      }
    },
    [springX, springY, x, y],
  );

  useEffect(() => {
    if (prefersReducedMotion || disabled) {
      settle(true);
    }
  }, [disabled, prefersReducedMotion, settle]);

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const hasFinePointer = window.matchMedia(
      "(hover: hover) and (pointer: fine)",
    ).matches;

    if (
      disabled ||
      prefersReducedMotion ||
      event.pointerType !== "mouse" ||
      !hasFinePointer
    ) {
      settle(true);
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const rawX = (event.clientX - (bounds.left + bounds.width / 2)) * strength;
    const rawY = (event.clientY - (bounds.top + bounds.height / 2)) * strength;
    const distance = Math.hypot(rawX, rawY);
    const maxOffset = Math.max(0, radiusPx);
    const scale = distance > maxOffset && distance > 0 ? maxOffset / distance : 1;

    x.set(rawX * scale);
    y.set(rawY * scale);
  };

  const motionDisabled = Boolean(prefersReducedMotion || disabled);

  return (
    <motion.div
      className={cn("inline-flex", className)}
      style={motionDisabled ? { x: 0, y: 0 } : { x: springX, y: springY }}
      onPointerMove={handlePointerMove}
      onPointerLeave={() => settle(motionDisabled)}
      data-magnetic-disabled={motionDisabled || undefined}
    >
      {children}
    </motion.div>
  );
}
