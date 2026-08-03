"use client";

import {
  Children,
  useLayoutEffect,
  useState,
  type ReactNode,
} from "react";
import {
  motion,
  useAnimationControls,
  useReducedMotion,
  type HTMLMotionProps,
} from "framer-motion";
import { cn } from "@/lib/utils";
import { sbMotion } from "@/lib/motion";

const renderedThisSession = new Set<string>();
const STORAGE_PREFIX = "sb-motion-rendered:";

function wasRendered(sessionKey: string) {
  if (renderedThisSession.has(sessionKey)) return true;
  try {
    return window.sessionStorage.getItem(`${STORAGE_PREFIX}${sessionKey}`) === "1";
  } catch {
    return false;
  }
}

function rememberRendered(sessionKey: string) {
  renderedThisSession.add(sessionKey);
  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${sessionKey}`, "1");
  } catch {
    // Module memory still provides a one-shot gate without sessionStorage.
  }
}

export function useFirstSessionMotion(sessionKey: string) {
  const prefersReducedMotion = useReducedMotion();
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useLayoutEffect(() => {
    if (prefersReducedMotion || wasRendered(sessionKey)) {
      rememberRendered(sessionKey);
      setShouldAnimate(false);
      return;
    }

    setShouldAnimate(true);
    const frame = window.requestAnimationFrame(() => {
      rememberRendered(sessionKey);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [prefersReducedMotion, sessionKey]);

  return shouldAnimate;
}

export interface StaggerGroupProps
  extends Omit<HTMLMotionProps<"div">, "children"> {
  children: ReactNode;
  animateEntrance: boolean;
  durationMs?: number;
  itemClassName?: string;
  maxItems?: number;
  stepMs?: number;
}

export function StaggerGroup({
  children,
  animateEntrance,
  durationMs = 200,
  itemClassName,
  maxItems = 10,
  stepMs = 70,
  ...props
}: StaggerGroupProps) {
  const controls = useAnimationControls();
  const prefersReducedMotion = useReducedMotion();
  const safeDuration = Math.min(300, Math.max(150, durationMs)) / 1000;
  const safeStep = Math.min(80, Math.max(0, stepMs)) / 1000;
  const cappedItems = Math.max(0, Math.floor(maxItems));

  useLayoutEffect(() => {
    if (!animateEntrance || prefersReducedMotion) {
      controls.set("visible");
      return;
    }

    controls.set("hidden");
    void controls.start("visible");
  }, [animateEntrance, controls, prefersReducedMotion]);

  return (
    <motion.div initial={false} animate={controls} {...props}>
      {Children.map(children, (child, index) => {
        if (index >= cappedItems) {
          return <div className={itemClassName}>{child}</div>;
        }
        return (
          <motion.div
            className={cn(itemClassName)}
            variants={{
              hidden: { opacity: 0, y: 8 },
              visible: {
                opacity: 1,
                y: 0,
                transition: {
                  duration: prefersReducedMotion ? 0 : safeDuration,
                  delay: prefersReducedMotion ? 0 : index * safeStep,
                  ease: sbMotion.ease,
                },
              },
            }}
          >
            {child}
          </motion.div>
        );
      })}
    </motion.div>
  );
}

export interface FirstSessionStaggerProps
  extends Omit<StaggerGroupProps, "animateEntrance"> {
  sessionKey: string;
}

export function FirstSessionStagger({
  sessionKey,
  ...props
}: FirstSessionStaggerProps) {
  const animateEntrance = useFirstSessionMotion(sessionKey);
  return <StaggerGroup animateEntrance={animateEntrance} {...props} />;
}
