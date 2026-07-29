"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, ArrowLeft, ArrowRight, Briefcase, Check, Code, LoaderCircle,
  Rocket, ShieldCheck, Sparkles, Target, User,
} from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { createClient } from "@/lib/supabase/client";
import { safeAuthRedirect } from "@/lib/auth-redirect";

interface OnboardingData {
  display_name: string;
  experience_level: string;
  preferred_market: string;
  target_customer_type: string;
  revenue_goal: string;
  business_model: string;
  technical_level: string;
  region: string;
  launch_channels: string[];
}

const steps = [
  {
    id: "welcome",
    icon: User,
    phase: "Identity",
    eyebrow: "Calibration 01 / Identity",
    title: "Put a name on the person making the bet.",
    why: "Your decision room should feel written for the person who has to act on it. Start with what we should call you.",
  },
  {
    id: "experience",
    icon: Briefcase,
    phase: "Context",
    eyebrow: "Calibration 02 / Builder context",
    title: "How do you turn ideas into reality?",
    why: "We tune the language, scrutiny, and next actions to the way you actually build—not to a generic founder profile.",
  },
  {
    id: "market",
    icon: Target,
    phase: "Market",
    eyebrow: "Calibration 03 / Market lens",
    title: "Where should we hunt for signal?",
    why: "Choose the market you return to most. It becomes your default research lens and keeps every new brief one step ahead.",
  },
  {
    id: "goals",
    icon: Rocket,
    phase: "Ambition",
    eyebrow: "Calibration 04 / Commercial intent",
    title: "What would make this worth winning?",
    why: "A strong idea has to fit the outcome you want. We pressure-test pricing and revenue paths against that ambition.",
  },
  {
    id: "technical",
    icon: Code,
    phase: "Execution",
    eyebrow: "Calibration 05 / Execution reality",
    title: "Define your unfair constraints.",
    why: "Your skills, region, and available channels shape what the smartest first move looks like. Make the report fit your reality.",
  },
];

const experienceLevels = [
  { value: "first-time", label: "First-time builder", desc: "Exploring my first product idea" },
  { value: "solo-founder", label: "Solo founder", desc: "Building independently" },
  { value: "serial-founder", label: "Serial founder", desc: "Built products before" },
  { value: "agency-studio", label: "Agency / Studio", desc: "Building for clients" },
  { value: "product-team", label: "Product team member", desc: "Working with a team" },
  { value: "student", label: "Student / Learning", desc: "Exploring product development" },
];

const markets = [
  { value: "B2B", label: "B2B SaaS" },
  { value: "D2C", label: "Direct to Consumer" },
  { value: "Creator", label: "Creator Economy" },
  { value: "Developer Tool", label: "Developer Tools" },
  { value: "Local Business", label: "Local Business" },
  { value: "Agency Tool", label: "Agency Tools" },
  { value: "Student/Career", label: "Student / Career" },
  { value: "Other", label: "Other / Exploring" },
];

const revenueGoals = [
  { value: "side-income", label: "$1k MRR", desc: "Side project income" },
  { value: "ramen", label: "$5k MRR", desc: "Ramen profitability" },
  { value: "full-time", label: "$10k MRR", desc: "Full-time income replacement" },
  { value: "venture", label: "Venture-scale", desc: "Venture-backed growth" },
];

const businessModels = [
  { value: "subscription", label: "Subscription" },
  { value: "usage-based", label: "Usage-based" },
  { value: "one-time", label: "One-time purchase" },
  { value: "service-software", label: "Service + Software" },
  { value: "unsure", label: "Not sure yet" },
];

const technicalLevels = [
  { value: "non-technical", label: "Non-technical", desc: "No coding experience" },
  { value: "some-coding", label: "Some coding", desc: "Can build basic prototypes" },
  { value: "full-stack", label: "Full-stack developer", desc: "Can build the entire product" },
];

const regions = [
  { value: "us", label: "United States" },
  { value: "europe", label: "Europe" },
  { value: "india", label: "India" },
  { value: "global", label: "Global / Remote" },
  { value: "other", label: "Other" },
];

const launchChannelOptions = [
  { value: "reddit", label: "Reddit" },
  { value: "twitter", label: "Twitter/X" },
  { value: "producthunt", label: "Product Hunt" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "cold-email", label: "Cold email" },
  { value: "seo", label: "SEO / Content" },
  { value: "communities", label: "Communities" },
  { value: "paid-ads", label: "Paid ads" },
];

const ONBOARDING_DRAFT_KEY = "shouldbuild-onboarding-draft";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [nextPath, setNextPath] = useState("/dashboard");
  const [data, setData] = useState<OnboardingData>({
    display_name: "",
    experience_level: "",
    preferred_market: "",
    target_customer_type: "",
    revenue_goal: "",
    business_model: "",
    technical_level: "",
    region: "",
    launch_channels: [],
  });

  useEffect(() => {
    setNextPath(safeAuthRedirect(new URL(window.location.href).searchParams.get("next")));
    const storedDraft = sessionStorage.getItem(ONBOARDING_DRAFT_KEY);
    if (storedDraft) {
      try {
        const draft = JSON.parse(storedDraft) as { step?: number; data?: Partial<OnboardingData> };
        if (draft.data) setData(current => ({ ...current, ...draft.data }));
        if (typeof draft.step === "number") setStep(Math.max(0, Math.min(steps.length - 1, draft.step)));
      } catch {
        sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
      }
    }

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.full_name) {
        setData(current => ({ ...current, display_name: user.user_metadata.full_name }));
      } else if (user?.email) {
        setData(current => ({ ...current, display_name: user.email!.split("@")[0] }));
      }
    });
  }, []);

  const update = <Field extends keyof OnboardingData>(field: Field, value: OnboardingData[Field]) => {
    setData(current => {
      const nextData = { ...current, [field]: value };
      sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ step, data: nextData }));
      return nextData;
    });
  };

  const toggleChannel = (channel: string) => {
    setData(current => {
      const nextData = {
        ...current,
        launch_channels: current.launch_channels.includes(channel)
          ? current.launch_channels.filter(item => item !== channel)
          : [...current.launch_channels, channel],
      };
      sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ step, data: nextData }));
      return nextData;
    });
  };

  const canProceed = () => {
    switch (step) {
      case 0: return data.display_name.trim().length > 0;
      case 1: return data.experience_level !== "";
      case 2: return data.preferred_market !== "";
      case 3: return data.revenue_goal !== "";
      case 4: return data.technical_level !== "" && data.region !== "";
      default: return true;
    }
  };

  const finish = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, onboarding_completed: true }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "We could not save your onboarding details.");
      }
      sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
      const separator = nextPath.includes("?") ? "&" : "?";
      router.replace(`${nextPath}${separator}tour=start`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "We could not save your onboarding details.");
      setSaving(false);
    }
  };

  const skip = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: data.display_name || null,
          onboarding_completed: true,
        }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error || "We could not save your onboarding status.");
      }
      sessionStorage.removeItem(ONBOARDING_DRAFT_KEY);
      const separator = nextPath.includes("?") ? "&" : "?";
      router.replace(`${nextPath}${separator}tour=start`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "We could not save your onboarding status.");
      setSaving(false);
    }
  };

  const next = () => {
    if (step < steps.length - 1) {
      setStep(current => {
        const nextStep = current + 1;
        sessionStorage.setItem(ONBOARDING_DRAFT_KEY, JSON.stringify({ step: nextStep, data }));
        return nextStep;
      });
    } else {
      void finish();
    }
  };

  const prev = () => {
    if (step > 0) setStep(current => current - 1);
  };

  const current = steps[step];
  const Icon = current.icon;
  const chosenMarket = markets.find(market => market.value === data.preferred_market)?.label;
  const chosenGoal = revenueGoals.find(goal => goal.value === data.revenue_goal)?.label;
  const chosenExperience = experienceLevels.find(level => level.value === data.experience_level)?.label;

  return (
    <main className="onboarding-page">
      <div className="onboarding-bg" />
      <div className="onboarding-grid" aria-hidden="true" />
      <div className="onboarding-orbit onboarding-orbit-one" aria-hidden="true" />
      <div className="onboarding-orbit onboarding-orbit-two" aria-hidden="true" />

      <div className="onboarding-shell">
        <header className="onboarding-header">
          <Brand />
          <div className="onboarding-header-meta">
            <span><ShieldCheck size={13} /> Private workspace</span>
            <button className="onboarding-skip" onClick={() => void skip()} disabled={saving}>Use smart defaults</button>
          </div>
        </header>

        <div className="onboarding-workspace">
          <aside className="onboarding-brief">
            <div className="onboarding-brief-kicker"><Activity size={14} /> Decision lens is calibrating</div>
            <p className="onboarding-brief-step">0{step + 1} <span>/ 0{steps.length}</span></p>
            <h2>Before the market judges the idea, calibrate the lens.</h2>
            <p className="onboarding-brief-copy">
              Five focused choices turn generic research into a decision system shaped around your ambition, constraints, and way of building.
            </p>

            <div className="onboarding-lens">
              <header>
                <div><Sparkles size={13} /><span>Your decision lens</span></div>
                <i>Live</i>
              </header>
              <div className="onboarding-lens-row"><span>Builder</span><b>{chosenExperience || data.display_name || "Waiting for context"}</b></div>
              <div className="onboarding-lens-row"><span>Market</span><b>{chosenMarket || "Open market"}</b></div>
              <div className="onboarding-lens-row"><span>Target</span><b>{chosenGoal || "Not fixed yet"}</b></div>
              <div className="onboarding-lens-signal"><span /> Recommendations sharpen as you answer</div>
            </div>

            <p className="onboarding-brief-note">
              No busywork. Every answer changes how a future report frames risk, scope, pricing, or distribution.
            </p>
          </aside>

          <section className="onboarding-stage">
            <div className="onboarding-stage-chrome">
              <span>Profile calibration</span>
              <div>{steps.map((_, index) => <i className={index <= step ? "active" : ""} key={index} />)}</div>
            </div>

            <div className="onboarding-card" key={step}>
              {saveError && <div className="auth-error" role="alert">{saveError}</div>}
              <div className="onboarding-card-icon"><Icon size={21} /></div>
              <p className="eyebrow">{current.eyebrow}</p>
              <h1>{current.title}</h1>
              <p className="onboarding-why">{current.why}</p>

              <div className="onboarding-fields">
                {step === 0 && (
                  <label className="onboarding-text-field">
                    <span>What should appear in your decision room?</span>
                    <input type="text" value={data.display_name} onChange={event => update("display_name", event.target.value)} placeholder="Your name" />
                    <small>Used only to personalize your workspace and reports.</small>
                  </label>
                )}

                {step === 1 && (
                  <div className="onboarding-option-grid">
                    {experienceLevels.map(option => (
                      <button type="button" key={option.value} className={`onboarding-option ${data.experience_level === option.value ? "selected" : ""}`} onClick={() => update("experience_level", option.value)}>
                        {data.experience_level === option.value && <Check size={14} />}
                        <b>{option.label}</b><small>{option.desc}</small>
                      </button>
                    ))}
                  </div>
                )}

                {step === 2 && (
                  <>
                    <div className="onboarding-chip-grid">
                      {markets.map(market => (
                        <button type="button" key={market.value} className={`onboarding-chip ${data.preferred_market === market.value ? "selected" : ""}`} onClick={() => update("preferred_market", market.value)}>
                          {data.preferred_market === market.value && <Check size={12} />}{market.label}
                        </button>
                      ))}
                    </div>
                    <label className="onboarding-text-field onboarding-customer-field">
                      <span>Who do you most want to understand?</span>
                      <input type="text" value={data.target_customer_type} onChange={event => update("target_customer_type", event.target.value)} placeholder="e.g. Independent salon owners with repeat bookings" />
                      <small>Optional. Specific buyers create sharper evidence searches.</small>
                    </label>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className="onboarding-option-grid compact">
                      {revenueGoals.map(option => (
                        <button type="button" key={option.value} className={`onboarding-option ${data.revenue_goal === option.value ? "selected" : ""}`} onClick={() => update("revenue_goal", option.value)}>
                          {data.revenue_goal === option.value && <Check size={14} />}
                          <b>{option.label}</b><small>{option.desc}</small>
                        </button>
                      ))}
                    </div>
                    <div className="onboarding-chip-grid onboarding-model-grid">
                      <p className="onboarding-sub-label">The model you want to make work</p>
                      {businessModels.map(model => (
                        <button type="button" key={model.value} className={`onboarding-chip ${data.business_model === model.value ? "selected" : ""}`} onClick={() => update("business_model", model.value)}>
                          {data.business_model === model.value && <Check size={12} />}{model.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {step === 4 && (
                  <>
                    <div className="onboarding-option-grid compact">
                      {technicalLevels.map(option => (
                        <button type="button" key={option.value} className={`onboarding-option ${data.technical_level === option.value ? "selected" : ""}`} onClick={() => update("technical_level", option.value)}>
                          {data.technical_level === option.value && <Check size={14} />}
                          <b>{option.label}</b><small>{option.desc}</small>
                        </button>
                      ))}
                    </div>
                    <div className="onboarding-chip-grid onboarding-model-grid">
                      <p className="onboarding-sub-label">Your home market</p>
                      {regions.map(region => (
                        <button type="button" key={region.value} className={`onboarding-chip ${data.region === region.value ? "selected" : ""}`} onClick={() => update("region", region.value)}>
                          {data.region === region.value && <Check size={12} />}{region.label}
                        </button>
                      ))}
                    </div>
                    <div className="onboarding-chip-grid onboarding-model-grid">
                      <p className="onboarding-sub-label">Channels already within reach <span>Optional</span></p>
                      {launchChannelOptions.map(channel => (
                        <button type="button" key={channel.value} className={`onboarding-chip ${data.launch_channels.includes(channel.value) ? "selected" : ""}`} onClick={() => toggleChannel(channel.value)}>
                          {data.launch_channels.includes(channel.value) && <Check size={12} />}{channel.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            <footer className="onboarding-actions">
              <div className="onboarding-progress-copy">
                <span>{current.phase}</span>
                <small>{step + 1} of {steps.length} calibrated</small>
              </div>
              <div className="onboarding-action-buttons">
                {step > 0 && <button className="button ghost onboarding-back" onClick={prev}><ArrowLeft size={14} /> Back</button>}
                <button className="button onboarding-next" onClick={next} disabled={!canProceed() || saving}>
                  {saving
                    ? <><LoaderCircle className="animate-spin" size={15} /> Saving...</>
                    : step === steps.length - 1
                      ? <>Enter my decision room <ArrowRight size={15} /></>
                      : <>Calibrate next layer <ArrowRight size={15} /></>}
                </button>
              </div>
            </footer>
          </section>
        </div>
      </div>
    </main>
  );
}
