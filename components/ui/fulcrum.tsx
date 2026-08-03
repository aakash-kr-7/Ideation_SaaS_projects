"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type RefObject,
} from "react";
import {
  EvidenceBadge,
  type EvidenceBadgeProps,
  type EvidenceTier,
} from "@/components/ui/evidence-badge";
import {
  normalizeVerdict,
  VerdictBadge,
  type VerdictBadgeProps,
} from "@/components/ui/verdict-badge";
import { cn } from "@/lib/utils";

export type FulcrumSide = "prosecution" | "defence";

interface FulcrumEvidenceChipBase {
  id: string;
  label: string;
  side: FulcrumSide;
  weight: number;
}

export type FulcrumEvidenceChip = FulcrumEvidenceChipBase &
  (
    | ({ tier: EvidenceTier; statusLabel?: never } & Pick<
        EvidenceBadgeProps,
        "whatWasFound" | "sourceCount" | "independenceGrouping" | "freshnessDate"
      >)
    | ({ tier?: never; statusLabel: string } & Partial<
        Pick<
          EvidenceBadgeProps,
          "whatWasFound" | "sourceCount" | "independenceGrouping" | "freshnessDate"
        >
      >)
  );

type FulcrumBaseProps = Omit<HTMLAttributes<HTMLElement>, "children"> & {
  entries: FulcrumEvidenceChip[];
  animate?: boolean;
  tallyLabel?: string;
  showEntries?: boolean;
  showEntryWeights?: boolean;
  showPanLabels?: boolean;
  showTally?: boolean;
  showVerdictBadge?: boolean;
  maxVisibleEntriesPerSide?: number;
  onComplete?: () => void;
};

export type FulcrumProps = FulcrumBaseProps &
  (
    | {
        motionMode?: "sequence";
        score: number;
        verdict: VerdictBadgeProps["verdict"];
        play?: boolean;
      }
    | {
        motionMode: "append";
        score?: never;
        verdict?: never;
        play?: never;
      }
    | {
        motionMode: "readout";
        score?: never;
        verdict?: never;
        play?: never;
      }
  );

const VIEWBOX_WIDTH = 760;
const VIEWBOX_HEIGHT = 360;
const PIVOT_X = 380;
const PIVOT_Y = 100;
const HALF_BEAM = 250;
const LEFT_ANCHOR_X = PIVOT_X - HALF_BEAM;
const RIGHT_ANCHOR_X = PIVOT_X + HALF_BEAM;
const CHIP_CENTER_Y = 175;
const MAX_TILT = 12;

function clamp(minimum: number, maximum: number, value: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function safeWeight(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function accumulatedTilt(leftWeight: number, rightWeight: number) {
  return clamp(-MAX_TILT, MAX_TILT, rightWeight - leftWeight);
}

function relativeTilt(leftWeight: number, rightWeight: number) {
  const total = leftWeight + rightWeight;
  if (total === 0) return 0;
  return clamp(
    -MAX_TILT,
    MAX_TILT,
    ((rightWeight - leftWeight) / total) * MAX_TILT,
  );
}

export function getFulcrumRestingTilt(
  verdict: VerdictBadgeProps["verdict"],
  leftWeight: number,
  rightWeight: number,
) {
  const state = normalizeVerdict(String(verdict));
  const difference = rightWeight - leftWeight;
  const magnitude = Math.abs(difference);

  if (state === "build") return clamp(7, MAX_TILT, magnitude || 7);
  if (state === "kill") return -clamp(7, MAX_TILT, magnitude || 7);
  if (state === "avoid") return -clamp(3, 6, magnitude || 3);
  if (difference === 0) return 0;

  return Math.sign(difference) * clamp(2, 6, magnitude);
}

function panOffset(angle: number, side: FulcrumSide) {
  const radians = (angle * Math.PI) / 180;
  const direction = side === "prosecution" ? -1 : 1;
  const baseX = side === "prosecution" ? LEFT_ANCHOR_X : RIGHT_ANCHOR_X;
  const endpointX = PIVOT_X + direction * HALF_BEAM * Math.cos(radians);
  const endpointY = PIVOT_Y + direction * HALF_BEAM * Math.sin(radians);

  return {
    dx: endpointX - baseX,
    dy: endpointY - PIVOT_Y,
    x: endpointX,
  };
}

function setLineProgress(root: HTMLElement, progress: 0 | 1) {
  root.querySelectorAll<SVGGeometryElement>("[data-fulcrum-line]").forEach((line) => {
    line.style.strokeDashoffset = progress === 1 ? "0" : "1";
  });
}

export function Fulcrum({
  entries,
  score,
  verdict,
  motionMode = "sequence",
  animate = false,
  play = false,
  tallyLabel = motionMode === "append" ? "Findings tally" : "Weight tally",
  showEntries = true,
  showEntryWeights = motionMode !== "append",
  showPanLabels = true,
  showTally = true,
  showVerdictBadge = true,
  maxVisibleEntriesPerSide,
  onComplete,
  className,
  ...props
}: FulcrumProps) {
  const appendMode = motionMode === "append";
  const readoutMode = motionMode === "readout";
  const liveMode = appendMode || readoutMode;
  const rootRef = useRef<HTMLElement>(null);
  const beamRef = useRef<SVGGElement>(null);
  const prosecutionPanRef = useRef<SVGGElement>(null);
  const defencePanRef = useRef<SVGGElement>(null);
  const prosecutionChipsRef = useRef<HTMLDivElement>(null);
  const defenceChipsRef = useRef<HTMLDivElement>(null);
  const tallyRef = useRef<HTMLSpanElement>(null);
  const verdictRef = useRef<HTMLDivElement>(null);
  const onCompleteRef = useRef(onComplete);
  const appendSeenIdsRef = useRef<Set<string> | null>(null);
  const appendTimelinesRef = useRef<Set<{ kill: () => void }>>(new Set());
  const appendQueueUntilRef = useRef(0);
  const appendAngleRef = useRef(0);
  const appendMountedRef = useRef(true);
  const [settled, setSettled] = useState(!animate || liveMode);

  onCompleteRef.current = onComplete;

  const totals = useMemo(
    () =>
      entries.reduce(
        (current, entry) => {
          current[entry.side] += safeWeight(entry.weight);
          return current;
        },
        { prosecution: 0, defence: 0 },
      ),
    [entries],
  );
  const restingTilt = readoutMode
    ? relativeTilt(totals.prosecution, totals.defence)
    : appendMode
      ? accumulatedTilt(totals.prosecution, totals.defence)
      : getFulcrumRestingTilt(
          verdict ?? "conditional",
          totals.prosecution,
          totals.defence,
        );
  const visibleTilt = liveMode || settled || !animate ? restingTilt : 0;
  const prosecutionOffset = panOffset(visibleTilt, "prosecution");
  const defenceOffset = panOffset(visibleTilt, "defence");
  const tallyText = liveMode
    ? `${formatNumber(totals.prosecution)}:${formatNumber(totals.defence)}`
    : `${formatNumber(score ?? 0)}/100`;
  const sequenceState = liveMode
    ? "live"
    : settled || !animate
      ? "settled"
      : play
        ? "playing"
        : "preparing";

  useEffect(() => {
    const appendTimelines = appendTimelinesRef.current;
    appendMountedRef.current = true;
    return () => {
      appendMountedRef.current = false;
      appendTimelines.forEach((timeline) => timeline.kill());
      appendTimelines.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let cancelled = false;
    let context: { revert: () => void } | undefined;

    const applyTilt = (angle: number) => {
      const prosecution = panOffset(angle, "prosecution");
      const defence = panOffset(angle, "defence");

      beamRef.current?.setAttribute(
        "transform",
        `rotate(${angle} ${PIVOT_X} ${PIVOT_Y})`,
      );
      prosecutionPanRef.current?.setAttribute(
        "transform",
        `translate(${prosecution.dx} ${prosecution.dy})`,
      );
      defencePanRef.current?.setAttribute(
        "transform",
        `translate(${defence.dx} ${defence.dy})`,
      );

      if (prosecutionChipsRef.current) {
        prosecutionChipsRef.current.style.left = `${(prosecution.x / VIEWBOX_WIDTH) * 100}%`;
        prosecutionChipsRef.current.style.top = `${((CHIP_CENTER_Y + prosecution.dy) / VIEWBOX_HEIGHT) * 100}%`;
      }
      if (defenceChipsRef.current) {
        defenceChipsRef.current.style.left = `${(defence.x / VIEWBOX_WIDTH) * 100}%`;
        defenceChipsRef.current.style.top = `${((CHIP_CENTER_Y + defence.dy) / VIEWBOX_HEIGHT) * 100}%`;
      }

      root.dataset.fulcrumAngle = formatNumber(angle);
    };

    const settleImmediately = () => {
      context?.revert();
      context = undefined;
      if (appendMode) {
        appendTimelinesRef.current.forEach((timeline) => timeline.kill());
        appendTimelinesRef.current.clear();
        appendQueueUntilRef.current = 0;
        appendAngleRef.current = restingTilt;
      }
      setLineProgress(root, 1);
      applyTilt(restingTilt);
      if (tallyRef.current) tallyRef.current.textContent = tallyText;
      root.querySelectorAll<HTMLElement>("[data-fulcrum-chip]").forEach((element) => {
        element.style.removeProperty("opacity");
        element.style.removeProperty("visibility");
        element.style.removeProperty("transform");
      });
      root.querySelectorAll<SVGElement>("[data-fulcrum-fill]").forEach((element) => {
          element.style.removeProperty("opacity");
          element.style.removeProperty("visibility");
          element.style.removeProperty("transform");
      });
      if (verdictRef.current) {
        verdictRef.current.style.removeProperty("opacity");
        verdictRef.current.style.removeProperty("visibility");
        verdictRef.current.style.removeProperty("transform");
      }
      setSettled(true);
    };

    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      if (event.matches) settleImmediately();
    };

    motionQuery.addEventListener("change", handleMotionPreferenceChange);

    if (readoutMode) {
      setSettled(true);
      setLineProgress(root, 1);
      applyTilt(restingTilt);
      if (tallyRef.current) tallyRef.current.textContent = tallyText;
      root.querySelectorAll<HTMLElement>("[data-fulcrum-chip]").forEach((element) => {
        element.style.removeProperty("opacity");
        element.style.removeProperty("visibility");
        element.style.removeProperty("transform");
      });

      return () => {
        motionQuery.removeEventListener("change", handleMotionPreferenceChange);
      };
    }

    if (appendMode) {
      setSettled(true);
      setLineProgress(root, 1);

      const currentIds = entries.map((entry) => entry.id);
      if (appendSeenIdsRef.current === null) {
        appendSeenIdsRef.current = new Set(currentIds);
        appendAngleRef.current = restingTilt;
        applyTilt(restingTilt);
        if (tallyRef.current) tallyRef.current.textContent = tallyText;
        return () => {
          motionQuery.removeEventListener("change", handleMotionPreferenceChange);
        };
      }

      const seenIds = appendSeenIdsRef.current;
      const newEntries = entries.filter((entry) => !seenIds.has(entry.id));
      newEntries.forEach((entry) => seenIds.add(entry.id));

      if (!newEntries.length) {
        appendAngleRef.current = restingTilt;
        applyTilt(restingTilt);
        if (tallyRef.current) tallyRef.current.textContent = tallyText;
        return () => {
          motionQuery.removeEventListener("change", handleMotionPreferenceChange);
        };
      }

      const newIds = new Set(newEntries.map((entry) => entry.id));
      const startingTotals = entries.reduce(
        (current, entry) => {
          if (!newIds.has(entry.id)) current[entry.side] += safeWeight(entry.weight);
          return current;
        },
        { prosecution: 0, defence: 0 },
      );
      const chipsById = new Map(
        Array.from(root.querySelectorAll<HTMLElement>("[data-fulcrum-chip]")).map(
          (chip) => [chip.dataset.fulcrumChip, chip],
        ),
      );

      newEntries.forEach((entry) => {
        const chip = chipsById.get(entry.id);
        if (!chip) return;
        chip.style.opacity = "0";
        chip.style.visibility = "hidden";
        chip.style.transform = "translateY(-10px) scale(0.985)";
      });

      if (!animate || motionQuery.matches) {
        settleImmediately();
        return () => {
          motionQuery.removeEventListener("change", handleMotionPreferenceChange);
        };
      }

      const now = window.performance.now();
      const queueDelay = Math.max(0, appendQueueUntilRef.current - now) / 1_000;
      const batchDuration = 0.34 + Math.max(0, newEntries.length - 1) * 0.18;
      appendQueueUntilRef.current = Math.max(now, appendQueueUntilRef.current) + batchDuration * 1_000;

      void import("gsap")
        .then(({ gsap }) => {
          if (!appendMountedRef.current || motionQuery.matches) {
            settleImmediately();
            return;
          }

          const tilt = {
            angle: accumulatedTilt(startingTotals.prosecution, startingTotals.defence),
          };
          let prosecutionWeight = startingTotals.prosecution;
          let defenceWeight = startingTotals.defence;
          const timeline = gsap.timeline({
            onComplete: () => {
              appendTimelinesRef.current.delete(timeline);
              appendAngleRef.current = restingTilt;
              applyTilt(restingTilt);
              if (tallyRef.current) tallyRef.current.textContent = tallyText;
              onCompleteRef.current?.();
            },
          });
          appendTimelinesRef.current.add(timeline);
          timeline.call(() => {
            applyTilt(tilt.angle);
            if (tallyRef.current) {
              tallyRef.current.textContent = `${formatNumber(startingTotals.prosecution)}:${formatNumber(startingTotals.defence)}`;
            }
          }, [], queueDelay);

          newEntries.forEach((entry, index) => {
            const chip = chipsById.get(entry.id);
            const dropAt = queueDelay + index * 0.18;
            const landingAt = dropAt + 0.12;
            const weight = safeWeight(entry.weight);

            if (entry.side === "prosecution") prosecutionWeight += weight;
            else defenceWeight += weight;

            const nextTilt = accumulatedTilt(prosecutionWeight, defenceWeight);
            const nextTally = `${formatNumber(prosecutionWeight)}:${formatNumber(defenceWeight)}`;

            if (chip) {
              timeline.fromTo(
                chip,
                { autoAlpha: 0, y: -10, scale: 0.985 },
                {
                  autoAlpha: 1,
                  y: 0,
                  scale: 1,
                  duration: 0.22,
                  ease: "power2.out",
                },
                dropAt,
              );
            }

            timeline
              .call(() => {
                if (tallyRef.current) tallyRef.current.textContent = nextTally;
              }, [], landingAt)
              .to(
                tilt,
                {
                  angle: nextTilt,
                  duration: 0.15,
                  ease: "power2.out",
                  overwrite: "auto",
                  onUpdate: () => {
                    appendAngleRef.current = tilt.angle;
                    applyTilt(tilt.angle);
                  },
                },
                landingAt,
              );
          });
        })
        .catch(() => settleImmediately());

      return () => {
        motionQuery.removeEventListener("change", handleMotionPreferenceChange);
      };
    }

    if (!animate || motionQuery.matches) {
      settleImmediately();
      return () => {
        cancelled = true;
        motionQuery.removeEventListener("change", handleMotionPreferenceChange);
      };
    }

    setSettled(false);
    setLineProgress(root, 0);
    applyTilt(0);
    root
      .querySelectorAll<HTMLElement>("[data-fulcrum-chip]")
      .forEach((element) => {
        element.style.opacity = "0";
        element.style.visibility = "hidden";
        element.style.transform = "translateY(-30px) scale(0.97)";
      });
    root.querySelectorAll<SVGElement>("[data-fulcrum-fill]").forEach((element) => {
      element.style.opacity = "0";
      element.style.visibility = "hidden";
    });
    if (verdictRef.current) {
      verdictRef.current.style.opacity = "0";
      verdictRef.current.style.visibility = "hidden";
      verdictRef.current.style.transform = "translateY(5px)";
    }

    if (!play) {
      return () => {
        cancelled = true;
        motionQuery.removeEventListener("change", handleMotionPreferenceChange);
      };
    }

    void import("gsap")
      .then(({ gsap }) => {
        if (cancelled || motionQuery.matches) return;

        context = gsap.context(() => {
          const lines = gsap.utils.toArray<SVGGeometryElement>(
            "[data-fulcrum-line]",
            root,
          );
          const fills = gsap.utils.toArray<SVGElement>("[data-fulcrum-fill]", root);
          const chips = gsap.utils.toArray<HTMLElement>("[data-fulcrum-chip]", root);
          const chipsById = new Map(
            chips.map((chip) => [chip.dataset.fulcrumChip, chip]),
          );
          const tilt = { angle: 0 };

          gsap.set(lines, { strokeDashoffset: 1 });
          gsap.set(fills, { autoAlpha: 0 });
          gsap.set(chips, { autoAlpha: 0, y: -30, scale: 0.97 });
          if (verdictRef.current) {
            gsap.set(verdictRef.current, { autoAlpha: 0, y: 5 });
          }
          if (tallyRef.current) tallyRef.current.textContent = "0:0";
          applyTilt(0);

          let prosecutionWeight = 0;
          let defenceWeight = 0;
          const timeline = gsap.timeline({
            defaults: { ease: "power2.out" },
            onComplete: () => {
              if (cancelled) return;
              applyTilt(restingTilt);
              setSettled(true);
              onCompleteRef.current?.();
            },
          });

          timeline
            .to(
              lines,
              {
                strokeDashoffset: 0,
                duration: 0.46,
                stagger: { each: 0.012, from: "start" },
                ease: "power1.inOut",
              },
              0,
            )
            .to(fills, { autoAlpha: 1, duration: 0.18, stagger: 0.025 }, 0.28);

          entries.forEach((entry, index) => {
            const chip = chipsById.get(entry.id);
            const dropAt = 0.46 + index * 0.18;
            const landingAt = dropAt + 0.22;
            const weight = safeWeight(entry.weight);

            if (entry.side === "prosecution") prosecutionWeight += weight;
            else defenceWeight += weight;

            const nextTilt = accumulatedTilt(prosecutionWeight, defenceWeight);
            const nextTally = `${formatNumber(prosecutionWeight)}:${formatNumber(defenceWeight)}`;

            if (chip) {
              timeline.fromTo(
                chip,
                { autoAlpha: 0, y: -30, scale: 0.97 },
                {
                  autoAlpha: 1,
                  y: 0,
                  scale: 1,
                  duration: 0.36,
                  ease: "elastic.out(1, 0.6)",
                },
                dropAt,
              );
            }

            timeline
              .call(() => {
                if (tallyRef.current) tallyRef.current.textContent = nextTally;
              }, [], landingAt)
              .to(
                tilt,
                {
                  angle: nextTilt,
                  duration: 0.17,
                  ease: "power2.out",
                  onUpdate: () => applyTilt(tilt.angle),
                },
                landingAt,
              );
          });

          const lastDropAt = 0.46 + Math.max(0, entries.length - 1) * 0.18;
          const finalRestAt = entries.length ? lastDropAt + 0.4 : 0.5;
          const scoreLockAt = finalRestAt + 0.26;

          timeline
            .to(
              tilt,
              {
                angle: restingTilt,
                duration: 0.26,
                ease: "power3.out",
                onUpdate: () => applyTilt(tilt.angle),
              },
              finalRestAt,
            )
            .call(() => {
              applyTilt(restingTilt);
              if (tallyRef.current) tallyRef.current.textContent = tallyText;
            }, [], scoreLockAt);

          if (verdictRef.current) {
            timeline.to(
              verdictRef.current,
              { autoAlpha: 1, y: 0, duration: 0.18, ease: "power1.out" },
              scoreLockAt + 0.04,
            );
          }
        }, root);
      })
      .catch(() => {
        if (!cancelled) settleImmediately();
      });

    return () => {
      cancelled = true;
      motionQuery.removeEventListener("change", handleMotionPreferenceChange);
      context?.revert();
    };
  }, [animate, appendMode, entries, play, readoutMode, restingTilt, tallyText]);

  const visibleEntries = (side: FulcrumSide) => {
    const sideEntries = entries.filter((entry) => entry.side === side);
    if (!Number.isFinite(maxVisibleEntriesPerSide)) return sideEntries;

    const limit = Math.max(1, Math.floor(maxVisibleEntriesPerSide ?? 1));
    if (readoutMode) {
      return [...sideEntries]
        .sort(
          (left, right) =>
            right.weight - left.weight || left.label.localeCompare(right.label),
        )
        .slice(0, limit);
    }
    return sideEntries.slice(-limit);
  };

  const accessibleLabel = readoutMode
    ? `Live scoring balance. Case against ${formatNumber(totals.prosecution)}. Case for ${formatNumber(totals.defence)}.`
    : appendMode
      ? `Live accepted-evidence balance. Prosecution findings ${formatNumber(totals.prosecution)}. Defence findings ${formatNumber(totals.defence)}.`
      : `Evidence balance. Prosecution weight ${formatNumber(totals.prosecution)} percent. Defence weight ${formatNumber(totals.defence)} percent. Readiness Score ${formatNumber(score ?? 0)} out of 100. Verdict ${normalizeVerdict(String(verdict))}.`;

  return (
    <section
      ref={rootRef}
      className={cn("relative isolate overflow-visible", className)}
      data-fulcrum-angle={formatNumber(visibleTilt)}
      data-fulcrum-state={sequenceState}
      aria-label={accessibleLabel}
      {...props}
    >
      <div className="relative aspect-[19/9] w-full overflow-visible">
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full overflow-visible"
          viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        >
          <g
            fill="none"
            stroke="var(--sb-border-hairline-strong)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          >
            <path
              d="M380 116 L326 276 H434 Z"
              data-fulcrum-line
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={settled || !animate ? 0 : 1}
            />
            <path
              d="M300 276 H460"
              data-fulcrum-line
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={settled || !animate ? 0 : 1}
            />
            <path
              d="M380 116 V258"
              data-fulcrum-line
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={settled || !animate ? 0 : 1}
            />
            <circle
              cx="380"
              cy="100"
              data-fulcrum-line
              pathLength="1"
              r="9"
              strokeDasharray="1"
              strokeDashoffset={settled || !animate ? 0 : 1}
            />
          </g>

          <g
            ref={beamRef}
            className={cn(
              readoutMode &&
                animate &&
                "transition-transform duration-[150ms] ease-linear",
            )}
            transform={`rotate(${visibleTilt} ${PIVOT_X} ${PIVOT_Y})`}
          >
            <path
              d={`M${LEFT_ANCHOR_X} ${PIVOT_Y} H${RIGHT_ANCHOR_X}`}
              data-fulcrum-line
              fill="none"
              pathLength="1"
              stroke="var(--sb-border-hairline-strong)"
              strokeDasharray="1"
              strokeDashoffset={settled || !animate ? 0 : 1}
              strokeLinecap="round"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d="M350 100 H410"
              data-fulcrum-line
              fill="none"
              pathLength="1"
              stroke="var(--sb-accent)"
              strokeDasharray="1"
              strokeDashoffset={settled || !animate ? 0 : 1}
              strokeLinecap="round"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={LEFT_ANCHOR_X}
              cy={PIVOT_Y}
              data-fulcrum-line
              fill="none"
              pathLength="1"
              r="3"
              stroke="var(--sb-border-hairline-strong)"
              strokeDasharray="1"
              strokeDashoffset={settled || !animate ? 0 : 1}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={RIGHT_ANCHOR_X}
              cy={PIVOT_Y}
              data-fulcrum-line
              fill="none"
              pathLength="1"
              r="3"
              stroke="var(--sb-border-hairline-strong)"
              strokeDasharray="1"
              strokeDashoffset={settled || !animate ? 0 : 1}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </g>

          <Pan
            label="PROSECUTION"
            panRef={prosecutionPanRef}
            side="prosecution"
            showLabel={showPanLabels}
            transform={`translate(${prosecutionOffset.dx} ${prosecutionOffset.dy})`}
            transitionTilt={readoutMode && animate}
            visible={settled || !animate}
          />
          <Pan
            label="DEFENCE"
            panRef={defencePanRef}
            side="defence"
            showLabel={showPanLabels}
            transform={`translate(${defenceOffset.dx} ${defenceOffset.dy})`}
            transitionTilt={readoutMode && animate}
            visible={settled || !animate}
          />
        </svg>

        {showEntries && (
          <>
            <ChipStack
              entries={visibleEntries("prosecution")}
              motionRef={prosecutionChipsRef}
              showWeights={showEntryWeights}
              side="prosecution"
              style={{
                left: `${(prosecutionOffset.x / VIEWBOX_WIDTH) * 100}%`,
                top: `${((CHIP_CENTER_Y + prosecutionOffset.dy) / VIEWBOX_HEIGHT) * 100}%`,
              }}
              transitionTilt={readoutMode && animate}
              visible={settled || !animate || play}
            />
            <ChipStack
              entries={visibleEntries("defence")}
              motionRef={defenceChipsRef}
              showWeights={showEntryWeights}
              side="defence"
              style={{
                left: `${(defenceOffset.x / VIEWBOX_WIDTH) * 100}%`,
                top: `${((CHIP_CENTER_Y + defenceOffset.dy) / VIEWBOX_HEIGHT) * 100}%`,
              }}
              transitionTilt={readoutMode && animate}
              visible={settled || !animate || play}
            />
          </>
        )}

        {showTally && (
          <div className="pointer-events-none absolute left-1/2 top-[42%] z-10 -translate-x-1/2 -translate-y-1/2 text-center">
            <span className="block font-sb-mono text-[8px] uppercase tracking-[0.08em] text-sb-text-tertiary sm:text-[9px]">
              {tallyLabel}
            </span>
            <span
              ref={tallyRef}
              aria-hidden="true"
              className="mt-0.5 block font-sb-mono text-xs font-semibold text-sb-text-primary tabular-nums sm:text-sm"
            >
              {settled || !animate ? tallyText : "0:0"}
            </span>
          </div>
        )}

        {showVerdictBadge && !appendMode && verdict != null && (
          <div className="absolute left-1/2 top-[84%] z-20 -translate-x-1/2 -translate-y-1/2">
            <div
              ref={verdictRef}
              style={
                settled || !animate || play
                  ? undefined
                  : { opacity: 0, visibility: "hidden" }
              }
            >
              <VerdictBadge verdict={verdict} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Pan({
  label,
  panRef,
  side,
  showLabel,
  transform,
  transitionTilt,
  visible,
}: {
  label: string;
  panRef: RefObject<SVGGElement>;
  side: FulcrumSide;
  showLabel: boolean;
  transform: string;
  transitionTilt: boolean;
  visible: boolean;
}) {
  const anchorX = side === "prosecution" ? LEFT_ANCHOR_X : RIGHT_ANCHOR_X;
  const fill = side === "prosecution" ? "var(--sb-prosecution-bg)" : "var(--sb-defence-bg)";
  const bowl = `M${anchorX - 55} 218 Q${anchorX} 260 ${anchorX + 55} 218 Z`;

  return (
    <g
      ref={panRef}
      className={cn(
        transitionTilt &&
          "transition-transform duration-[150ms] ease-linear",
      )}
      transform={transform}
    >
      <path d={bowl} data-fulcrum-fill fill={fill} opacity={visible ? 1 : 0} />
      <g
        fill="none"
        stroke="var(--sb-border-hairline-strong)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      >
        <path
          d={`M${anchorX} 106 L${anchorX - 44} 218 M${anchorX} 106 L${anchorX + 44} 218`}
          data-fulcrum-line
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={visible ? 0 : 1}
        />
        <path
          d={bowl}
          data-fulcrum-line
          pathLength="1"
          strokeDasharray="1"
          strokeDashoffset={visible ? 0 : 1}
        />
      </g>
      {showLabel && (
        <text
          x={anchorX}
          y="250"
          data-fulcrum-fill
          fill="var(--sb-text-tertiary)"
          fontFamily="var(--sb-font-mono)"
          fontSize="9"
          letterSpacing="1.2"
          opacity={visible ? 1 : 0}
          textAnchor="middle"
        >
          {label}
        </text>
      )}
    </g>
  );
}

function ChipStack({
  entries,
  motionRef,
  showWeights,
  side,
  style,
  transitionTilt,
  visible,
}: {
  entries: FulcrumEvidenceChip[];
  motionRef: RefObject<HTMLDivElement>;
  showWeights: boolean;
  side: FulcrumSide;
  style: CSSProperties;
  transitionTilt: boolean;
  visible: boolean;
}) {
  return (
    <div
      ref={motionRef}
      className={cn(
        "absolute z-30 grid -translate-x-1/2 -translate-y-1/2 gap-1 sm:gap-1.5",
        transitionTilt &&
          "transition-[left,top] duration-[150ms] ease-linear",
      )}
      style={style}
    >
      {entries.map((entry) => (
        <div
          key={entry.id}
          data-fulcrum-chip={entry.id}
          aria-label={
            entry.tier
              ? undefined
              : `${entry.label}. ${entry.statusLabel}.${entry.whatWasFound ? ` ${entry.whatWasFound}` : ""}`
          }
          className="flex w-[7.25rem] items-center justify-between gap-1 rounded-sb-sm border border-sb-border-hairline bg-sb-bg-surface-2 px-1.5 py-1 sm:w-36 sm:gap-2 sm:px-2"
          style={
            visible
              ? undefined
              : {
                  opacity: 0,
                  visibility: "hidden",
                  transform: "translateY(-30px) scale(0.97)",
                }
          }
        >
          <span className="min-w-0 truncate text-[8px] font-medium text-sb-text-secondary sm:text-[10px]">
            {entry.label}
          </span>
          <div className="flex shrink-0 items-center gap-1">
            {entry.tier ? (
              <EvidenceBadge
                tier={entry.tier}
                whatWasFound={entry.whatWasFound}
                sourceCount={entry.sourceCount}
                independenceGrouping={entry.independenceGrouping}
                freshnessDate={entry.freshnessDate}
                animateSettle={false}
                className={cn(
                  "[&>button]:px-1.5 [&>button]:py-1 [&>button]:text-[7px] sm:[&>button]:text-[8px]",
                  side === "defence" &&
                    "[&_[role=tooltip]]:left-auto [&_[role=tooltip]]:right-0",
                )}
              />
            ) : (
              <span className="font-sb-mono text-[7px] uppercase tracking-[0.06em] text-sb-text-tertiary sm:text-[8px]">
                {entry.statusLabel}
              </span>
            )}
            {showWeights && (
              <span className="font-sb-mono text-[8px] text-sb-text-tertiary tabular-nums sm:text-[9px]">
                {formatNumber(entry.weight)}%
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
