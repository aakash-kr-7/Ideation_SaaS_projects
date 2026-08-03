"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
} from "react";

const DEFAULT_DURATION_SECONDS = 0.8;
const ALPHANUMERIC_GLYPHS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function scrambledSeed(text: string) {
  return Array.from(text, (character, index) => {
    if (/\s/.test(character)) return character;
    return ALPHANUMERIC_GLYPHS[(index * 17 + text.length) % ALPHANUMERIC_GLYPHS.length];
  }).join("");
}

export interface ScrambleRevealProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children" | "aria-hidden"> {
  text: string;
  durationSeconds?: number;
  play?: boolean;
  onComplete?: () => void;
}

/**
 * Resolves an alphanumeric scramble from left to right exactly once per mount.
 * The visual text is hidden from assistive technology so it only encounters the
 * final, stable copy.
 */
export function ScrambleReveal({
  text,
  durationSeconds = DEFAULT_DURATION_SECONDS,
  play = true,
  onComplete,
  className,
  ...props
}: ScrambleRevealProps) {
  const visualTextRef = useRef<HTMLSpanElement>(null);
  const playedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useLayoutEffect(() => {
    const visualText = visualTextRef.current;
    if (!visualText) return;

    visualText.textContent = text;
    if (!play || playedRef.current) return;

    const safeDuration = Number.isFinite(durationSeconds)
      ? Math.max(0, durationSeconds)
      : DEFAULT_DURATION_SECONDS;
    let cancelled = false;
    let completed = false;
    let frame = 0;
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let tween: { kill: () => void } | null = null;

    const complete = () => {
      if (cancelled || completed) return;
      completed = true;
      visualText.textContent = text;
      onCompleteRef.current?.();
    };

    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      tween?.kill();
      complete();
    };

    if (motionQuery.matches || safeDuration === 0) {
      playedRef.current = true;
      complete();
      return;
    }

    // Swap the stable SSR copy for deterministic alphanumeric noise in the
    // layout phase, before the frame is painted.
    visualText.textContent = scrambledSeed(text);
    motionQuery.addEventListener("change", handleMotionPreferenceChange);

    // React Strict Mode runs an effect setup/cleanup probe. Waiting one frame
    // prevents that probe from consuming this mount's one-shot animation.
    frame = window.requestAnimationFrame(() => {
      if (cancelled || playedRef.current) return;
      playedRef.current = true;

      void Promise.all([
        import("gsap"),
        import("gsap/ScrambleTextPlugin"),
      ])
        .then(([{ gsap }, { ScrambleTextPlugin }]) => {
          if (cancelled || completed) return;

          gsap.registerPlugin(ScrambleTextPlugin);
          tween = gsap.to(visualText, {
            duration: safeDuration,
            ease: "none",
            scrambleText: {
              text,
              chars: ALPHANUMERIC_GLYPHS,
              revealDelay: 0,
              rightToLeft: false,
              tweenLength: false,
            },
            onComplete: complete,
          });
        })
        .catch(() => {
          // A loading failure must never leave product copy unresolved.
          complete();
        });
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      motionQuery.removeEventListener(
        "change",
        handleMotionPreferenceChange,
      );
      tween?.kill();
      visualText.textContent = text;
    };
  }, [durationSeconds, play, text]);

  return (
    <span className={className} {...props}>
      <span className="sr-only">{text}</span>
      <span ref={visualTextRef} aria-hidden="true">
        {text}
      </span>
    </span>
  );
}
