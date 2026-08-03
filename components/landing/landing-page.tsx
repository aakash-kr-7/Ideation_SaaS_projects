"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { LegalFooter } from "@/components/layout/legal-footer";
import { ValidationReport } from "@/components/report/ValidationReport";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { AuroraText } from "@/components/ui/aurora-text";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import { DotGridOverlay } from "@/components/ui/dot-grid-overlay";
import {
  EvidenceBadge,
  type EvidenceBadgeProps,
  type EvidenceTier,
} from "@/components/ui/evidence-badge";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Input } from "@/components/ui/input";
import { ScrambleReveal } from "@/components/ui/scramble-reveal";
import { ScoreDisplay } from "@/components/ui/score-display";
import { SpotlightCard } from "@/components/ui/spotlight-card";
import { VerdictBadge } from "@/components/ui/verdict-badge";
import { authEntryUrl } from "@/lib/auth-redirect";
import { sbMotion } from "@/lib/motion";
import type { ValidationReport as ValidationReportPayload } from "@/lib/report-schema";

const LANDING_SEQUENCE_STORAGE_KEY = "sb-landing-resolve-played:v3";
const EVIDENCE_TIERS: EvidenceTier[] = ["evidenced", "suggestive", "assumed"];

const VALIDATION_FACTORS = [
  {
    title: "Market evidence",
    description: "Is there a painful, urgent problem with a credible commercial opening?",
    factors: [
      ["Pain severity", "How consequential the problem appears for the defined buyer."],
      ["Purchase urgency", "Whether delay creates a measurable cost, deadline, or budget event."],
      ["Willingness to pay", "Whether payment behavior supports the proposed value—not just interest."],
      ["Competition gap", "Whether current products and workarounds leave a buyer-relevant opening."],
      ["Retention potential", "Whether the workflow is recurring enough to support repeat use."],
    ],
  },
  {
    title: "Founder and distribution fit",
    description: "Can this team reach the right buyer and earn a realistic route into the market?",
    factors: [
      ["Founder fit", "Relevant capability, domain knowledge, and access supplied by the founder."],
      ["Buyer reachability", "Whether qualified buyers can be found through identifiable channels."],
      ["Distribution clarity", "Whether one channel can plausibly produce repeatable conversations."],
    ],
  },
  {
    title: "Execution feasibility",
    description: "Can a focused first offer be delivered and monetized inside real constraints?",
    factors: [
      ["MVP speed", "The time, scope, and dependency burden behind the core workflow."],
      ["Platform dependency risk", "Exposure to APIs, vendors, policies, or platforms outside your control."],
      ["Regulatory risk", "Permissions, compliance duties, and blockers that could change the plan."],
      ["Speed to first revenue", "How directly a scoped offer could reach an attributable paid commitment."],
    ],
  },
] as const;

const ADJUDICATION_PROPOSITIONS = [
  "The defined buyer experiences the claimed pain.",
  "The pain occurs frequently enough to matter.",
  "The buyer treats the problem as urgent.",
  "A reachable stakeholder owns or influences budget.",
  "Buyers already spend money or meaningful time on the problem.",
  "Current alternatives are inadequate for the chosen workflow.",
  "The buyer can be reached through a plausible channel.",
  "Switching friction is lower than the expected value of changing.",
  "The first product can be delivered inside the stated constraints.",
  "The founder has—or can credibly obtain—the required advantage.",
] as const;

const FAQS = [
  {
    question: "What is startup idea validation?",
    answer:
      "Startup idea validation is the process of testing whether a defined buyer has a meaningful problem, whether existing alternatives leave an opening, and whether there is enough evidence to justify the next investment. It should reduce uncertainty before product development, not manufacture certainty about future success.",
  },
  {
    question: "How does ShouldBuild conduct market research for a startup idea?",
    answer:
      "ShouldBuild turns the idea into a research brief, searches public sources for demand, buyer, competitor, pricing, feasibility, and risk signals, rejects unsupported claims, groups related evidence, and links accepted findings to a 12-factor Readiness Score. Every report also retains challenging evidence and the most important unresolved gaps.",
  },
  {
    question: "What is the difference between a Quick Scan and Full Validation?",
    answer:
      "A Quick Scan is a rapid evidence screen for deciding whether an idea deserves deeper investigation. Full Validation uses a broader evidence burden, proposition-by-proposition research, confirmed founder constraints, deeper adversarial analysis, and a more complete decision dossier for choosing whether to build, narrow, validate further, or walk away.",
  },
  {
    question: "What does the 12-factor startup validation score measure?",
    answer:
      "The ShouldBuild Readiness Score measures the current evidence and constraint fit across market demand, founder and distribution fit, and execution feasibility. It is a deterministic weighted score. It is not a probability of startup success, a revenue forecast, or a promise that the market will respond as expected.",
  },
  {
    question: "What do EVIDENCED, SUGGESTIVE, and ASSUMED mean?",
    answer:
      "EVIDENCED means a factor meets the higher bar for relevant, sufficiently direct, authoritative, independently corroborated support without an unresolved integrity problem. SUGGESTIVE means useful evidence exists but the higher bar is not met. ASSUMED means the available evidence is too weak or incomplete, so the report exposes the gap and limits that factor's influence.",
  },
  {
    question: "Does ShouldBuild replace customer interviews or paid validation tests?",
    answer:
      "No. Public-source market research is best used to eliminate weak directions, sharpen hypotheses, identify competitors, and design better primary research. Direct buyer interviews, concierge trials, deposits, and paid pilots remain stronger evidence for pain, behavior, and willingness to pay.",
  },
  {
    question: "Why can the same startup idea score differently for two founders?",
    answer:
      "Full Validation scores decision readiness in context. A founder's skills, buyer access, domain experience, available budget, weekly time, deadline, platform tolerance, regulatory tolerance, and abandonment condition affect whether the same market opportunity is feasible now. The market evidence can be identical while founder and constraint fit differ materially.",
  },
  {
    question: "What is a living startup validation report?",
    answer:
      "A living Full Validation report can recheck decision-critical evidence as pricing, competitors, regulation, and other market facts change. No-change checks do not create noise. Material changes can re-extract affected claims, recalculate linked factors, and create a new immutable report version while preserving the original decision history.",
  },
  {
    question: "Can ShouldBuild guarantee that a startup idea will succeed?",
    answer:
      "No. No market research tool can guarantee product-market fit or commercial success. ShouldBuild is decision support: it makes the current case, contrary evidence, uncertainty, and next validation threshold easier to inspect before you commit more time or money.",
  },
  {
    question: "Is ShouldBuild an established platform with proven customer traction?",
    answer:
      "ShouldBuild is an early-stage product. This page deliberately does not publish a customer-logo wall, fabricated testimonials, or unverified usage counts. Confidence should come from inspecting the method and the frozen sample report while the product earns real, publishable outcomes over time.",
  },
] as const;

function tierFromPersistedState(state: string | undefined): EvidenceTier | null {
  if (state === "EVIDENCED") return "evidenced";
  if (state === "SUGGESTIVE") return "suggestive";
  if (state === "ASSUMED") return "assumed";
  return null;
}

function factorMetadata(report: ValidationReportPayload, key: string) {
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

function buildTierSummaries(report: ValidationReportPayload) {
  const factorEvidence = Object.values(
    report.opportunity.scorecard.factorEvidence ?? {},
  ).filter((factor): factor is NonNullable<typeof factor> => Boolean(factor));

  return EVIDENCE_TIERS.map((tier) => {
    const state = tier.toUpperCase();
    const matchingFactors = factorEvidence.filter(
      (factor) => factor.evidenceState === state,
    );
    const evidenceIds = new Set(
      matchingFactors.flatMap((factor) => [
        ...factor.supportingEvidenceIds,
        ...factor.challengingEvidenceIds,
      ]),
    );
    const linkedEvidence = report.opportunity.evidence.filter(
      (item) => !item.excluded && evidenceIds.has(item.id),
    );
    const independenceGroups = new Set(
      linkedEvidence.map(
        (item) =>
          item.independenceKey ||
          item.canonicalSourceId ||
          item.canonicalDomain ||
          item.url,
      ),
    );
    const freshnessDates = linkedEvidence
      .map(
        (item) =>
          item.publishedOrUpdatedAt ?? item.date ?? item.retrievedAt ?? null,
      )
      .filter((value): value is string => Boolean(value))
      .sort((left, right) => Date.parse(right) - Date.parse(left));

    const metadata: EvidenceBadgeProps = {
      tier,
      whatWasFound: `${matchingFactors.length} of ${factorEvidence.length} scored factors are ${tier} in this frozen report.`,
      sourceCount: linkedEvidence.length,
      independenceGrouping: independenceGroups.size
        ? `${independenceGroups.size} persisted independent group${independenceGroups.size === 1 ? "" : "s"}`
        : "No independence group persisted for this tier",
      freshnessDate: freshnessDates[0] ?? "No source date persisted for this tier",
      animateSettle: false,
    };

    return { tier, count: matchingFactors.length, metadata };
  });
}

function formatFactorName(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

export function LandingPage({ report }: { report: ValidationReportPayload }) {
  const pathname = usePathname();
  const router = useRouter();
  const pageRef = useRef<HTMLDivElement>(null);
  const sequenceDecisionRef = useRef<boolean | null>(null);
  const continueSequenceRef = useRef<(() => void) | null>(null);
  const [idea, setIdea] = useState("");
  const [headlinePlay, setHeadlinePlay] = useState(false);
  const isLandingRoute = pathname === "/";
  const positiveClaim = evidenceClaim(report, report.strongestPositiveEvidenceId);
  const negativeClaim = evidenceClaim(report, report.strongestNegativeEvidenceId);
  const acceptedEvidence = report.opportunity.evidence.filter((item) => !item.excluded);
  const tierSummaries = buildTierSummaries(report);
  const acceptedEvidenceCount =
    report.evidenceSufficiency?.acceptedEvidenceCount ?? acceptedEvidence.length;
  const independentEvidenceGroups =
    report.evidenceSufficiency?.independentEvidenceGroups ??
    new Set(
      acceptedEvidence.map(
        (item) =>
          item.independenceKey ||
          item.canonicalSourceId ||
          item.canonicalDomain ||
          item.url,
      ),
    ).size;
  const challengingEvidenceCount =
    report.evidenceSufficiency?.challengingEvidenceCount ??
    acceptedEvidence.filter(
      (item) => item.evidenceRole === "challenging" || item.disconfirming,
    ).length;

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
    };

    if (!shouldAnimate) {
      if (isLandingRoute && motionQuery.matches) markSessionPlayed();
      settleImmediately();
      return;
    }

    root.dataset.landingSequence = "preparing";
    setHeadlinePlay(false);

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
            const sampleStage = root.querySelector<HTMLElement>("[data-landing-sample]");

            if (sampleStage) gsap.set(sampleStage, { autoAlpha: 0, y: 12 });

            root.dataset.landingSequence = "playing";

            const timeline = gsap.timeline({
              paused: true,
              defaults: { ease: standardEase },
            });
            if (sampleStage) {
              timeline.to(
                sampleStage,
                { autoAlpha: 1, y: 0, duration: 0.35 },
                0,
              );
            }

            timeline
              .call(() => {
                root.dataset.landingSequence = "settled";
              }, [], 0.35);

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
              className="hidden rounded-sb-sm text-sm text-sb-text-secondary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus lg:inline"
              href="#methodology"
            >
              Methodology
            </Link>
            <Link
              className="hidden rounded-sb-sm text-sm text-sb-text-secondary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus lg:inline"
              href="#how-it-works"
            >
              How it works
            </Link>
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
          className="relative isolate overflow-hidden"
          aria-labelledby="landing-title"
        >
          <AuroraBackground />
          <div className="relative z-[1] mx-auto max-w-6xl px-sb-5 pb-sb-16 pt-sb-16 md:pt-sb-20">
            <div className="mx-auto max-w-4xl text-center">
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                Startup idea validation before engineering
              </p>
              <h1
                id="landing-title"
                className="mb-0 mt-sb-4 font-sb-display text-5xl font-[480] leading-[1.04] tracking-[-0.02em] sm:text-6xl lg:text-7xl"
              >
                Validate the market.
                <br />
                <AuroraText className="pb-[0.08em]">
                  <ScrambleReveal
                    text="Build only what earns it."
                    durationSeconds={0.8}
                    play={headlinePlay}
                    onComplete={() => continueSequenceRef.current?.()}
                  />
                </AuroraText>
              </h1>
              <p className="mx-auto mb-0 mt-sb-5 max-w-2xl text-lg leading-relaxed text-sb-text-secondary">
                Turn a startup idea into cited market research, a 12-factor Readiness
                Score, and an adversarial verdict—before you commit months to building.
              </p>
            </div>

            <div data-landing-sample className="relative mx-auto mt-sb-10 max-w-5xl">
              <DotGridOverlay
                maxDots={300}
                className="rounded-sb-lg opacity-90 [mask-image:radial-gradient(ellipse_at_center,black_38%,transparent_92%)]"
              />
              <GlassPanel className="relative z-[1] p-sb-5 text-left md:p-sb-8">
                <ValidationReport
                  report={report}
                  publicMode
                  previewMode
                  presentation="snippet"
                />

                <div className="mt-sb-6 border-t border-sb-border-hairline pt-sb-6">
                  <form
                    className="grid gap-sb-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
                    onSubmit={startValidation}
                  >
                    <label className="grid gap-sb-2 text-xs font-medium text-sb-text-secondary" htmlFor="landing-idea">
                      Describe the startup idea you want to validate
                      <Input
                        id="landing-idea"
                        name="idea"
                        value={idea}
                        onChange={(event) => setIdea(event.target.value)}
                        placeholder="Describe the product, target buyer, and problem"
                        required
                        autoComplete="off"
                        className="min-h-14 px-sb-4 text-base"
                      />
                    </label>
                    <Button type="submit" className="relative min-h-14 w-full overflow-hidden px-sb-6 md:w-auto">
                      Run a Quick Scan <ArrowRight size={16} />
                      <BorderBeam persistent />
                    </Button>
                  </form>
                </div>

                <Link
                  className="mt-sb-5 inline-flex items-center gap-sb-2 rounded-sb-sm text-sm text-sb-text-secondary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus"
                  href="/sample-report?mode=full_validation"
                >
                  Audit the complete sample report <ArrowRight size={14} />
                </Link>
              </GlassPanel>
            </div>
          </div>
        </section>

        <section
          className="border-y border-sb-border-hairline bg-sb-bg-surface-1"
          aria-labelledby="why-validation-matters-title"
        >
          <div className="mx-auto grid max-w-6xl gap-sb-8 px-sb-5 py-sb-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
            <div className="max-w-xl">
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                Why startup validation matters
              </p>
              <h2
                id="why-validation-matters-title"
                className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] sm:text-4xl"
              >
                The costliest product mistake starts before the first build.
              </h2>
              <p className="mb-0 mt-sb-4 text-base leading-relaxed text-sb-text-secondary">
                A polished product cannot create a market need that was never there.
                Early startup validation is less about predicting a winner and more about
                finding the assumptions most likely to waste your runway.
              </p>
              <p className="mb-0 mt-sb-4 text-sm leading-relaxed text-sb-text-tertiary">
                These figures describe reasons cited across a set of failure post-mortems;
                they are not universal startup failure probabilities or ShouldBuild data.
              </p>
            </div>

            <GlassPanel className="grid gap-sb-6 p-sb-6 md:p-sb-8">
              <p className="m-0 text-base leading-relaxed text-sb-text-secondary">
                According to CB Insights&apos; analysis of startup post-mortems, its
                earlier, widely cited dataset attributed roughly <strong className="font-medium text-sb-text-primary">42%</strong> of
                failures to &ldquo;no market need&rdquo; and about <strong className="font-medium text-sb-text-primary">29%</strong> to
                running out of cash. Its newer analysis uses the closely related label
                poor product-market fit at <strong className="font-medium text-sb-text-primary">43%</strong> and describes
                depleted capital as commonly the final cause rather than the underlying problem.
              </p>
              <div className="grid gap-sb-4 sm:grid-cols-2">
                <ResearchStat
                  value="42–43%"
                  label="No market need / poor product-market fit"
                  detail="The product did not solve a sufficiently important problem for a defined market."
                />
                <ResearchStat
                  value="~29%"
                  label="Ran out of cash in the earlier analysis"
                  detail="Often a downstream symptom: weak demand and slow revenue consume runway."
                />
              </div>
              <p className="m-0 text-xs leading-relaxed text-sb-text-tertiary">
                Source: CB Insights&apos; historical
                {" "}
                <a
                  className="underline decoration-sb-border-hairline-strong underline-offset-4 hover:text-sb-text-primary"
                  href="https://www.cbinsights.com/research/why-startups-die/"
                  target="_blank"
                  rel="noreferrer"
                >
                  startup failure post-mortem analysis
                </a>
                {" "}and its
                {" "}
                <a
                  className="underline decoration-sb-border-hairline-strong underline-offset-4 hover:text-sb-text-primary"
                  href="https://www.cbinsights.com/research/report/startup-failure-reasons-top/"
                  target="_blank"
                  rel="noreferrer"
                >
                  updated product-market-fit analysis
                </a>
                .
              </p>
            </GlassPanel>
          </div>
        </section>

        <section
          id="methodology"
          className="relative isolate overflow-hidden"
          aria-labelledby="methodology-title"
        >
          <AuroraBackground className="opacity-50" />
          <div className="relative z-[1] mx-auto max-w-6xl px-sb-5 py-sb-16">
            <div className="grid gap-sb-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-end">
              <div>
                <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                  Methodology trust, not manufactured traction
                </p>
                <h2
                  id="methodology-title"
                  className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] sm:text-4xl"
                >
                  Trust the evidence standard—not a logo wall.
                </h2>
              </div>
              <p className="m-0 max-w-2xl text-base leading-relaxed text-sb-text-secondary lg:justify-self-end">
                ShouldBuild is early-stage. We will not substitute fabricated customer
                counts, borrowed company logos, or invented testimonials for earned proof.
                The honest trust signal today is a method you can inspect and a frozen
                sample report you can audit.
              </p>
            </div>

            <div className="mt-sb-8 grid gap-sb-4 lg:grid-cols-3">
              <MethodTierCard
                tier="evidenced"
                title="EVIDENCED"
                description="The factor meets the higher bar for relevant, authoritative, sufficiently direct support from independent evidence groups, without an unresolved integrity failure or contradiction."
                consequence="The finding may move the factor meaningfully away from neutral, while its sources and limitations remain visible."
              />
              <MethodTierCard
                tier="suggestive"
                title="SUGGESTIVE"
                description="Accepted, relevant signals exist, but independent corroboration, directness, authority, or contradiction resolution does not clear the evidenced threshold."
                consequence="The signal can inform the decision, but its influence is capped and the missing proof is named."
              />
              <MethodTierCard
                tier="assumed"
                title="ASSUMED"
                description="The public evidence is missing, too indirect, or too weak to support a confident factor conclusion. An assumption is never silently upgraded into a fact."
                consequence="The factor stays close to a neutral baseline and becomes a candidate for direct validation."
              />
            </div>

            <div className="mt-sb-8 grid gap-sb-4 lg:grid-cols-12">
              <BentoCard className="lg:col-span-7">
                <div className="grid gap-sb-6 p-sb-6 md:grid-cols-2 md:p-sb-8">
                  <div>
                    <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                      Prosecution
                    </p>
                    <h3 className="mb-0 mt-sb-2 font-sb-display text-xl font-[480]">
                      Make the strongest supported case to proceed.
                    </h3>
                    <p className="mb-0 mt-sb-3 text-sm leading-relaxed text-sb-text-secondary">
                      Supporting findings are linked to specific propositions: the pain
                      exists, it happens often, buyers care now, alternatives are
                      inadequate, and the first offer is feasible.
                    </p>
                  </div>
                  <div className="border-t border-sb-border-hairline pt-sb-6 md:border-l md:border-t-0 md:pl-sb-6 md:pt-0">
                    <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                      Defence
                    </p>
                    <h3 className="mb-0 mt-sb-2 font-sb-display text-xl font-[480]">
                      Search for the best reason not to build yet.
                    </h3>
                    <p className="mb-0 mt-sb-3 text-sm leading-relaxed text-sb-text-secondary">
                      Challenging research looks for good-enough alternatives, low urgency,
                      weak payment behavior, switching friction, dependency failures, and
                      other conditions that could invalidate the opportunity.
                    </p>
                  </div>
                </div>
              </BentoCard>

              <BentoCard className="lg:col-span-5">
                <div className="grid gap-sb-4 p-sb-6 md:p-sb-8">
                  <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                    Adjudication
                  </p>
                  <h3 className="m-0 font-sb-display text-xl font-[480]">
                    A burden of proof for each proposition.
                  </h3>
                  <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">
                    Each proposition resolves to met, contested, unmet, or insufficient
                    evidence. Unresolved objections stay visible, and the code-owned
                    adversarial gate can lower a verdict when critical checks fail.
                  </p>
                </div>
              </BentoCard>

              <BentoCard className="lg:col-span-12">
                <div className="grid gap-sb-6 p-sb-6 md:p-sb-8 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)]">
                  <div>
                    <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                      Evidence quality model
                    </p>
                    <h3 className="mb-0 mt-sb-2 font-sb-display text-2xl font-[480] tracking-[-0.015em]">
                      Evidence is graded, grouped, and discounted—not merely counted.
                    </h3>
                    <p className="mb-0 mt-sb-4 text-sm leading-relaxed text-sb-text-secondary">
                      Ten reposts should not become ten votes. A long bibliography can still
                      be weak if every page repeats the same press release or discusses an
                      adjacent customer instead of the buyer in your research brief.
                    </p>
                  </div>
                  <dl className="grid gap-sb-4 sm:grid-cols-2">
                    <EvidenceDimension
                      term="Independence"
                      detail="Canonical source, domain, syndication, and claim identity are grouped so repetition does not masquerade as corroboration."
                    />
                    <EvidenceDimension
                      term="Authority"
                      detail="Official documentation, primary data, qualified buyer voice, and stronger source classes carry more weight than generic summaries."
                    />
                    <EvidenceDimension
                      term="Directness"
                      detail="Evidence about the exact buyer, workflow, payment behavior, or constraint is stronger than category-level commentary."
                    />
                    <EvidenceDimension
                      term="Freshness"
                      detail="Publication date, retrieval date, source type, and revalidation due date determine whether a claim is fresh, aging, due, or stale."
                    />
                    <EvidenceDimension
                      term="Relevance"
                      detail="Claims must match the canonical product, segment, geography, problem, and proposition rather than drift into a nearby market."
                    />
                    <EvidenceDimension
                      term="Source family"
                      detail="Buyer voice, official product pages, pricing, regulation, statistics, research, and community evidence are tracked as different families."
                    />
                  </dl>
                </div>
              </BentoCard>
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="border-y border-sb-border-hairline bg-sb-bg-surface-1"
          aria-labelledby="how-it-works-title"
        >
          <div className="mx-auto max-w-6xl px-sb-5 py-sb-16">
            <div className="max-w-3xl">
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                How ShouldBuild works
              </p>
              <h2
                id="how-it-works-title"
                className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] sm:text-4xl"
              >
                From a startup idea to a decision you can audit.
              </h2>
              <p className="mb-0 mt-sb-4 max-w-2xl text-base leading-relaxed text-sb-text-secondary">
                The workflow narrows an idea into testable claims, searches for evidence on
                both sides, scores what survives review, and ends with the next decision—not
                a generic market-research summary.
              </p>
            </div>

            <ol className="mt-sb-8 grid list-none gap-sb-4 p-0 md:grid-cols-2 lg:grid-cols-3">
              <ProcessStep number="01" title="Define the decision">
                State the product, target buyer, problem, workflow, and what you are deciding
                now. Full Validation also confirms founder constraints and abandonment conditions.
              </ProcessStep>
              <ProcessStep number="02" title="Choose the research depth">
                Use Quick Scan to screen the opportunity. Use Full Validation when the
                decision warrants broader evidence and a proposition-level dossier.
              </ProcessStep>
              <ProcessStep number="03" title="Research both cases">
                Search public sources for buyer pain, demand, alternatives, pricing,
                reachability, feasibility, and risk—plus evidence that challenges the thesis.
              </ProcessStep>
              <ProcessStep number="04" title="Verify and group evidence">
                Keep attributable claims with canonical URLs, reject unsupported material,
                and group repeated reporting so copied claims do not inflate confidence.
              </ProcessStep>
              <ProcessStep number="05" title="Score all 12 factors">
                Apply deterministic weights, then temper each factor by its evidence state.
                Evidence Confidence remains separate from the Readiness Score.
              </ProcessStep>
              <ProcessStep number="06" title="Adjudicate the next move">
                Compare Prosecution and Defence, apply the burden of proof, and return a
                verdict with upgrade, downgrade, and kill conditions.
              </ProcessStep>
            </ol>
          </div>
        </section>

        <SectionDivider />

        <section id="quick-scan" className="bg-sb-bg-base" aria-labelledby="quick-scan-title">
          <div className="mx-auto max-w-6xl px-sb-5 py-sb-16">
            <div className="grid gap-sb-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-end">
              <div>
                <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                  Quick Scan · rapid evidence screen
                </p>
                <h2
                  id="quick-scan-title"
                  className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] sm:text-4xl"
                >
                  Quick Scan: decide whether the idea earns deeper validation.
                </h2>
              </div>
              <p className="m-0 max-w-2xl text-base leading-relaxed text-sb-text-secondary lg:justify-self-end">
                Quick Scan is the screening product, not a teaser or blurred preview. It
                turns a product, target buyer, and problem into a canonical research brief,
                runs focused public-source market research, scores all 12 factors, and
                identifies the cheapest useful next test.
              </p>
            </div>

            <div className="mt-sb-8 grid gap-sb-4 lg:grid-cols-3">
              <CapabilityPanel
                eyebrow="Research coverage"
                title="A focused pass across the decision surface"
                body="Quick Scan is designed to filter ideas without pretending to be exhaustive."
                items={[
                  "Problem, buyer, demand, pain frequency, and observable workflow consequences",
                  "Competitors, adjacent products, substitutes, workarounds, positioning, and available official pricing",
                  "Willingness-to-pay signals and the explicit distinction between list price and buyer payment behavior",
                  "Buyer reachability, plausible acquisition channels, technical feasibility, platform exposure, and regulation",
                  "A proposition-specific adversarial search for low urgency, good-enough alternatives, switching resistance, and failure patterns",
                  "Conditional coverage repair when buyer evidence, pricing, competitors, source diversity, or contradiction coverage is missing",
                ]}
              />
              <CapabilityPanel
                eyebrow="Report contents"
                title="A complete screening report with inspectable gaps"
                body="The output is structured around the decision, with citations preserved beside the claims they support."
                items={[
                  "Executive decision, interpreted idea, target customer, and job to be done",
                  "Problem and demand findings, alternatives, competitor context, pricing, and willingness-to-pay evidence",
                  "Strongest positive signal and strongest negative signal retained side by side",
                  "12-factor Readiness Score, per-factor EVIDENCED / SUGGESTIVE / ASSUMED state, and separate Evidence Confidence",
                  "Risks, limitations, missing evidence families, and the highest-leverage unresolved assumption",
                  "Three concrete validation experiments with success and failure criteria",
                  "Source-linked methodology plus PDF, Markdown, CSV, and JSON exports when the run completes",
                ]}
              />
              <CapabilityPanel
                eyebrow="Decision boundary"
                title="Fast enough to screen; explicit about what it cannot prove"
                body="Quick Scan answers whether the opportunity deserves more investigation—not whether success is guaranteed."
                items={[
                  "Public evidence cannot replace attributable customer interviews, observed behavior, deposits, or paid pilots",
                  "Founder-specific fit may remain assumed because Quick Scan does not collect the confirmed founder decision contract used by Full Validation",
                  "Missing direct willingness-to-pay evidence stays missing; competitor pricing is never relabeled as purchase intent",
                  "The practical outcome is to stop, sharpen the segment or wedge, run a targeted test, or advance to Full Validation",
                ]}
              />
            </div>
          </div>
        </section>

        <SectionDivider />

        <section
          id="full-validation"
          className="bg-sb-bg-surface-1"
          aria-labelledby="full-validation-title"
        >
          <div className="mx-auto max-w-6xl px-sb-5 py-sb-16">
            <div className="grid gap-sb-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-end">
              <div>
                <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                  Full Validation · decision dossier
                </p>
                <h2
                  id="full-validation-title"
                  className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] sm:text-4xl"
                >
                  Full Validation: investigate the build decision proposition by proposition.
                </h2>
              </div>
              <p className="m-0 max-w-2xl text-base leading-relaxed text-sb-text-secondary lg:justify-self-end">
                Full Validation is for a decision that justifies a higher evidence burden.
                It expands the research surface, confirms the founder&apos;s real constraints,
                applies a formal adversarial gate, and produces a deeper dossier for
                building, narrowing, validating further, repositioning, or walking away.
              </p>
            </div>

            <div className="mt-sb-8 grid gap-sb-4 md:grid-cols-2">
              <CapabilityPanel
                eyebrow="Six bounded research lenses"
                title="Broader research without losing the exact proposition"
                body="The report investigates the same defined buyer, problem, workflow, and product from six complementary angles."
                items={[
                  "Buyer problem: direct buyer voice, pain severity, frequency, consequences, workarounds, and behavioral demand",
                  "Alternatives and competitors: verified positioning, features, complaints, switching barriers, and category gaps",
                  "Pricing, willingness to pay, and procurement: official pricing, budget ownership, paid behavior, purchase constraints, and packaging signals",
                  "Reachability and acquisition: communities, associations, directories, channels, sales motion, and practical access to qualified buyers",
                  "Feasibility and operations: MVP scope, implementation, integrations, dependencies, reliability, support burden, and regulatory exposure",
                  "Adversarial research: low urgency, sufficient substitutes, resistance, churn, platform failure, and the strongest reason not to build",
                ]}
              />
              <CapabilityPanel
                eyebrow="Decision dossier"
                title="More than a larger bibliography"
                body="Full Validation connects research to concrete product, market, and founder decisions."
                items={[
                  "Segment rankings and jobs to be done tied to accepted evidence",
                  "Problem severity and frequency, demand behavior, market context, and source-bound metrics without invented market sizing",
                  "Competitor deep dives, verified pricing and positioning, recurring complaints, switching implications, and differentiation gaps",
                  "Pricing and packaging landscape, willingness-to-pay evidence, MVP scope, and an explicit what-not-to-build list",
                  "Go-to-market channels, first-customer strategy, risks, mitigations, and specialist demand / competition / market / pricing / risk / GTM assessments",
                  "Validation experiments, founder action plan, success and failure thresholds, and the evidence that would reverse the decision",
                ]}
              />
              <CapabilityPanel
                eyebrow="Higher evidence burden"
                title="Direct evidence is required where inference is dangerous"
                body="Full Validation makes a stronger distinction between a plausible story and a proposition that has earned support."
                items={[
                  "Independent evidence groups and source-family diversity are reported separately from raw source count",
                  "Buyer pain, urgency, budget ownership, current spending, and founder advantage require direct evidence to clear their burden",
                  "Promotional sources cannot establish core buyer pain or alternative inadequacy on their own",
                  "Contradictions are matched to the same proposition instead of pairing unrelated positive and negative market facts",
                  "Unverified pricing, unsupported economics, and unavailable market metrics remain visibly unavailable",
                ]}
              />
              <CapabilityPanel
                eyebrow="Durable output"
                title="An immutable report version with an ongoing evidence path"
                body="The initial report is frozen for auditability, while Full Validation can continue as a living report when the underlying facts change."
                items={[
                  "Versioned report payload, cited charts, source trail, evidence states, verdict conditions, and private exports",
                  "Manual and scheduled evidence rechecks for sources whose freshness policy makes them decision-relevant",
                  "Material changes can re-extract affected claims, recalculate linked factors, and create a new immutable version",
                  "Prior versions remain preserved so a changed verdict never overwrites the historical decision record",
                ]}
              />
            </div>
          </div>
        </section>

        <SectionDivider />

        <section
          id="adjudication"
          className="bg-sb-bg-base"
          aria-labelledby="adjudication-title"
        >
          <div className="mx-auto max-w-6xl px-sb-5 py-sb-16">
            <div className="max-w-3xl">
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                The ShouldBuild differentiator
              </p>
              <h2
                id="adjudication-title"
                className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] sm:text-4xl"
              >
                Prosecution vs. Defence turns market research into adjudication.
              </h2>
              <p className="mb-0 mt-sb-4 max-w-2xl text-base leading-relaxed text-sb-text-secondary">
                A conventional idea-validation report can become a confirmation-bias
                machine: gather supportive facts, summarize a large market, and recommend
                more work. ShouldBuild instead makes the opportunity carry a burden of proof.
              </p>
            </div>

            <div className="mt-sb-8 grid gap-sb-4 lg:grid-cols-3">
              <AdjudicationStage
                number="01"
                title="Prosecution builds the strongest supportable case"
                body="Supporting findings must be attributable, applicable to the defined segment, linked to a testable proposition, and strong enough to survive evidence grading. The goal is not optimism; it is the best evidence-based case for proceeding."
              />
              <AdjudicationStage
                number="02"
                title="Defence searches for the strongest case against"
                body="Challenging findings test the same claims: pain may be rare, the budget owner may be unreachable, an incumbent may already be good enough, switching may be unrealistic, or an API or regulation may block delivery."
              />
              <AdjudicationStage
                number="03"
                title="Code adjudicates the burden of proof"
                body="Each proposition resolves to met, contested, unmet, or insufficient evidence. Unresolved disputes and second-opinion disagreements remain visible, and critical failed checks can lower the verdict even when the weighted score looks attractive."
              />
            </div>

            <GlassPanel className="mt-sb-8 grid gap-sb-6 p-sb-6 md:p-sb-8 lg:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)]">
              <div>
                <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                  Ten decision propositions
                </p>
                <h3 className="mb-0 mt-sb-2 font-sb-display text-2xl font-[480] tracking-[-0.015em]">
                  The argument is decomposed before it is judged.
                </h3>
                <p className="mb-0 mt-sb-3 text-sm leading-relaxed text-sb-text-secondary">
                  This prevents one exciting signal from standing in for the entire case.
                  Every unmet proposition carries a named kill condition or missing-evidence path.
                </p>
              </div>
              <ol className="m-0 grid list-none gap-x-sb-6 gap-y-sb-3 p-0 sm:grid-cols-2">
                {ADJUDICATION_PROPOSITIONS.map((proposition, index) => (
                  <li key={proposition} className="flex gap-sb-3 border-t border-sb-border-hairline pt-sb-3 text-sm leading-relaxed text-sb-text-secondary">
                    <span className="font-sb-mono text-xs text-sb-text-tertiary tabular-nums">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {proposition}
                  </li>
                ))}
              </ol>
            </GlassPanel>
          </div>
        </section>

        <SectionDivider />

        <section
          id="scoring-system"
          className="bg-sb-bg-surface-1"
          aria-labelledby="scoring-system-title"
        >
          <div className="mx-auto max-w-6xl px-sb-5 py-sb-16">
            <div className="max-w-3xl">
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                The 12-factor startup validation score
              </p>
              <h2
                id="scoring-system-title"
                className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] sm:text-4xl"
              >
                One Readiness Score, three decision lenses, twelve inspectable factors.
              </h2>
              <p className="mb-0 mt-sb-4 max-w-2xl text-base leading-relaxed text-sb-text-secondary">
                The ShouldBuild Readiness Score measures how ready this idea and founder
                context are for the decision being considered. It is a deterministic
                weighted result—not a probability of startup success, a revenue forecast,
                or a guarantee of product-market fit.
              </p>
            </div>
            <div className="relative isolate mt-sb-8 grid gap-sb-4 lg:grid-cols-3">
              <DotGridOverlay maxDots={260} className="opacity-80" />
              {VALIDATION_FACTORS.map((group) => (
                <FactorGroup key={group.title} {...group} />
              ))}
            </div>
            <div className="mt-sb-6 grid gap-sb-4 md:grid-cols-3">
              <ScorePrinciple
                title="Raw score"
                body="Accepted demand, pricing, competitor, risk, feasibility, and founder inputs produce a deterministic raw factor value."
              />
              <ScorePrinciple
                title="Evidence coefficient"
                body="Independence, authority, directness, relevance, extraction quality, numeric integrity, and contradictions determine how much confidence that raw value earns."
              />
              <ScorePrinciple
                title="Effective score"
                body="Weakly evidenced values are pulled toward a neutral baseline. Platform and regulatory factors are then treated as risks in the weighted total."
              />
            </div>
          </div>
        </section>

        <SectionDivider />

        <section
          id="founder-fit"
          className="bg-sb-bg-base"
          aria-labelledby="founder-fit-title"
        >
          <div className="mx-auto max-w-6xl px-sb-5 py-sb-16">
            <div className="grid gap-sb-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
              <div>
                <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                  Founder and constraint fit
                </p>
                <h2
                  id="founder-fit-title"
                  className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] sm:text-4xl"
                >
                  The same market opportunity can be a different decision for two founders.
                </h2>
                <p className="mb-0 mt-sb-4 text-base leading-relaxed text-sb-text-secondary">
                  Full Validation does not evaluate an abstract market in isolation. It
                  confirms the milestone and the founder&apos;s actual ability to reach buyers,
                  build the wedge, tolerate dependencies, and run the next validation step.
                  A viable opportunity can still be the wrong build for the current team or window.
                </p>
              </div>
              <GlassPanel className="p-sb-6 md:p-sb-8">
                <dl className="grid gap-sb-5 sm:grid-cols-2">
                  <FounderInput term="Skills and domain capability" detail="What the founder can credibly build, sell, operate, or learn—and whether the missing capability is closeable." />
                  <FounderInput term="Budget" detail="The confirmed amount and currency available for the decision, not an assumed venture-scale budget." />
                  <FounderInput term="Time available" detail="Hours per week available for research, sales, delivery, and support alongside other commitments." />
                  <FounderInput term="Deadline and milestone" detail="The target outcome and date that define what 'ready' must mean for this report." />
                  <FounderInput term="Audience and buyer access" detail="Owned audience, relevant network, warm introductions, cold access, and the route to qualified conversations." />
                  <FounderInput term="Abandonment condition" detail="The precommitted result that means stop, narrow, or reposition instead of expanding scope after a weak test." />
                  <FounderInput term="Platform tolerance" detail="How much dependency on vendors, policies, data access, or external APIs the founder is willing and able to accept." />
                  <FounderInput term="Regulatory tolerance" detail="Whether the founder can absorb the approval, privacy, compliance, licensing, or operational burden the workflow requires." />
                </dl>
              </GlassPanel>
            </div>
          </div>
        </section>

        <SectionDivider />

        <section
          id="score-movement"
          className="bg-sb-bg-surface-1"
          aria-labelledby="score-movement-title"
        >
          <div className="mx-auto max-w-6xl px-sb-5 py-sb-16">
            <div className="max-w-3xl">
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                What moves this score from X to Y
              </p>
              <h2
                id="score-movement-title"
                className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] sm:text-4xl"
              >
                Every verdict includes the evidence that could reverse it.
              </h2>
              <p className="mb-0 mt-sb-4 max-w-2xl text-base leading-relaxed text-sb-text-secondary">
                A score without a change condition is a snapshot with no operating value.
                ShouldBuild identifies the nearest decision boundary, the uncertain factor
                with the most leverage, and concrete upward and downward evidence for the
                next test. The point is to learn what would change the decision before you spend.
              </p>
            </div>

            <GlassPanel className="relative mt-sb-8 overflow-hidden p-sb-6 md:p-sb-8">
              <DotGridOverlay maxDots={220} className="opacity-60 [mask-image:linear-gradient(to_right,black,transparent_72%)]" />
              <div className="relative z-[1] grid gap-sb-8 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1.4fr)]">
                <div>
                  <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                    Frozen sample boundary
                  </p>
                  <div className="mt-sb-4 flex items-center gap-sb-4 font-sb-mono text-3xl font-semibold tabular-nums">
                    <span>{report.opportunity.scorecard.total}</span>
                    <ArrowRight size={20} className="text-sb-text-tertiary" aria-hidden="true" />
                    <span>{report.verdictChangeConditions?.nearestBoundary ?? "—"}</span>
                  </div>
                  <p className="mb-0 mt-sb-4 text-sm leading-relaxed text-sb-text-secondary">
                    Highest-leverage uncertainty:{" "}
                    <strong className="font-medium text-sb-text-primary">
                      {report.verdictChangeConditions?.highestLeverageUncertainFactor
                        ? formatFactorName(report.verdictChangeConditions.highestLeverageUncertainFactor)
                        : "Not persisted in this sample"}
                    </strong>
                  </p>
                </div>
                <div className="grid gap-sb-4 md:grid-cols-2">
                  <DecisionCondition
                    label="Evidence that upgrades it"
                    value={report.verdictChangeConditions?.upgradeCondition}
                  />
                  <DecisionCondition
                    label="Evidence that downgrades it"
                    value={report.verdictChangeConditions?.downgradeCondition}
                  />
                </div>
              </div>
            </GlassPanel>
            <p className="mb-0 mt-sb-4 text-xs leading-relaxed text-sb-text-tertiary">
              The sample values above come from the frozen public Full Validation report.
              They illustrate the mechanism; they are not performance claims about a customer outcome.
            </p>
          </div>
        </section>

        <SectionDivider />

        <section
          className="border-b border-sb-border-hairline bg-sb-bg-base"
          aria-labelledby="product-proof-title"
        >
          <div className="mx-auto max-w-6xl px-sb-5 py-sb-16">
            <div className="max-w-3xl">
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                Feature-by-feature validation report
              </p>
              <h2
                id="product-proof-title"
                className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] sm:text-4xl"
              >
                Market research that stays attached to the decision.
              </h2>
              <p className="mb-0 mt-sb-3 max-w-2xl text-base leading-relaxed text-sb-text-secondary">
                ShouldBuild does more than collect links. It connects claims, evidence
                quality, competitive context, risks, and decision thresholds in one report.
                Every sample value below comes from the frozen Full Validation report—not
                a testimonial, mock metric, or invented customer claim.
              </p>
            </div>

            <div className="relative isolate mt-sb-8 grid auto-rows-min gap-sb-4 lg:grid-cols-12">
              <DotGridOverlay
                maxDots={360}
                className="opacity-90 [mask-image:radial-gradient(ellipse_at_center,black_56%,transparent_100%)]"
              />
              <BentoCard className="lg:col-span-7 lg:row-span-2">
                <div className="grid h-full content-start gap-sb-5 p-sb-6 md:p-sb-8">
                  <div>
                    <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                      Adversarial case
                    </p>
                    <h3 className="mb-0 mt-sb-2 font-sb-display text-2xl font-[480] tracking-[-0.015em]">
                      The strongest case for it—and against it.
                    </h3>
                  </div>
                  <div className="grid gap-sb-4">
                    <EvidenceExcerpt
                      title="Prosecution"
                      claim={positiveClaim}
                      fallback="No accepted supporting claim was persisted in this sample."
                      background="bg-sb-prosecution-bg"
                    />
                    <EvidenceExcerpt
                      title="Defence"
                      claim={negativeClaim}
                      fallback="No accepted challenging claim was persisted in this sample."
                      background="bg-sb-defence-bg"
                    />
                  </div>
                </div>
              </BentoCard>

              <BentoCard className="lg:col-span-5">
                <div className="grid content-start gap-sb-5 p-sb-6">
                  <div>
                    <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                      Evidence quality
                    </p>
                    <h3 className="mb-0 mt-sb-2 font-sb-display text-xl font-[480]">
                      Confidence you can inspect.
                    </h3>
                  </div>
                  <div className="grid gap-sb-3">
                    {tierSummaries.map(({ tier, count, metadata }) => (
                      <div
                        key={tier}
                        className="flex items-center justify-between gap-sb-4 border-t border-sb-border-hairline pt-sb-3 first:border-t-0 first:pt-0"
                      >
                        <EvidenceBadge {...metadata}/>
                        <span className="font-sb-mono text-sm text-sb-text-secondary tabular-nums">
                          {count} factor{count === 1 ? "" : "s"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </BentoCard>

              <BentoCard className="lg:col-span-5">
                <div className="grid content-start gap-sb-5 p-sb-6">
                  <div className="flex items-start justify-between gap-sb-4">
                    <div>
                      <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                        Persisted report stats
                      </p>
                      <h3 className="mb-0 mt-sb-2 font-sb-display text-xl font-[480]">
                        The verdict has receipts.
                      </h3>
                    </div>
                    <VerdictBadge verdict={report.opportunity.scorecard.verdict}/>
                  </div>
                  <div className="flex items-end gap-sb-4">
                    <ScoreDisplay score={report.opportunity.scorecard.total} size="lg" showMax animate={false}/>
                    <span className="pb-sb-1 text-xs text-sb-text-tertiary">Readiness Score</span>
                  </div>
                  <dl className="grid grid-cols-3 gap-sb-3 border-t border-sb-border-hairline pt-sb-4">
                    <Stat value={acceptedEvidenceCount} label="accepted findings"/>
                    <Stat value={independentEvidenceGroups} label="independent groups"/>
                    <Stat value={challengingEvidenceCount} label="challenges retained"/>
                  </dl>
                </div>
              </BentoCard>

              <BentoCard className="lg:col-span-4">
                <FeatureBreakdown
                  eyebrow="Cited source trail"
                  title="Inspect the claim, not just the conclusion."
                  body="Accepted findings retain their source, canonical URL, publication or retrieval date, evidence role, linked factors, and known limitations. Unsupported narrative is not allowed to quietly become score input."
                />
              </BentoCard>

              <BentoCard className="lg:col-span-4">
                <FeatureBreakdown
                  eyebrow="Competitive research"
                  title="Separate competitors from alternatives."
                  body="The report distinguishes direct competitors, adjacent products, substitutes, and workflow workarounds. It looks for a buyer-relevant gap while retaining evidence that existing options may already be good enough."
                />
              </BentoCard>

              <BentoCard className="lg:col-span-4">
                <FeatureBreakdown
                  eyebrow="Pricing and willingness to pay"
                  title="A list price is not purchase intent."
                  body="Verified competitor pricing can establish market context, but it does not prove that your target buyer will pay for your offer. Direct payment, deposit, pilot, or purchase-commitment evidence carries a higher burden."
                />
              </BentoCard>

              <BentoCard className="border-l-2 border-l-sb-accent lg:col-span-12">
                <div className="grid gap-sb-6 p-sb-6 md:p-sb-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
                  <div>
                    <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                      What moves this score
                    </p>
                    <h3 className="mb-0 mt-sb-2 font-sb-display text-2xl font-[480] tracking-[-0.015em]">
                      A verdict with explicit reversal conditions.
                    </h3>
                    <div className="mt-sb-5 flex items-center gap-sb-3 font-sb-mono text-sm tabular-nums">
                      <span>{report.opportunity.scorecard.total}</span>
                      <ArrowRight size={14} className="text-sb-text-tertiary" aria-hidden="true"/>
                      <span>{report.verdictChangeConditions?.nearestBoundary ?? "Boundary not persisted"}</span>
                    </div>
                    <p className="mb-0 mt-sb-3 text-xs leading-relaxed text-sb-text-tertiary">
                      Highest-leverage uncertainty: {report.verdictChangeConditions?.highestLeverageUncertainFactor
                        ? formatFactorName(report.verdictChangeConditions.highestLeverageUncertainFactor)
                        : "Not persisted in this sample"}
                    </p>
                  </div>
                  <div className="grid gap-sb-4 md:grid-cols-2">
                    <DecisionCondition
                      label="Evidence that upgrades it"
                      value={report.verdictChangeConditions?.upgradeCondition}
                    />
                    <DecisionCondition
                      label="Evidence that downgrades it"
                      value={report.verdictChangeConditions?.downgradeCondition}
                    />
                  </div>
                </div>
              </BentoCard>
            </div>
          </div>
        </section>

        <SectionDivider />

        <section
          id="living-reports"
          className="bg-sb-bg-base"
          aria-labelledby="living-reports-title"
        >
          <div className="mx-auto max-w-6xl px-sb-5 py-sb-16">
            <div className="grid gap-sb-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-end">
              <div>
                <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                  Living Full Validation reports
                </p>
                <h2
                  id="living-reports-title"
                  className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] sm:text-4xl"
                >
                  Market facts change. The original decision record should not disappear.
                </h2>
              </div>
              <p className="m-0 max-w-2xl text-base leading-relaxed text-sb-text-secondary lg:justify-self-end">
                Living-report controls are available for Full Validation. They track when
                evidence was published and retrieved, when it should be checked again, what
                materially changed, and whether that change affected the score or verdict.
                Revalidation extends the report; it does not rewrite its history.
              </p>
            </div>

            <div className="mt-sb-8 grid gap-sb-4 lg:grid-cols-3">
              <CapabilityPanel
                eyebrow="Evidence freshness"
                title="Different facts age at different speeds"
                body="A competitor price should be checked more often than foundational research. Freshness policy is attached to the evidence type rather than one arbitrary global expiry date."
                items={[
                  "Competitor pricing and features, regulation and official guidance, community buyer voice, official statistics, foundational research, and general web evidence follow distinct freshness policies",
                  "Published or updated date is kept separate from retrieval date; finding a page today does not make an old claim new",
                  "Each item can resolve to fresh, aging, revalidation due, stale, or unknown-date status",
                  "Reports expose the current-as-of date and stale-evidence warning instead of silently treating every citation as timeless",
                ]}
              />
              <CapabilityPanel
                eyebrow="Revalidation"
                title="Recheck what can actually alter the decision"
                body="A founder can request a recheck or enable a schedule. The refresh path prioritizes cited and decision-critical sources and avoids unnecessary regeneration."
                items={[
                  "Conditional page checks use source metadata and content hashes to distinguish no change from a material change",
                  "An unchanged or inconclusive page does not become evidence of change and does not create a new report version",
                  "When a source materially changes, only affected claims are re-extracted and only linked factors need recalculation",
                  "Refresh history records sources checked, successful no-change checks, material changes, status, and any created version",
                ]}
              />
              <CapabilityPanel
                eyebrow="Version history"
                title="Changed evidence creates a new auditable state"
                body="A material change can update evidence confidence, factor values, score, verdict, and stale-evidence warnings while retaining the prior report."
                items={[
                  "Each new version points back to the previous immutable version and carries a delta describing what changed",
                  "The new verification card reflects the current score, verdict, confidence, independent groups, and current-as-of date",
                  "A source can change materially while the official score remains unchanged; the version still records that fact",
                  "Optional 30-, 90-, and 180-day founder outcome checkpoints are stored separately and do not retroactively change the report score",
                ]}
              />
            </div>
          </div>
        </section>

        <SectionDivider />

        <section
          id="faq"
          className="border-b border-sb-border-hairline bg-sb-bg-surface-1"
          aria-labelledby="faq-title"
        >
          <div className="mx-auto grid max-w-6xl gap-sb-8 px-sb-5 py-sb-16 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
            <div className="max-w-md">
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                Startup validation FAQ
              </p>
              <h2
                id="faq-title"
                className="mb-0 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] sm:text-4xl"
              >
                Questions founders ask before validating an idea.
              </h2>
              <p className="mb-0 mt-sb-4 text-sm leading-relaxed text-sb-text-secondary">
                Straight answers about startup market research, evidence quality, idea
                validation, and what a ShouldBuild report can—and cannot—tell you.
              </p>
            </div>
            <div className="grid content-start gap-sb-3">
              {FAQS.map((faq) => (
                <FaqItem key={faq.question} {...faq} />
              ))}
            </div>
          </div>
        </section>

        <section className="relative isolate overflow-hidden bg-sb-bg-base" aria-labelledby="final-cta-title">
          <AuroraBackground className="opacity-40" static />
          <div className="relative z-[1] mx-auto flex max-w-6xl flex-col items-start justify-between gap-sb-6 px-sb-5 py-sb-12 md:flex-row md:items-center">
            <div>
              <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
                One idea. One honest next move.
              </p>
              <h2 id="final-cta-title" className="mb-0 mt-sb-2 font-sb-display text-2xl font-[480] tracking-[-0.01em]">
                Validate the market before you commit the build.
              </h2>
              <p className="mb-0 mt-sb-3 max-w-xl text-sm leading-relaxed text-sb-text-secondary">
                Start with a Quick Scan, or inspect the frozen Full Validation report before
                you trust the method with your own decision.
              </p>
            </div>
            <div className="flex flex-wrap gap-sb-3">
              <Link
                className="relative inline-flex items-center gap-sb-2 overflow-hidden rounded-sb-md border border-sb-accent bg-sb-accent px-sb-4 py-sb-2 text-sm font-medium text-sb-text-primary transition-colors duration-sb-fast hover:border-sb-accent-hover hover:bg-sb-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus"
                href="/research/new?mode=quick_scan"
              >
                Run a Quick Scan <ArrowRight size={14} />
                <BorderBeam persistent />
              </Link>
              <Link
                className="inline-flex items-center gap-sb-2 rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 px-sb-4 py-sb-2 text-sm text-sb-text-primary hover:bg-sb-bg-surface-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus"
                href="/sample-report?mode=full_validation"
              >
                Open the sample report
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LegalFooter />
    </div>
  );
}

function ResearchStat({
  value,
  label,
  detail,
}: {
  value: string;
  label: string;
  detail: string;
}) {
  return (
    <div className="rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 p-sb-5">
      <span className="font-sb-mono text-3xl font-semibold tracking-[-0.02em] text-sb-text-primary tabular-nums">
        {value}
      </span>
      <h3 className="mb-0 mt-sb-3 text-sm font-medium leading-snug">{label}</h3>
      <p className="mb-0 mt-sb-2 text-xs leading-relaxed text-sb-text-tertiary">{detail}</p>
    </div>
  );
}

function SectionDivider() {
  return (
    <div
      className="relative h-12 overflow-hidden border-y border-sb-border-hairline bg-sb-bg-base"
      aria-hidden="true"
    >
      <DotGridOverlay
        interactive={false}
        maxDots={120}
        minSpacing={16}
        className="opacity-80 [mask-image:linear-gradient(to_right,transparent,black_14%,black_86%,transparent)]"
      />
      <span className="absolute inset-x-0 top-1/2 h-px bg-gradient-to-r from-transparent via-sb-border-hairline-strong to-transparent" />
    </div>
  );
}

function EvidenceDimension({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="border-t border-sb-border-hairline pt-sb-3">
      <dt className="text-sm font-medium text-sb-text-primary">{term}</dt>
      <dd className="mb-0 ml-0 mt-sb-1 text-xs leading-relaxed text-sb-text-secondary">
        {detail}
      </dd>
    </div>
  );
}

function CapabilityPanel({
  eyebrow,
  title,
  body,
  items,
}: {
  eyebrow: string;
  title: string;
  body: string;
  items: readonly string[];
}) {
  return (
    <BentoCard>
      <div className="grid h-full content-start gap-sb-5 p-sb-6 md:p-sb-8">
        <div>
          <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
            {eyebrow}
          </p>
          <h3 className="mb-0 mt-sb-2 font-sb-display text-xl font-[480] tracking-[-0.01em]">
            {title}
          </h3>
        </div>
        <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{body}</p>
        <ul className="m-0 grid list-none gap-sb-3 border-t border-sb-border-hairline p-0 pt-sb-5">
          {items.map((item) => (
            <li key={item} className="flex gap-sb-3 text-xs leading-relaxed text-sb-text-secondary">
              <span className="mt-[0.55em] size-1.5 shrink-0 rounded-sb-pill bg-sb-accent" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </BentoCard>
  );
}

function AdjudicationStage({
  number,
  title,
  body,
}: {
  number: string;
  title: string;
  body: string;
}) {
  return (
    <BentoCard>
      <div className="grid h-full content-start gap-sb-4 p-sb-6">
        <span className="font-sb-mono text-xs text-sb-text-tertiary tabular-nums">{number}</span>
        <h3 className="m-0 font-sb-display text-xl font-[480]">{title}</h3>
        <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{body}</p>
      </div>
    </BentoCard>
  );
}

function ScorePrinciple({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 p-sb-5">
      <h3 className="m-0 text-sm font-medium text-sb-text-primary">{title}</h3>
      <p className="mb-0 mt-sb-2 text-xs leading-relaxed text-sb-text-secondary">{body}</p>
    </div>
  );
}

function FounderInput({ term, detail }: { term: string; detail: string }) {
  return (
    <div className="border-t border-sb-border-hairline pt-sb-4 first:border-t-0 first:pt-0 sm:first:border-t sm:first:pt-sb-4">
      <dt className="text-sm font-medium text-sb-text-primary">{term}</dt>
      <dd className="mb-0 ml-0 mt-sb-2 text-xs leading-relaxed text-sb-text-secondary">
        {detail}
      </dd>
    </div>
  );
}

function MethodTierCard({
  tier,
  title,
  description,
  consequence,
}: {
  tier: EvidenceTier;
  title: string;
  description: string;
  consequence: string;
}) {
  const tierClass = {
    evidenced: "border-solid border-sb-evidence-evidenced bg-sb-accent-muted text-sb-evidence-evidenced",
    suggestive: "border-dashed border-sb-evidence-suggestive text-sb-evidence-suggestive",
    assumed: "border-dotted border-sb-evidence-assumed italic text-sb-evidence-assumed opacity-75",
  }[tier];

  return (
    <BentoCard>
      <div className="grid h-full content-start gap-sb-4 p-sb-6">
        <h3 className={`m-0 w-fit rounded-sb-pill border px-sb-3 py-sb-1 text-xs font-normal tracking-[0.02em] ${tierClass}`}>
          {title}
        </h3>
        <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{description}</p>
        <p className="m-0 border-t border-sb-border-hairline pt-sb-4 text-xs leading-relaxed text-sb-text-tertiary">
          <span className="font-medium text-sb-text-secondary">Decision effect:</span> {consequence}
        </p>
      </div>
    </BentoCard>
  );
}

function ProcessStep({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <li>
      <SpotlightCard className="relative h-full min-w-0 p-sb-6">
        <BorderBeam />
        <span className="font-sb-mono text-xs text-sb-text-tertiary tabular-nums">{number}</span>
        <h3 className="mb-0 mt-sb-3 font-sb-display text-xl font-[480]">{title}</h3>
        <p className="mb-0 mt-sb-3 text-sm leading-relaxed text-sb-text-secondary">{children}</p>
      </SpotlightCard>
    </li>
  );
}

function FactorGroup({
  title,
  description,
  factors,
}: {
  title: string;
  description: string;
  factors: readonly (readonly [string, string])[];
}) {
  return (
    <BentoCard>
      <div className="grid h-full content-start gap-sb-5 p-sb-6">
        <div>
          <h3 className="m-0 font-sb-display text-xl font-[480]">{title}</h3>
          <p className="mb-0 mt-sb-2 text-xs leading-relaxed text-sb-text-tertiary">{description}</p>
        </div>
        <dl className="m-0 grid gap-sb-4">
          {factors.map(([factor, definition]) => (
            <div key={factor} className="border-t border-sb-border-hairline pt-sb-3 first:border-t-0 first:pt-0">
              <dt className="text-sm font-medium text-sb-text-primary">{factor}</dt>
              <dd className="mb-0 ml-0 mt-sb-1 text-xs leading-relaxed text-sb-text-secondary">
                {definition}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </BentoCard>
  );
}

function FeatureBreakdown({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <div className="grid h-full content-start gap-sb-4 p-sb-6">
      <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
        {eyebrow}
      </p>
      <h3 className="m-0 font-sb-display text-xl font-[480]">{title}</h3>
      <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{body}</p>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  return (
    <details className="group rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 open:border-sb-border-hairline-strong">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-sb-4 px-sb-5 py-sb-4 text-sm font-medium text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus">
        {question}
        <span className="font-sb-mono text-lg font-normal text-sb-text-tertiary transition-transform duration-sb-base group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      <p className="mb-0 border-t border-sb-border-hairline px-sb-5 pb-sb-5 pt-sb-4 text-sm leading-relaxed text-sb-text-secondary">
        {answer}
      </p>
    </details>
  );
}

function BentoCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <SpotlightCard
      className={`relative z-[1] min-w-0 ${className}`}
      style={{
        background:
          "color-mix(in srgb, var(--sb-bg-surface-1) 94%, transparent)",
      }}
    >
      <BorderBeam/>
      {children}
    </SpotlightCard>
  );
}

function EvidenceExcerpt({
  title,
  claim,
  fallback,
  background,
}: {
  title: string;
  claim: ReturnType<typeof evidenceClaim>;
  fallback: string;
  background: string;
}) {
  return (
    <div className={`grid gap-sb-4 rounded-sb-md border border-sb-border-hairline p-sb-5 ${background}`}>
      <div className="flex flex-wrap items-center justify-between gap-sb-3">
        <h4 className="m-0 text-sm font-medium">{title}</h4>
        {claim?.metadata ? (
          <EvidenceBadge {...claim.metadata} animateSettle={false}/>
        ) : (
          <span className="rounded-sb-pill border border-dotted border-sb-border-hairline-strong px-sb-3 py-sb-1 text-xs uppercase text-sb-text-tertiary">
            Tier not persisted
          </span>
        )}
      </div>
      <p data-evidence-line className="m-0 text-sm leading-relaxed text-sb-text-secondary">
        {claim?.evidence.atomicClaim ?? claim?.evidence.snippet ?? fallback}
      </p>
      {claim && (
        <div className="flex flex-wrap gap-x-sb-4 gap-y-sb-2 text-xs text-sb-text-tertiary">
          {claim.evidence.url ? (
            <a
              className="underline decoration-sb-border-hairline-strong underline-offset-4 hover:text-sb-text-primary"
              href={claim.evidence.url}
              target="_blank"
              rel="noreferrer"
            >
              {claim.evidence.canonicalDomain ?? claim.evidence.source}
            </a>
          ) : (
            <span>{claim.evidence.source}</span>
          )}
          <span className="font-sb-mono tabular-nums">
            {claim.evidence.publishedOrUpdatedAt ?? claim.evidence.date ?? "Date not persisted"}
          </span>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="order-2 mt-sb-1 text-xs leading-snug text-sb-text-tertiary">{label}</dt>
      <dd className="order-1 m-0 font-sb-mono text-xl font-semibold text-sb-text-primary tabular-nums">
        {value}
      </dd>
    </div>
  );
}

function DecisionCondition({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 p-sb-5">
      <span className="text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">
        {label}
      </span>
      {value ? (
        <p data-evidence-line className="mb-0 mt-sb-3 text-sm leading-relaxed text-sb-text-secondary">
          {value}
        </p>
      ) : (
        <p className="mb-0 mt-sb-3 rounded-sb-md border border-dashed border-sb-border-hairline p-sb-3 text-xs text-sb-text-tertiary">
          Condition not persisted in this sample.
        </p>
      )}
    </div>
  );
}
