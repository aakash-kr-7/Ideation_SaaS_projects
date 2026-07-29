"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  ArrowLeft, ArrowRight, BarChart3, Check, FileText, LayoutDashboard,
  Lightbulb, Plus, Scale, SearchCheck, X,
} from "lucide-react";

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
        <div className="tour-window-bar">
          <div><span className="tour-window-signal"/><b>ShouldBuild</b><i>/ Guided activation</i></div>
          <span className="tour-window-dots"><i/><i/><i/></span>
        </div>
        <button className="tour-close" onClick={dismiss} aria-label="Close tour"><X size={17} /></button>
        <div className="tour-step-counter"><span>{String(step + 1).padStart(2, "0")}</span> / {String(tourSteps.length).padStart(2, "0")} <i>{current.signal}</i></div>
        <div className="tour-heading-row">
          <div className={`tour-icon-wrap${step === 0 ? " tour-brand-icon" : ""}`}>
            {step === 0 ? <Image src="/brand/shouldbuild-mark.svg" alt="" width={34} height={34}/> : <Icon size={22} />}
          </div>
          <span className="tour-status-pill"><i/> Decision system live</span>
        </div>
        <p className="eyebrow tour-section-label">{current.section}</p>
        <h2 className="tour-title" id="tour-title">{current.title}</h2>
        <p className="tour-body">{current.body}</p>
        <div className="tour-tip"><Lightbulb size={15} /><p><b>Operator note</b>{current.tip}</p></div>
        <div className="tour-progress" aria-label="Tour progress">
          {tourSteps.map((_, index) => <i className={index <= step ? "active" : ""} key={index} />)}
        </div>
        <div className="tour-nav">
          <button className="tour-skip" onClick={() => void skip()}>I know my way around</button>
          <div className="tour-nav-buttons">
            {step > 0 && <button className="button ghost tour-prev" onClick={previous}><ArrowLeft size={14} /> Back</button>}
            <button className="button tour-next" onClick={next}>
              {step === tourSteps.length - 1 ? <><Check size={15} /> Enter decision room</> : <>Show next move <ArrowRight size={15} /></>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
