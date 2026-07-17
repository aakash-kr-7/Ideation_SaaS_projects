"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft, ArrowRight, BarChart3, Check, FileText, LayoutDashboard,
  Lightbulb, Plus, Scale, Sparkles, X,
} from "lucide-react";

interface TourStep {
  icon: typeof LayoutDashboard;
  section: string;
  title: string;
  body: string;
  tip: string;
  selector?: string;
  fallback?: string;
  plan?: string;
}

const tourSteps: TourStep[] = [
  {
    icon: Sparkles,
    section: "Welcome to ShouldBuild",
    title: "Validate first. Build with evidence.",
    body: "This quick walkthrough shows where each workflow lives and how to move from an idea to a decision-ready report.",
    tip: "You can replay this tour anytime from your profile menu.",
  },
  {
    icon: LayoutDashboard,
    section: "Dashboard",
    title: "Your validation command center",
    body: "Track every idea, open completed reports, resume research in progress, and see the next decision that needs your attention.",
    tip: "Start each visit here; it keeps reports and active research in one place.",
    selector: '[data-tour="nav-dashboard"]',
  },
  {
    icon: Plus,
    section: "Validate idea",
    title: "Start with one specific buyer problem",
    body: "Describe the buyer, their current workaround, and the outcome they need. ShouldBuild turns that brief into a structured market scan.",
    tip: "Specific buyers create much stronger evidence than broad audiences.",
    selector: '[data-tour="nav-research-new"]',
  },
  {
    icon: FileText,
    section: "Reports",
    title: "Open the right state every time",
    body: "Completed work opens as a report; active work opens its live progress view. Reports contain evidence, risks, pricing, MVP scope, and an action plan.",
    tip: "Read the evidence and recommended action—not only the headline score.",
    selector: '[data-tour="reports"]',
    fallback: '[data-tour="nav-dashboard"]',
  },
  {
    icon: Scale,
    section: "Compare ideas",
    title: "Choose between validated opportunities",
    body: "Compare two or more completed reports against the same criteria to decide which opportunity deserves attention first.",
    tip: "Compare willingness to pay and path to revenue alongside the overall score.",
    selector: '[data-tour="nav-compare"]',
    plan: "Principal plan",
  },
  {
    icon: BarChart3,
    section: "Scoring model",
    title: "Model your own decision priorities",
    body: "Adjust the 12 scoring weights to reflect speed, risk tolerance, distribution, or revenue goals and see the verdict respond.",
    tip: "Exports are paid too: Markdown begins on Analyst; PDF and JSON begin on Principal.",
    selector: '[data-tour="nav-dashboard-scoring"]',
    plan: "Principal plan",
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
  const [exiting, setExiting] = useState(false);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const current = tourSteps[step];
  const Icon = current.icon;

  const dismiss = useCallback(() => {
    setExiting(true);
    window.setTimeout(() => {
      setExiting(false);
      setStep(0);
      onClose();
    }, 220);
  }, [onClose]);

  const rememberCompletion = useCallback(async () => {
    try {
      await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tour_completed: true }),
      });
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

    document.body.classList.add("tour-active");
    target?.classList.add("tour-target-active");
    target?.scrollIntoView({ block: "nearest", behavior: "smooth" });

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
      document.body.classList.remove("tour-active");
      target?.classList.remove("tour-target-active");
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
    const width = Math.min(420, window.innerWidth - 32);
    const roomRight = window.innerWidth - (highlight.left + highlight.width);
    const roomLeft = highlight.left;
    let left = Math.max(16, Math.min(window.innerWidth - width - 16, highlight.left));
    let top = Math.min(window.innerHeight - 480, highlight.top + highlight.height + gap);
    let className = "below";
    if (roomRight >= width + gap) {
      left = highlight.left + highlight.width + gap;
      top = Math.max(16, Math.min(window.innerHeight - 480, highlight.top));
      className = "right";
    } else if (roomLeft >= width + gap) {
      left = highlight.left - width - gap;
      top = Math.max(16, Math.min(window.innerHeight - 480, highlight.top));
      className = "left";
    } else if (top < 16) {
      top = Math.max(16, highlight.top - 480 - gap);
      className = "above";
    }
    return { className, style: { left, top, width } };
  }, [highlight]);

  if (!isOpen) return null;

  return (
    <div className={`tour-overlay ${exiting ? "tour-exit" : ""}`} role="presentation">
      {highlight ? <div className="tour-spotlight" style={highlight} /> : <div className="tour-backdrop" />}
      <div
        className={`tour-modal tour-modal-${modalPosition.className}`}
        style={modalPosition.style}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        key={step}
      >
        <button className="tour-close" onClick={dismiss} aria-label="Close tour"><X size={18} /></button>
        <div className="tour-step-counter"><span>{String(step + 1).padStart(2, "0")}</span> / {String(tourSteps.length).padStart(2, "0")}</div>
        <div className="tour-heading-row">
          <div className={`tour-icon-wrap${step === 0 ? " tour-brand-icon" : ""}`}>
            {step === 0 ? <Image src="/brand/shouldbuild-icon.png" alt="" width={34} height={34}/> : <Icon size={22} />}
          </div>
          {current.plan && <span className="tour-plan-badge">PAID · {current.plan}</span>}
        </div>
        <p className="eyebrow tour-section-label">{current.section}</p>
        <h2 className="tour-title" id="tour-title">{current.title}</h2>
        <p className="tour-body">{current.body}</p>
        <div className="tour-tip"><Lightbulb size={15} /><p>{current.tip}</p></div>
        <div className="tour-progress" aria-label="Tour progress">
          {tourSteps.map((_, index) => <i className={index <= step ? "active" : ""} key={index} />)}
        </div>
        <div className="tour-nav">
          <button className="tour-skip" onClick={() => void skip()}>Skip tour</button>
          <div className="tour-nav-buttons">
            {step > 0 && <button className="button ghost tour-prev" onClick={previous}><ArrowLeft size={14} /> Back</button>}
            <button className="button tour-next" onClick={next}>
              {step === tourSteps.length - 1 ? <><Check size={15} /> Finish</> : <>Next <ArrowRight size={15} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
