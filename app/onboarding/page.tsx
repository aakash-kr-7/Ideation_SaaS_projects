"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Compass, FileSearch, Gauge, Rocket, Scale } from "lucide-react";

const steps = [
  {
    icon: Compass,
    eyebrow: "Validation workspace orientation",
    title: "Begin with an idea worth validating.",
    text: "Bring the opportunity you keep returning to. Tell us who would pay and what problem it solves. We'll do the rest."
  },
  {
    icon: FileSearch,
    eyebrow: "Evidence-backed validation",
    title: "See the evidence behind every recommendation.",
    text: "Every report displays competitor pricing, buyer pain, and risks linked directly to real public source signals — so you can verify the findings yourself."
  },
  {
    icon: Gauge,
    eyebrow: "Verdict framework",
    title: "Understand what each score recommends.",
    text: "Score 85+ suggests Build Now (commit to a focused MVP). 70-84 means Validate First. 55-69 means Niche Down. Below 55 suggests Weak Signal or Avoid. Clear next steps accompany each."
  },
  {
    icon: Scale,
    eyebrow: "Side-by-side comparison",
    title: "Evaluate competing opportunities under the same lens.",
    text: "Compare up to four opportunities on buyer pain severity, willingness to pay, risk profile, and monetization path. Pick the strongest signal."
  },
  {
    icon: Rocket,
    eyebrow: "From report to execution plan",
    title: "Leave with a concrete next step, not a vague insight.",
    text: "Use the validation report to structure customer interviews, secure a paid pilot concierge deposit, or make a justified walk-away decision before spending months on code."
  }
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const current = steps[step];
  const Icon = current.icon;

  const finish = () => {
    localStorage.setItem("signalfit-onboarding", "complete");
    router.push("/dashboard");
  };

  return <main className="tour-page">
    <div className="tour-shell">
      <header>
        <span>SF</span>
        <p>{step + 1} / {steps.length}</p>
      </header>
      <div className="tour-icon"><Icon size={25}/></div>
      <p className="eyebrow">{current.eyebrow}</p>
      <h1>{current.title}</h1>
      <p className="tour-copy">{current.text}</p>
      <div className="tour-progress">
        {steps.map((_, i) => <i className={i <= step ? "active" : ""} key={i}/>)}
      </div>
      <div className="tour-actions">
        <button onClick={finish}>Skip onboarding tour</button>
        <button className="bs-btn bs-btn-bright" onClick={() => step === steps.length - 1 ? finish() : setStep(step + 1)}>
          {step === steps.length - 1 ? <>Get started <Check size={15}/></> : <>Continue <ArrowRight size={15}/></>}
        </button>
      </div>
    </div>
  </main>;
}
