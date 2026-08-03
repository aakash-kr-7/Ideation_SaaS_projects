"use client";

import {
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { sbMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

const revealedThisSession = new Set<string>();
const STORAGE_PREFIX = "sb-scroll-reveal:";

function wasRevealed(sessionKey: string) {
  if (revealedThisSession.has(sessionKey)) return true;

  try {
    return window.sessionStorage.getItem(`${STORAGE_PREFIX}${sessionKey}`) === "1";
  } catch {
    return false;
  }
}

function rememberReveal(sessionKey: string) {
  revealedThisSession.add(sessionKey);

  try {
    window.sessionStorage.setItem(`${STORAGE_PREFIX}${sessionKey}`, "1");
  } catch {
    // Module memory still provides a one-shot gate when storage is unavailable.
  }
}

export interface ScrollRevealProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  children: ReactNode;
  sessionKey: string;
  splitSelector?: string | false;
  itemSelector?: string | false;
  durationMs?: number;
  stepMs?: number;
  maxItems?: number;
  translateY?: number;
  blurPx?: number;
  start?: string;
}

/**
 * One-shot supporting-content reveal shared by Tier 2-adjacent sales surfaces.
 * Text uses the landing page's SplitText treatment while non-text items can
 * share the same ScrollTrigger without introducing page-specific timelines.
 */
export function ScrollReveal({
  children,
  sessionKey,
  splitSelector = "[data-scroll-reveal-text]",
  itemSelector = "[data-scroll-reveal-item]",
  durationMs = 360,
  stepMs = 60,
  maxItems = 18,
  translateY = 8,
  blurPx = 6,
  start = "top 88%",
  className,
  ...props
}: ScrollRevealProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const shouldAnimate = !motionQuery.matches && !wasRevealed(sessionKey);
    let cancelled = false;
    let disabledByPreference = false;
    let setupFrame = 0;
    let activeCleanup: (() => void) | undefined;

    const settleImmediately = () => {
      activeCleanup?.();
      activeCleanup = undefined;
      root.dataset.scrollReveal = "settled";
    };

    if (!shouldAnimate) {
      rememberReveal(sessionKey);
      settleImmediately();
      return;
    }

    root.dataset.scrollReveal = "preparing";

    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      disabledByPreference = true;
      rememberReveal(sessionKey);
      window.cancelAnimationFrame(setupFrame);
      settleImmediately();
    };

    motionQuery.addEventListener("change", handleMotionPreferenceChange);

    // A frame boundary keeps the session gate safe through Strict Mode's
    // setup/cleanup probe and mirrors the landing sequence setup.
    setupFrame = window.requestAnimationFrame(() => {
      if (cancelled || disabledByPreference) return;

      void Promise.all([
        import("gsap"),
        import("gsap/CustomEase"),
        import("gsap/ScrollTrigger"),
        import("gsap/SplitText"),
      ])
        .then(async ([{ gsap }, { CustomEase }, { ScrollTrigger }, { SplitText }]) => {
          if ("fonts" in document) await document.fonts.ready;
          if (cancelled || disabledByPreference) return;

          gsap.registerPlugin(CustomEase, ScrollTrigger, SplitText);
          const standardEase = CustomEase.create(
            sbMotion.gsapEase.name,
            sbMotion.gsapEase.definition,
          );

          const splitInstances: Array<{ lines: Element[]; revert: () => void }> = [];
          let tween: ReturnType<typeof gsap.from> | undefined;
          let trigger: ReturnType<typeof ScrollTrigger.create> | undefined;

          const context = gsap.context(() => {
            const splitTargets = splitSelector
              ? gsap.utils.toArray<HTMLElement>(splitSelector, root)
              : [];

            splitTargets.forEach((element) => {
              splitInstances.push(SplitText.create(element, {
                type: "lines",
                mask: "lines",
                aria: "auto",
              }));
            });

            const splitLines = splitInstances.flatMap((split) => split.lines);
            const itemTargets = itemSelector
              ? gsap.utils.toArray<HTMLElement>(itemSelector, root)
              : [];
            const targets = [...splitLines, ...itemTargets]
              .slice(0, Math.max(0, Math.floor(maxItems)));

            if (!targets.length) {
              rememberReveal(sessionKey);
              root.dataset.scrollReveal = "settled";
              return;
            }

            tween = gsap.from(targets, {
              paused: true,
              autoAlpha: 0,
              y: translateY,
              filter: blurPx > 0 ? `blur(${blurPx}px)` : "none",
              duration: Math.max(0.15, Math.min(0.55, durationMs / 1000)),
              stagger: Math.max(0, Math.min(0.08, stepMs / 1000)),
              ease: standardEase,
              onComplete: () => {
                root.dataset.scrollReveal = "settled";
              },
            });

            trigger = ScrollTrigger.create({
              trigger: root,
              start,
              once: true,
              onEnter: () => {
                rememberReveal(sessionKey);
                root.dataset.scrollReveal = "playing";
                tween?.play();
              },
            });
          }, root);

          const refreshFrame = window.requestAnimationFrame(() => ScrollTrigger.refresh());

          activeCleanup = () => {
            window.cancelAnimationFrame(refreshFrame);
            trigger?.kill();
            tween?.kill();
            context.revert();
            splitInstances.forEach((split) => split.revert());
            root.dataset.scrollReveal = "settled";
          };
        })
        .catch(() => {
          settleImmediately();
        });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(setupFrame);
      motionQuery.removeEventListener("change", handleMotionPreferenceChange);
      activeCleanup?.();
    };
  }, [blurPx, durationMs, itemSelector, maxItems, sessionKey, splitSelector, start, stepMs, translateY]);

  return (
    <div ref={rootRef} className={cn(className)} {...props}>
      {children}
    </div>
  );
}
