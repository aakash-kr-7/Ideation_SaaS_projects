"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X, ArrowRight, ArrowLeft, Check, LayoutDashboard, Plus, FileText,
  Gauge, Target, BarChart3, Scale, Rocket, Download, Lightbulb, AlertTriangle
} from "lucide-react";

interface TourStep {
  icon: typeof LayoutDashboard;
  section: string;
  title: string;
  body: string;
  proTip: string;
  commonMistake: string;
}

const tourSteps: TourStep[] = [
  {
    icon: Lightbulb,
    section: "Welcome to SignalFit",
    title: "Your validation command center",
    body: "SignalFit helps you validate product ideas before building them. Every feature exists to answer one question: should you invest your time building this? Here's how experienced founders use it.",
    proTip: "Treat validation as the first phase of building, not a delay. The goal is conviction — build with evidence, not hope.",
    commonMistake: "Skipping validation because 'I already know this is a good idea.' The most expensive mistake founders make is assumption-driven building.",
  },
  {
    icon: LayoutDashboard,
    section: "Dashboard",
    title: "Your validation pipeline at a glance",
    body: "The dashboard shows every idea you've tested, their scores, verdicts, and recommended next actions. Think of it as your portfolio of opportunities — ranked by signal strength.",
    proTip: "Check the 'Do these first' section every visit. It surfaces your highest-leverage next action based on your validation data.",
    commonMistake: "Validating one idea and stopping. The strongest founders validate 3-5 ideas before choosing which to build.",
  },
  {
    icon: Plus,
    section: "Validate Idea",
    title: "How to describe your idea for best results",
    body: "Tell us the product, who would pay for it, and what problem it solves. Be specific about the buyer — 'freelance designers billing $5k+/month' is far more useful than 'designers.'",
    proTip: "Start with the buyer's pain, not the product feature. 'Invoice follow-up is manual and awkward for freelancers' produces a better report than 'an invoice reminder tool.'",
    commonMistake: "Being too broad. 'A project management tool' gives generic results. 'A sprint planning tool for 5-person dev agencies' gives actionable insights.",
  },
  {
    icon: FileText,
    section: "Validation Report",
    title: "How to read and use your report",
    body: "Start with the Verdict tab — it gives you the recommendation and executive summary. Then check Evidence to verify the sources. Use the Action Plan tab as your literal next-step checklist.",
    proTip: "Click through to the actual source URLs in the Evidence tab. The best founders verify the strongest signals themselves — it builds conviction.",
    commonMistake: "Reading only the score and verdict. The real value is in the evidence, the risk section, and the action plan.",
  },
  {
    icon: Gauge,
    section: "Understanding Scores",
    title: "Score ≠ success probability",
    body: "The overall score (0-100) reflects the strength of market signals across 12 criteria. It measures how much evidence exists — not how likely you are to succeed. A 90 with 50% confidence means strong signals but thin evidence.",
    proTip: "Pay more attention to confidence than score. A 72 with 85% confidence is more actionable than a 92 with 40% confidence. Confidence tells you how much evidence backs the score.",
    commonMistake: "Treating a high score as a guarantee. The score tells you 'the evidence is encouraging' — your job is to verify it with real buyers.",
  },
  {
    icon: Scale,
    section: "Compare Ideas",
    title: "When and how to compare",
    body: "After validating 2+ ideas, use Compare to see them side-by-side on the same criteria. This helps you decide which idea deserves your time first. Compare buyer pain severity, willingness to pay, and build complexity.",
    proTip: "Don't just pick the highest score. Compare the 'Path to $500 MRR' and 'First validation step' rows — they reveal which idea gets to revenue fastest.",
    commonMistake: "Comparing ideas from completely different markets. Compare within the same market or buyer segment for meaningful decisions.",
  },
  {
    icon: Target,
    section: "Action Plan & Validation",
    title: "From report to first customer",
    body: "Every report includes a phased action plan: frame the hypothesis, run buyer interviews, verify financial intent, then lock MVP scope. Follow the checklist — it's designed to get you to a paid commitment before you write code.",
    proTip: "The checklist is interactive and saves your progress. Use it as your project tracker. Don't start coding until Phase 3 (Financial Intent Verification) is complete.",
    commonMistake: "Jumping straight to building after reading the report. The report's value is in guiding pre-build validation, not just confirming your intuition.",
  },
  {
    icon: BarChart3,
    section: "Scoring Model",
    title: "Customize weights to match your priorities",
    body: "The scoring model has 12 weighted criteria. Default weights work well for most founders, but you can adjust them. If speed matters more than revenue scale, increase MVP Speed weight. If you're risk-averse, increase Platform Dependency Risk weight.",
    proTip: "Save custom weight presets for different types of ideas. A solo founder bootstrapping needs different weights than a VC-backed team.",
    commonMistake: "Over-weighting criteria you're good at (e.g. technical founders cranking up MVP Speed). Weight what matters for the business, not your personal strengths.",
  },
  {
    icon: Download,
    section: "Export & Share",
    title: "Get reports to the right people",
    body: "Export as Markdown (for docs), JSON (for integrations), CSV (for spreadsheets), or PDF (print dialog). Share reports with co-founders to align on which idea to pursue, or with investors to demonstrate market diligence.",
    proTip: "The Markdown export is surprisingly useful for investor updates and co-founder alignment docs. It's structured for decision-making, not just reading.",
    commonMistake: "Keeping reports to yourself. Sharing validation data with your co-founder or advisor catches blind spots you'll miss solo.",
  },
  {
    icon: Rocket,
    section: "Recommended Workflow",
    title: "The validation-first workflow",
    body: "1. Validate 3-5 ideas → 2. Compare the top 2 → 3. Run buyer interviews for the winner → 4. Get one paid commitment → 5. Build MVP. This workflow typically takes 2-4 weeks and saves 2-6 months of building the wrong thing.",
    proTip: "Book your first buyer interview within 48 hours of reading your report. Momentum matters — the longer you wait, the less likely you are to validate.",
    commonMistake: "Treating validation as a one-time event. Come back after interviews to re-validate with new information. The best founders iterate on their validation.",
  },
];

interface ProductTourProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

export function ProductTour({ isOpen, onClose, onComplete }: ProductTourProps) {
  const [step, setStep] = useState(0);
  const [exiting, setExiting] = useState(false);

  const current = tourSteps[step];
  const Icon = current.icon;

  const handleClose = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      setExiting(false);
      setStep(0);
      onClose();
    }, 300);
  }, [onClose]);

  const handleComplete = useCallback(async () => {
    try {
      await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tour_completed: true }),
      });
    } catch {
      // Best effort
    }
    handleClose();
    onComplete();
  }, [handleClose, onComplete]);

  const handleNext = () => {
    if (step < tourSteps.length - 1) {
      setStep(s => s + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrev = () => {
    if (step > 0) setStep(s => s - 1);
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  if (!isOpen) return null;

  return (
    <div className={`tour-overlay ${exiting ? "tour-exit" : ""}`}>
      <div className="tour-backdrop" onClick={handleClose} />
      <div className="tour-modal" key={step}>
        <button className="tour-close" onClick={handleClose} aria-label="Close tour">
          <X size={18} />
        </button>

        <div className="tour-step-counter">
          {step + 1} of {tourSteps.length}
        </div>

        <div className="tour-icon-wrap">
          <Icon size={24} />
        </div>

        <p className="eyebrow tour-section-label">{current.section}</p>
        <h2 className="tour-title">{current.title}</h2>
        <p className="tour-body">{current.body}</p>

        <div className="tour-insight">
          <div className="tour-insight-card pro-tip">
            <Lightbulb size={15} />
            <div>
              <b>Pro tip</b>
              <p>{current.proTip}</p>
            </div>
          </div>
          <div className="tour-insight-card common-mistake">
            <AlertTriangle size={15} />
            <div>
              <b>Common mistake</b>
              <p>{current.commonMistake}</p>
            </div>
          </div>
        </div>

        <div className="tour-progress-dots">
          {tourSteps.map((_, i) => (
            <button
              key={i}
              className={`tour-dot ${i === step ? "active" : i < step ? "done" : ""}`}
              onClick={() => setStep(i)}
              aria-label={`Go to step ${i + 1}`}
            />
          ))}
        </div>

        <div className="tour-nav">
          <button className="tour-skip" onClick={handleClose}>
            Skip tour
          </button>
          <div className="tour-nav-buttons">
            {step > 0 && (
              <button className="button ghost tour-prev" onClick={handlePrev}>
                <ArrowLeft size={14} /> Previous
              </button>
            )}
            <button className="button tour-next" onClick={handleNext}>
              {step === tourSteps.length - 1 ? (
                <><Check size={15} /> Finish tour</>
              ) : (
                <>Next <ArrowRight size={15} /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
