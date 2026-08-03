"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { LegalFooter } from "@/components/layout/legal-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EvidenceBadge, type EvidenceTier } from "@/components/ui/evidence-badge";
import {
  Fulcrum,
  type FulcrumEvidenceChip,
  type FulcrumSide,
} from "@/components/ui/fulcrum";
import { Input } from "@/components/ui/input";
import { ScrambleReveal } from "@/components/ui/scramble-reveal";
import { authEntryUrl } from "@/lib/auth-redirect";
import { sbMotion } from "@/lib/motion";
import type { ValidationReport as ValidationReportPayload } from "@/lib/report-schema";

const LANDING_SEQUENCE_STORAGE_KEY = "sb-landing-resolve-played:v2";

const researchSteps = [
  "Checking pricing pages",
  "Cross-referencing switching cost",
  "Grading source independence",
] as const;

const fulcrumFactors = [
  { key: "competitionGap", label: "Competition gap", side: "prosecution" },
  { key: "painSeverity", label: "Buyer pain", side: "defence" },
  { key: "platformDependencyRisk", label: "Platform risk", side: "prosecution" },
  { key: "retentionPotential", label: "Retention", side: "defence" },
] as const;

type FactorKey = (typeof fulcrumFactors)[number]["key"];

function tierFromPersistedState(state: string | undefined): EvidenceTier | null {
  if (state === "EVIDENCED") return "evidenced";
  if (state === "SUGGESTIVE") return "suggestive";
  if (state === "ASSUMED") return "assumed";
  return null;
}

function factorMetadata(report: ValidationReportPayload, key: FactorKey | string) {
  const factorEvidence = report.opportunity.scorecard.factorEvidence;
  const factor = factorEvidence?.[key as keyof typeof factorEvidence];
  const tier = tierFromPersistedState(factor?.evidenceState);
  if (!factor || !tier) return null;

  const evidenceIds = [...factor.supportingEvidenceIds, ...factor.challengingEvidenceIds];
  const evidence = report.opportunity.evidence.filter((item) => evidenceIds.includes(item.id));
  const independentGroups = new Set(
    evidence.map(
      (item) => item.independenceKey || item.canonicalSourceId || item.canonicalDomain || item.url,
    ),
  ).size;

  return {
    tier,
    whatWasFound:
      report.opportunity.scorecard.notes[
        key as keyof typeof report.opportunity.scorecard.notes
      ] ?? factor.unresolvedGaps[0] ?? "The report did not persist a factor explanation.",
    sourceCount: evidence.length,
    independenceGrouping: independentGroups
      ? `${independentGroups} independent group${independentGroups === 1 ? "" : "s"}`
      : "No independent group persisted",
    freshnessDate: evidence.find((item) => item.date)?.date ?? "Source date not persisted",
  };
}

function evidenceClaim(
  report: ValidationReportPayload,
  evidenceId: string | null | undefined,
) {
  const evidence = report.opportunity.evidence.find((item) => item.id === evidenceId);
  if (!evidence) return null;

  const factorKey = evidence.associatedFactorIds?.find(
    (key) =>
      report.opportunity.scorecard.factorEvidence?.[
        key as keyof NonNullable<typeof report.opportunity.scorecard.factorEvidence>
      ],
  );

  return {
    evidence,
    metadata: factorMetadata(report, factorKey ?? ""),
  };
}

export function LandingPage({ report }: { report: ValidationReportPayload }) {
  const pathname = usePathname();
  const router = useRouter();
  const pageRef = useRef<HTMLDivElement>(null);
  const sequenceDecisionRef = useRef<boolean | null>(null);
  const continueSequenceRef = useRef<(() => void) | null>(null);
  const [idea, setIdea] = useState("");
  const [headlinePlay, setHeadlinePlay] = useState(false);
  const [fulcrumAnimate, setFulcrumAnimate] = useState(false);
  const [fulcrumPlay, setFulcrumPlay] = useState(false);
  const isLandingRoute = pathname === "/";
  const positiveClaim = evidenceClaim(report, report.strongestPositiveEvidenceId);
  const negativeClaim = evidenceClaim(report, report.strongestNegativeEvidenceId);
  const fulcrumEntries = useMemo<FulcrumEvidenceChip[]>(
    () =>
      fulcrumFactors.flatMap(({ key, label, side }) => {
        const metadata = factorMetadata(report, key);
        const weight = report.opportunity.scorecard.weights[key];
        if (!metadata || !Number.isFinite(weight)) return [];

        return [
          {
            id: key,
            label,
            side: side as FulcrumSide,
            weight,
            ...metadata,
          },
        ];
      }),
    [report],
  );

  useLayoutEffect(() => {
    const root = pageRef.current;
    if (!root) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const readSessionFlag = () => {
      try {
        return window.sessionStorage.getItem(LANDING_SEQUENCE_STORAGE_KEY) === "true";
      } catch {
        return false;
      }
    };

    const markSessionPlayed = () => {
      try {
        window.sessionStorage.setItem(LANDING_SEQUENCE_STORAGE_KEY, "true");
      } catch {
        // Session storage can be unavailable in privacy-restricted contexts.
      }
    };

    if (sequenceDecisionRef.current === null) {
      sequenceDecisionRef.current =
        isLandingRoute && !motionQuery.matches && !readSessionFlag();
    }

    const shouldAnimate = sequenceDecisionRef.current;
    let cancelled = false;
    let disabledByPreference = false;
    let setupFrame = 0;
    let activeCleanup: (() => void) | undefined;

    const settleImmediately = () => {
      if (cancelled) return;
      root.dataset.landingSequence = "settled";
      continueSequenceRef.current = null;
      setHeadlinePlay(false);
      setFulcrumAnimate(false);
      setFulcrumPlay(false);
    };

    if (!shouldAnimate) {
      if (isLandingRoute && motionQuery.matches) markSessionPlayed();
      settleImmediately();
      return;
    }

    root.dataset.landingSequence = "preparing";
    setHeadlinePlay(false);
    setFulcrumAnimate(true);
    setFulcrumPlay(false);

    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      disabledByPreference = true;
      markSessionPlayed();
      window.cancelAnimationFrame(setupFrame);
      activeCleanup?.();
      activeCleanup = undefined;
      settleImmediately();
    };

    motionQuery.addEventListener("change", handleMotionPreferenceChange);

    // Deferring one frame avoids React Strict Mode's setup/cleanup probe from
    // consuming the session-level one-shot sequence.
    setupFrame = window.requestAnimationFrame(() => {
      if (cancelled || disabledByPreference) return;
      markSessionPlayed();

      void Promise.all([
        import("gsap"),
        import("gsap/CustomEase"),
        import("gsap/ScrambleTextPlugin"),
        import("gsap/ScrollTrigger"),
        import("gsap/SplitText"),
      ])
        .then(async ([{ gsap }, { CustomEase }, { ScrambleTextPlugin }, { ScrollTrigger }, { SplitText }]) => {
          if ("fonts" in document) await document.fonts.ready;
          if (cancelled || disabledByPreference) return;

          gsap.registerPlugin(CustomEase, ScrambleTextPlugin, ScrollTrigger, SplitText);
          const standardEase = CustomEase.create(
            sbMotion.gsapEase.name,
            sbMotion.gsapEase.definition,
          );

          const splitInstances: Array<{ revert: () => void }> = [];
          const scrollTweens: Array<{ kill: () => void }> = [];
          const ownedTriggers: Array<{ kill: () => void }> = [];

          const context = gsap.context(() => {
            const stepItems = gsap.utils.toArray<HTMLElement>(
              "[data-landing-step]",
              root,
            );
            const stepChecks = gsap.utils.toArray<HTMLElement>(
              "[data-landing-step-check]",
              root,
            );
            const fulcrumStage = root.querySelector<HTMLElement>("[data-landing-report]");

            gsap.set(stepItems, { autoAlpha: 0, y: 8 });
            gsap.set(stepChecks, { autoAlpha: 0, scale: 0.72 });
            if (fulcrumStage) gsap.set(fulcrumStage, { autoAlpha: 0, y: 12 });

            root.dataset.landingSequence = "playing";

            const timeline = gsap.timeline({
              paused: true,
              defaults: { ease: standardEase },
            });
            timeline
              .to(stepItems, { autoAlpha: 1, y: 0, duration: 0.22, stagger: 0.15 }, 0)
              .to(
                stepChecks,
                { autoAlpha: 1, scale: 1, duration: 0.16, stagger: 0.15 },
                0.12,
              );

            if (fulcrumStage) {
              timeline.to(
                fulcrumStage,
                { autoAlpha: 1, y: 0, duration: 0.18 },
                0.42,
              );
            }

            timeline
              .call(() => setFulcrumPlay(true), [], 0.5)
              .to({}, { duration: 1.9 }, 0.5)
              .call(() => {
                root.dataset.landingSequence = "settled";
              }, [], 2.4);

            continueSequenceRef.current = () => timeline.play(0);
            setHeadlinePlay(true);

            const evidenceLines = gsap.utils.toArray<HTMLElement>(
              "[data-evidence-line]",
              root,
            );

            evidenceLines.forEach((element) => {
              const split = SplitText.create(element, {
                type: "lines",
                mask: "lines",
                aria: "auto",
              });
              splitInstances.push(split);

              const tween = gsap.from(split.lines, {
                paused: true,
                autoAlpha: 0,
                y: 12,
                filter: "blur(8px)",
                duration: 0.55,
                stagger: 0.08,
                ease: standardEase,
              });
              scrollTweens.push(tween);

              const trigger = ScrollTrigger.create({
                trigger: element,
                start: "top 88%",
                once: true,
                onEnter: () => tween.play(),
              });
              ownedTriggers.push(trigger);
            });
          }, root);

          let refreshFrame = 0;
          refreshFrame = window.requestAnimationFrame(() => ScrollTrigger.refresh());

          activeCleanup = () => {
            window.cancelAnimationFrame(refreshFrame);
            continueSequenceRef.current = null;
            ownedTriggers.forEach((trigger) => trigger.kill());
            scrollTweens.forEach((tween) => tween.kill());
            context.revert();
            splitInstances.forEach((split) => split.revert());
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
  }, [isLandingRoute]);

  useEffect(() => {
    if (!isLandingRoute) return;

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (motionQuery.matches) return;

    let cancelled = false;
    let disabledByPreference = false;
    let activeCleanup: (() => void) | undefined;

    const stopLenis = () => {
      disabledByPreference = true;
      activeCleanup?.();
      activeCleanup = undefined;
    };

    const handleMotionPreferenceChange = (event: MediaQueryListEvent) => {
      if (event.matches) stopLenis();
    };

    motionQuery.addEventListener("change", handleMotionPreferenceChange);

    void Promise.all([
      import("gsap"),
      import("gsap/ScrollTrigger"),
      import("lenis"),
    ])
      .then(([{ gsap }, { ScrollTrigger }, { default: Lenis }]) => {
        if (cancelled || disabledByPreference) return;

        gsap.registerPlugin(ScrollTrigger);
        const lenis = new Lenis({
          duration: 1.05,
          smoothWheel: true,
          syncTouch: false,
        });
        const updateScrollTrigger = () => ScrollTrigger.update();
        let lenisFrame = 0;
        const runLenis = (time: number) => {
          lenis.raf(time);
          lenisFrame = window.requestAnimationFrame(runLenis);
        };

        lenis.on("scroll", updateScrollTrigger);
        lenisFrame = window.requestAnimationFrame(runLenis);

        activeCleanup = () => {
          window.cancelAnimationFrame(lenisFrame);
          lenis.off("scroll", updateScrollTrigger);
          lenis.destroy();
        };
      })
      .catch(() => {
        // Native scrolling remains the safe fallback if Lenis cannot load.
      });

    return () => {
      cancelled = true;
      motionQuery.removeEventListener("change", handleMotionPreferenceChange);
      activeCleanup?.();
    };
  }, [isLandingRoute]);

  function startValidation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const description = idea.trim();
    if (!description) return;
    const destination = `/research/new?mode=quick_scan&idea=${encodeURIComponent(description)}`;
    router.push(authEntryUrl(destination, "register"));
  }

  return (
    <div
      ref={pageRef}
      data-landing-sequence="settled"
      className="min-h-screen bg-sb-bg-base text-sb-text-primary"
    >
      <header className="border-b border-sb-border-hairline bg-sb-bg-base">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-sb-4 px-sb-5">
          <Brand />
          <nav className="flex items-center gap-sb-4" aria-label="Marketing navigation">
            <Link
              className="hidden rounded-sb-sm text-sm text-sb-text-secondary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus sm:inline"
              href="/sample-report?mode=full_validation"
            >
              Sample report
            </Link>
            <Link
              className="hidden rounded-sb-sm text-sm text-sb-text-secondary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus sm:inline"
              href="/pricing"
            >
              Pricing
            </Link>
            <Link
              className="rounded-sb-sm text-sm text-sb-text-secondary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus"
              href="/sign-in"
            >
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section
          className="mx-auto max-w-6xl px-sb-5 pb-sb-16 pt-sb-16 md:pt-sb-20"
          aria-labelledby="landing-title"
        >
          <div className="mx-auto max-w-3xl text-center">
            <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
              Evidence-based startup validation
            </p>
            <h1
              id="landing-title"
              className="mb-0 mt-sb-4 font-sb-display text-5xl font-[480] leading-[1.04] tracking-[-0.02em] sm:text-6xl lg:text-7xl"
            >
              <ScrambleReveal
                text="Know what earns the build."
                durationSeconds={0.8}
                play={headlinePlay}
                onComplete={() => continueSequenceRef.current?.()}
              />
            </h1>
            <p className="mx-auto mb-0 mt-sb-5 max-w-2xl text-lg leading-relaxed text-sb-text-secondary">
              ShouldBuild tests your idea against cited market evidence, credible objections,
              and the assumptions that still need proof.
            </p>

            <ul
              className="mx-auto mt-sb-6 grid max-w-xl list-none gap-sb-2 p-0 text-left"
              aria-label="Research steps"
            >
              {researchSteps.map((step) => (
                <li
                  key={step}
                  data-landing-step
                  className="flex items-center gap-sb-3 rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-1 px-sb-4 py-sb-3 font-sb-mono text-xs text-sb-text-secondary"
                >
                  <span
                    data-landing-step-check
                    className="grid size-5 shrink-0 place-items-center rounded-sb-sm border border-sb-evidence-evidenced bg-sb-accent-muted text-sb-evidence-evidenced"
                    aria-hidden="true"
                  >
                    <Check size={13} strokeWidth={2} />
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>

            <form
              className="mx-auto mt-sb-8 grid max-w-2xl gap-sb-3 text-left"
              onSubmit={startValidation}
            >
              <label className="text-xs font-medium text-sb-text-secondary" htmlFor="landing-idea">
                What are you considering building?
              </label>
              <Input
                id="landing-idea"
                name="idea"
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder="A scheduling assistant for independent clinics that reduces missed appointments"
                required
                autoComplete="off"
                className="min-h-14 px-sb-4 text-base"
              />
                <Button type="submit" className="w-full sm:mx-auto sm:w-fit">
                  Run a Quick Scan <ArrowRight size={16} />
                </Button>
            </form>
          </div>

          <div data-landing-report className="mt-sb-12 overflow-visible">
            <header className="mx-auto flex max-w-4xl flex-col items-center gap-sb-1 text-center">
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                Real frozen sample <span aria-hidden="true">&middot;</span> Full Validation
              </p>
              <h2 className="m-0 font-sb-display text-xl font-[480] tracking-[-0.01em]">
                {report.opportunity.name}
              </h2>
            </header>

            <Fulcrum
              entries={fulcrumEntries}
              score={report.opportunity.scorecard.total}
              verdict={report.opportunity.scorecard.verdict}
              animate={fulcrumAnimate}
              play={fulcrumPlay}
              className="mx-auto mt-sb-4 w-full max-w-5xl"
            />
          </div>

          <div className="mt-sb-5 text-center">
            <Link
              className="inline-flex items-center gap-sb-2 rounded-sb-sm text-sm text-sb-text-secondary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus"
              href="/sample-report?mode=full_validation"
            >
              Audit the complete sample report <ArrowRight size={14} />
            </Link>
          </div>
        </section>

        <section
          className="border-y border-sb-border-hairline bg-sb-bg-surface-1"
          aria-labelledby="evidence-trail-title"
        >
          <div className="mx-auto max-w-6xl px-sb-5 py-sb-16">
            <div className="max-w-2xl">
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                The evidence trail
              </p>
              <h2
                id="evidence-trail-title"
                className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] sm:text-4xl"
              >
                Every recommendation keeps the case against it visible.
              </h2>
            </div>

            <ul className="mt-sb-8 list-none divide-y divide-sb-border-hairline border-y border-sb-border-hairline p-0">
              <EvidenceTrailItem
                index="01"
                title="Prosecution"
                claim={positiveClaim}
                fallback="No accepted supporting claim was persisted in the sample report."
              />
              <EvidenceTrailItem
                index="02"
                title="Defence"
                claim={negativeClaim}
                fallback="No accepted challenging claim was persisted in the sample report."
              />
              <li className="grid gap-sb-4 py-sb-6 md:grid-cols-[4rem_11rem_minmax(0,1fr)] md:items-start">
                <span className="font-sb-mono text-xs text-sb-text-tertiary tabular-nums">03</span>
                <h3 className="m-0 text-sm font-medium">Decision condition</h3>
                <p
                  data-evidence-line
                  className="m-0 max-w-3xl text-base leading-relaxed text-sb-text-secondary"
                >
                  {report.verdictChangeConditions?.upgradeCondition ??
                    "No upgrade condition was persisted in the sample report."}
                </p>
              </li>
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-sb-5 py-sb-16" aria-labelledby="movement-title">
          <Card className="border-l-2 border-l-sb-accent p-sb-6 md:p-sb-8">
            <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
              What moves the score
            </p>
            <h2
              id="movement-title"
              className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em]"
            >
              The report names the evidence that changes the decision.
            </h2>
            <div className="mt-sb-6 grid gap-sb-4 md:grid-cols-2">
              <div className="rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 p-sb-5">
                <span className="text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                  Evidence that upgrades it
                </span>
                <p className="mb-0 mt-sb-3 text-sm leading-relaxed text-sb-text-secondary">
                  {report.verdictChangeConditions?.upgradeCondition ??
                    "No upgrade condition was persisted."}
                </p>
              </div>
              <div className="rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 p-sb-5">
                <span className="text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                  Evidence that downgrades it
                </span>
                <p className="mb-0 mt-sb-3 text-sm leading-relaxed text-sb-text-secondary">
                  {report.verdictChangeConditions?.downgradeCondition ??
                    "No downgrade condition was persisted."}
                </p>
              </div>
            </div>
          </Card>
        </section>

        <section className="border-t border-sb-border-hairline bg-sb-bg-surface-1">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-sb-6 px-sb-5 py-sb-12 md:flex-row md:items-center">
            <div>
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                One idea. One honest next move.
              </p>
              <h2 className="mb-0 mt-sb-2 font-sb-display text-2xl font-[480] tracking-[-0.01em]">
                Read the evidence before you commit the build.
              </h2>
            </div>
            <Link
              className="inline-flex items-center gap-sb-2 rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 px-sb-4 py-sb-2 text-sm text-sb-text-primary hover:bg-sb-bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus"
              href="/sample-report?mode=full_validation"
            >
              Open the sample report <ArrowRight size={14} />
            </Link>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}

function EvidenceTrailItem({
  index,
  title,
  claim,
  fallback,
}: {
  index: string;
  title: string;
  claim: ReturnType<typeof evidenceClaim>;
  fallback: string;
}) {
  return (
    <li className="grid gap-sb-4 py-sb-6 md:grid-cols-[4rem_11rem_minmax(0,1fr)] md:items-start">
      <span className="font-sb-mono text-xs text-sb-text-tertiary tabular-nums">{index}</span>
      <div className="grid justify-items-start gap-sb-3">
        <h3 className="m-0 text-sm font-medium">{title}</h3>
        {claim?.metadata && <EvidenceBadge {...claim.metadata} animateSettle={false} />}
      </div>
      <div className="max-w-3xl">
        <p data-evidence-line className="m-0 text-base leading-relaxed text-sb-text-secondary">
          {claim?.evidence.snippet ?? fallback}
        </p>
        {claim && (
          <div className="mt-sb-4 flex flex-wrap gap-x-sb-4 gap-y-sb-2 text-xs text-sb-text-tertiary">
            <span>{claim.evidence.source}</span>
            <span className="font-sb-mono tabular-nums">
              {claim.evidence.date ?? "Date not persisted"}
            </span>
            <span>
              {claim.evidence.evidenceRole === "challenging" || claim.evidence.disconfirming
                ? "Challenging evidence"
                : "Supporting evidence"}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}
