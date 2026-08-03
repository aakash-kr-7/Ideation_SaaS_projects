"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft, ArrowRight, BarChart3, Check, FileText, LayoutDashboard,
  Lightbulb, Plus, Scale, SearchCheck, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ModalTransition } from "@/components/ui/panel-transition";
import { cn } from "@/lib/utils";

interface TourStep {
  icon: typeof LayoutDashboard;
  section: string;
  title: string;
  body: string;
  tip: string;
  signal: string;
  selector?: string;
  fallback?: string;
}

const tourSteps: TourStep[] = [
  {
    icon: SearchCheck,
    section: "Decision room / Ready",
    title: "Your ideas have somewhere serious to go.",
    body: "This is where an exciting possibility becomes a decision you can defend. In six focused moves, see how to brief the market, read the evidence, and choose what earns your attention.",
    tip: "Nothing here asks you to trust a score blindly. The useful part is the case behind it.",
    signal: "Orientation",
  },
  {
    icon: LayoutDashboard,
    section: "01 / Command center",
    title: "See every bet. Know what needs you.",
    body: "Your dashboard keeps active research, finished verdicts, and the next decision in one view. Momentum stays visible, so promising ideas do not disappear into tabs and notes.",
    tip: "Start here when you return. The next useful action should always be obvious.",
    signal: "Momentum",
    selector: '[data-tour="nav-dashboard"]',
  },
  {
    icon: Plus,
    section: "02 / Open a trial",
    title: "Brief the market like the decision matters.",
    body: "Name the buyer, the painful job, and the outcome your idea promises. ShouldBuild turns that brief into a structured search for demand, contradiction, competition, and pricing pressure.",
    tip: "A narrow buyer with a vivid problem produces sharper evidence than a broad audience.",
    signal: "Precision",
    selector: '[data-tour="nav-research-new"]',
  },
  {
    icon: FileText,
    section: "03 / Evidence room",
    title: "A verdict is only useful when the case survives scrutiny.",
    body: "Open the signals, contradictions, risks, and cited sources behind every recommendation. Quick Scan filters ideas fast; Full Validation adds a deeper dossier, MVP scope, and launch direction.",
    tip: "Read the decisive evidence and recommended action—not only the headline score.",
    signal: "Proof",
    selector: '[data-tour="reports"]',
    fallback: '[data-tour="nav-dashboard"]',
  },
  {
    icon: Scale,
    section: "04 / Opportunity stack",
    title: "Make your best ideas compete for the same resources.",
    body: "Compare completed reports on the same criteria so charisma cannot outrank evidence. Reveal which opportunity deserves the next serious move.",
    tip: "Compare willingness to pay and path to revenue beside the overall score.",
    signal: "Priority",
    selector: '[data-tour="nav-compare"]',
  },
  {
    icon: BarChart3,
    section: "05 / Decision model",
    title: "Let your strategy change what “good” means.",
    body: "Adjust the 12 scoring weights around speed, risk, distribution, or revenue goals. The verdict responds to the business you are trying to build—not to a universal startup template.",
    tip: "You can export the underlying work and keep the reasoning with the decision.",
    signal: "Conviction",
    selector: '[data-tour="nav-dashboard-scoring"]',
  },
];

interface ProductTourProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

type Highlight = { top: number; left: number; width: number; height: number };

export function ProductTour({ isOpen, onClose, onComplete }: ProductTourProps) {
  const [step, setStep] = useState(0);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const current = tourSteps[step];
  const Icon = current.icon;

  const dismiss = useCallback(() => {
    setStep(0);
    setHighlight(null);
    onClose();
  }, [onClose]);

  const rememberCompletion = useCallback(async () => {
    try {
      const response = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tour_completed: true }),
      });
      if (!response.ok) throw new Error("Tour completion could not be saved.");
    } catch {
      // The tour can still close if profile persistence is temporarily unavailable.
    }
  }, []);

  const finish = useCallback(async () => {
    await rememberCompletion();
    onComplete();
    dismiss();
  }, [dismiss, onComplete, rememberCompletion]);

  const skip = useCallback(async () => {
    await rememberCompletion();
    dismiss();
  }, [dismiss, rememberCompletion]);

  const next = useCallback(() => {
    if (step < tourSteps.length - 1) setStep(value => value + 1);
    else void finish();
  }, [finish, step]);

  const previous = useCallback(() => setStep(value => Math.max(0, value - 1)), []);

  useEffect(() => {
    if (!isOpen) return;
    const selector = current.selector;
    const target = selector
      ? document.querySelector<HTMLElement>(selector) ?? (current.fallback ? document.querySelector<HTMLElement>(current.fallback) : null)
      : null;

    target?.scrollIntoView({
      block: "nearest",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });

    const measure = () => {
      if (!target) return setHighlight(null);
      const rect = target.getBoundingClientRect();
      const pad = 8;
      const top = Math.max(8, rect.top - pad);
      const left = Math.max(8, rect.left - pad);
      setHighlight({
        top,
        left,
        width: Math.min(window.innerWidth - left - 8, rect.width + pad * 2),
        height: Math.min(window.innerHeight - top - 8, rect.height + pad * 2),
      });
    };

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [current, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "Enter") next();
      if (event.key === "ArrowLeft") previous();
      if (event.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [dismiss, isOpen, next, previous]);

  const modalPosition = useMemo(() => {
    if (!highlight || typeof window === "undefined") return { className: "center", style: undefined };
    const gap = 18;
    const width = Math.min(460, window.innerWidth - 32);
    const roomRight = window.innerWidth - (highlight.left + highlight.width);
    const roomLeft = highlight.left;
    let left = Math.max(16, Math.min(window.innerWidth - width - 16, highlight.left));
    let top = Math.min(window.innerHeight - 500, highlight.top + highlight.height + gap);
    let className = "below";
    if (roomRight >= width + gap) {
      left = highlight.left + highlight.width + gap;
      top = Math.max(16, Math.min(window.innerHeight - 500, highlight.top));
      className = "right";
    } else if (roomLeft >= width + gap) {
      left = highlight.left - width - gap;
      top = Math.max(16, Math.min(window.innerHeight - 500, highlight.top));
      className = "left";
    } else if (top < 16) {
      top = Math.max(16, highlight.top - 500 - gap);
      className = "above";
    }
    return { className, style: { left, top, width } };
  }, [highlight]);

  return (
    <ModalTransition
      isOpen={isOpen}
      overlayProps={{
        className: "fixed inset-0 z-[70] [background:color-mix(in_srgb,var(--sb-bg-base)_82%,transparent)]",
        role: "presentation",
      }}
      overlayContent={highlight && (
        <div
          className="pointer-events-none fixed rounded-sb-md border border-sb-border-hairline-strong bg-transparent"
          style={highlight}
          aria-hidden="true"
        />
      )}
      panelProps={{
        className: cn(
          "fixed z-[71]",
          !modalPosition.style && "pointer-events-none inset-0 grid place-items-center p-sb-4",
        ),
        style: modalPosition.style,
        role: "dialog",
        "aria-modal": true,
        "aria-labelledby": "tour-title",
      }}
    >
      <Card className="pointer-events-auto relative max-h-[calc(100vh-var(--sb-space-8))] w-full max-w-lg overflow-y-auto bg-sb-bg-surface-2 p-sb-6">
        <div className="mb-sb-5 flex items-center justify-between border-b border-sb-border-hairline pb-sb-3 text-xs uppercase tracking-[0.02em] text-sb-text-tertiary">
          <span><b className="font-medium text-sb-text-secondary">ShouldBuild</b> / Guided tour</span>
          <span className="font-sb-mono tabular-nums">{String(step + 1).padStart(2, "0")} / {String(tourSteps.length).padStart(2, "0")}</span>
        </div>
        <Button variant="ghost" className="absolute right-sb-4 top-sb-4 min-h-8 px-sb-2 py-sb-1" onClick={dismiss} aria-label="Close tour"><X size={16}/></Button>

        <div className="flex items-center justify-between gap-sb-4">
          <div className="grid size-11 place-items-center rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-1 text-sb-text-secondary">
            {step === 0 ? <Image src="/brand/shouldbuild-mark.svg" alt="" width={34} height={34}/> : <Icon size={22} />}
          </div>
          <span className="rounded-sb-pill border border-sb-border-hairline px-sb-3 py-sb-1 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">{current.signal}</span>
        </div>

        <p className="mb-sb-2 mt-sb-5 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">{current.section}</p>
        <h2 className="m-0 font-sb-display text-2xl font-[480] leading-tight tracking-[-0.01em]" id="tour-title">{current.title}</h2>
        <p className="mb-0 mt-sb-3 text-sm leading-relaxed text-sb-text-secondary">{current.body}</p>

        <Card className="mt-sb-5 flex gap-sb-3 rounded-sb-md bg-sb-bg-surface-1 p-sb-4">
          <Lightbulb className="mt-0.5 shrink-0 text-sb-text-tertiary" size={15}/>
          <p className="m-0 text-sm leading-relaxed text-sb-text-secondary"><b className="mb-sb-1 block font-medium text-sb-text-primary">Operator note</b>{current.tip}</p>
        </Card>

        <div className="mt-sb-5 flex gap-sb-2" aria-label={`Tour progress: step ${step + 1} of ${tourSteps.length}`}>
          {tourSteps.map((_, index) => (
            <span
              className={cn("h-1 flex-1 rounded-sb-pill", index <= step ? "bg-sb-border-hairline-strong" : "bg-sb-bg-surface-1")}
              key={index}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className="mt-sb-6 flex flex-col-reverse items-stretch justify-between gap-sb-3 border-t border-sb-border-hairline pt-sb-5 sm:flex-row sm:items-center">
          <Button variant="ghost" onClick={() => void skip()}>Skip tour</Button>
          <div className="flex gap-sb-2">
            {step > 0 && <Button variant="secondary" className="flex-1" onClick={previous}><ArrowLeft size={14}/> Back</Button>}
            <Button className="flex-1 whitespace-nowrap" onClick={next}>
              {step === tourSteps.length - 1 ? <><Check size={15} /> Enter decision room</> : <>Show next move <ArrowRight size={15} /></>}
            </Button>
          </div>
        </div>
      </Card>
    </ModalTransition>
  );
}
