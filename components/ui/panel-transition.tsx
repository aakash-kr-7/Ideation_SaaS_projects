"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type HTMLMotionProps,
} from "framer-motion";
import type { Key, ReactNode } from "react";
import { sbMotion } from "@/lib/motion";

type MotionDivProps = Omit<HTMLMotionProps<"div">, "children">;
export type PanelTransitionVariant = "panel" | "popover" | "drawer-left" | "fade";

export interface PanelTransitionProps extends MotionDivProps {
  children: ReactNode;
  isOpen: boolean;
  presenceKey?: Key;
  variant?: PanelTransitionVariant;
}

function states(variant: PanelTransitionVariant) {
  switch (variant) {
    case "fade":
      return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } };
    case "drawer-left":
      return { initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -8 } };
    case "popover":
      return { initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };
    default:
      return {
        initial: { height: 0, opacity: 0, y: -8 },
        animate: { height: "auto", opacity: 1, y: 0 },
        exit: { height: 0, opacity: 0, y: -8 },
      };
  }
}

export function PanelTransition({
  children,
  isOpen,
  presenceKey = "panel",
  variant = "panel",
  ...props
}: PanelTransitionProps) {
  const prefersReducedMotion = useReducedMotion();
  const motionStates = states(variant);

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          key={presenceKey}
          initial={prefersReducedMotion ? false : motionStates.initial}
          animate={motionStates.animate}
          exit={motionStates.exit}
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { duration: sbMotion.duration.base, ease: sbMotion.ease }
          }
          {...props}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export interface ModalTransitionProps {
  children: ReactNode;
  isOpen: boolean;
  overlayContent?: ReactNode;
  overlayProps?: MotionDivProps;
  panelProps?: MotionDivProps;
  presenceKey?: Key;
}

export function ModalTransition({
  children,
  isOpen,
  overlayContent,
  overlayProps,
  panelProps,
  presenceKey = "modal",
}: ModalTransitionProps) {
  const prefersReducedMotion = useReducedMotion();
  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { duration: sbMotion.duration.base, ease: sbMotion.ease };

  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          key={presenceKey}
          initial={prefersReducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={transition}
          {...overlayProps}
        >
          {overlayContent}
          <motion.div
            initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={transition}
            {...panelProps}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
