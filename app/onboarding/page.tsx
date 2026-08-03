"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity, ArrowLeft, ArrowRight, Briefcase, Check, Code, LoaderCircle,
  Rocket, ShieldCheck, Sparkles, Target, User,
} from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
    <main className="min-h-screen bg-sb-bg-base text-sb-text-primary">
      <div className="mx-auto w-full max-w-6xl px-sb-5 py-sb-6 md:px-sb-8 md:py-sb-10">
        <header className="flex items-center justify-between gap-sb-4 border-b border-sb-border-hairline pb-sb-4">
          <Brand />
          <div className="flex items-center gap-sb-3">
            <span className="hidden items-center gap-sb-2 text-xs text-sb-text-tertiary sm:inline-flex"><ShieldCheck size={13} /> Private workspace</span>
            <Button variant="ghost" onClick={() => void skip()} disabled={saving}>Use smart defaults</Button>
          </div>
        </header>

        <div className="grid gap-sb-6 py-sb-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
          <Card className="hidden self-start p-sb-6 lg:grid lg:gap-sb-5">
            <div className="flex items-center gap-sb-2 text-xs font-medium uppercase tracking-[0.08em] text-sb-text-tertiary"><Activity size={14} /> Decision lens is calibrating</div>
            <p className="m-0 font-sb-mono text-3xl tabular-nums">0{step + 1} <span className="text-base text-sb-text-tertiary">/ 0{steps.length}</span></p>
            <h2 className="m-0 font-sb-display text-2xl font-[480] tracking-[-0.015em]">Before the market judges the idea, calibrate the lens.</h2>
            <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">
              Five focused choices turn generic research into a decision system shaped around your ambition, constraints, and way of building.
            </p>

            <Card className="grid gap-sb-3 bg-sb-bg-surface-2 p-sb-4">
              <header className="flex items-center justify-between gap-sb-3 border-b border-sb-border-hairline pb-sb-3">
                <div className="flex items-center gap-sb-2 text-sm"><Sparkles className="text-sb-text-secondary" size={13} /><span>Your decision lens</span></div>
                <span className="font-sb-mono text-xs text-sb-text-tertiary">Live</span>
              </header>
              <div className="flex items-start justify-between gap-sb-3 text-sm"><span className="text-sb-text-tertiary">Builder</span><b className="text-right font-medium">{chosenExperience || data.display_name || "Waiting for context"}</b></div>
              <div className="flex items-start justify-between gap-sb-3 text-sm"><span className="text-sb-text-tertiary">Market</span><b className="text-right font-medium">{chosenMarket || "Open market"}</b></div>
              <div className="flex items-start justify-between gap-sb-3 text-sm"><span className="text-sb-text-tertiary">Target</span><b className="text-right font-medium">{chosenGoal || "Not fixed yet"}</b></div>
              <div className="flex items-center gap-sb-2 border-t border-sb-border-hairline pt-sb-3 text-xs text-sb-text-secondary"><span className="size-1.5 rounded-sb-pill bg-sb-accent" /> Recommendations sharpen as you answer</div>
            </Card>

            <p className="m-0 text-xs leading-relaxed text-sb-text-tertiary">
              No busywork. Every answer changes how a future report frames risk, scope, pricing, or distribution.
            </p>
          </Card>

          <section className="grid gap-sb-4">
            <div className="flex items-center justify-between gap-sb-4 text-xs text-sb-text-tertiary">
              <span className="font-medium uppercase tracking-[0.08em]">Profile calibration</span>
              <div className="flex gap-sb-2" aria-label={`Step ${step + 1} of ${steps.length}`}>{steps.map((_, index) => <i className={`h-1.5 w-8 rounded-sb-pill ${index <= step ? "bg-sb-accent" : "bg-sb-bg-surface-3"}`} key={index} />)}</div>
            </div>

            <Card className="grid gap-sb-5 p-sb-5 md:p-sb-8" key={step}>
              {saveError && <Card className="border-sb-verdict-avoid p-sb-3 text-sm text-sb-verdict-avoid" role="alert">{saveError}</Card>}
              <div className="grid size-10 place-items-center rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 text-sb-text-secondary"><Icon size={21} /></div>
              <div className="grid gap-sb-2">
                <p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-sb-text-tertiary">{current.eyebrow}</p>
                <h1 className="m-0 font-sb-display text-2xl font-[480] tracking-[-0.015em] md:text-3xl">{current.title}</h1>
                <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{current.why}</p>
              </div>

              <div className="grid gap-sb-4">
                {step === 0 && (
                  <label className="grid gap-sb-2 text-sm font-medium">
                    <span>What should appear in your decision room?</span>
                    <Input type="text" value={data.display_name} onChange={event => update("display_name", event.target.value)} placeholder="Your name" />
                    <small className="font-normal text-sb-text-tertiary">Used only to personalize your workspace and reports.</small>
                  </label>
                )}

                {step === 1 && (
                  <div className="grid gap-sb-3 sm:grid-cols-2">
                    {experienceLevels.map(option => (
                      <Button type="button" variant="secondary" key={option.value} aria-pressed={data.experience_level === option.value} className={`h-auto min-h-16 justify-start p-sb-3 text-left ${data.experience_level === option.value ? "border-sb-border-focus bg-sb-accent-muted" : ""}`} onClick={() => update("experience_level", option.value)}>
                        {data.experience_level === option.value && <Check size={14} />}
                        <span><b className="block font-medium">{option.label}</b><small className="block font-normal text-sb-text-secondary">{option.desc}</small></span>
                      </Button>
                    ))}
                  </div>
                )}

                {step === 2 && (
                  <>
                    <div className="flex flex-wrap gap-sb-2">
                      {markets.map(market => (
                        <Button type="button" variant="secondary" key={market.value} aria-pressed={data.preferred_market === market.value} className={data.preferred_market === market.value ? "border-sb-border-focus bg-sb-accent-muted" : ""} onClick={() => update("preferred_market", market.value)}>
                          {data.preferred_market === market.value && <Check size={12} />}{market.label}
                        </Button>
                      ))}
                    </div>
                    <label className="grid gap-sb-2 text-sm font-medium">
                      <span>Who do you most want to understand?</span>
                      <Input type="text" value={data.target_customer_type} onChange={event => update("target_customer_type", event.target.value)} placeholder="e.g. Independent salon owners with repeat bookings" />
                      <small className="font-normal text-sb-text-tertiary">Optional. Specific buyers create sharper evidence searches.</small>
                    </label>
                  </>
                )}

                {step === 3 && (
                  <>
                    <div className="grid gap-sb-3 sm:grid-cols-2">
                      {revenueGoals.map(option => (
                        <Button type="button" variant="secondary" key={option.value} aria-pressed={data.revenue_goal === option.value} className={`h-auto min-h-16 justify-start p-sb-3 text-left ${data.revenue_goal === option.value ? "border-sb-border-focus bg-sb-accent-muted" : ""}`} onClick={() => update("revenue_goal", option.value)}>
                          {data.revenue_goal === option.value && <Check size={14} />}
                          <span><b className="block font-medium">{option.label}</b><small className="block font-normal text-sb-text-secondary">{option.desc}</small></span>
                        </Button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-sb-2">
                      <p className="m-0 w-full text-sm font-medium">The model you want to make work</p>
                      {businessModels.map(model => (
                        <Button type="button" variant="secondary" key={model.value} aria-pressed={data.business_model === model.value} className={data.business_model === model.value ? "border-sb-border-focus bg-sb-accent-muted" : ""} onClick={() => update("business_model", model.value)}>
                          {data.business_model === model.value && <Check size={12} />}{model.label}
                        </Button>
                      ))}
                    </div>
                  </>
                )}

                {step === 4 && (
                  <>
                    <div className="grid gap-sb-3 sm:grid-cols-2">
                      {technicalLevels.map(option => (
                        <Button type="button" variant="secondary" key={option.value} aria-pressed={data.technical_level === option.value} className={`h-auto min-h-16 justify-start p-sb-3 text-left ${data.technical_level === option.value ? "border-sb-border-focus bg-sb-accent-muted" : ""}`} onClick={() => update("technical_level", option.value)}>
                          {data.technical_level === option.value && <Check size={14} />}
                          <span><b className="block font-medium">{option.label}</b><small className="block font-normal text-sb-text-secondary">{option.desc}</small></span>
                        </Button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-sb-2">
                      <p className="m-0 w-full text-sm font-medium">Your home market</p>
                      {regions.map(region => (
                        <Button type="button" variant="secondary" key={region.value} aria-pressed={data.region === region.value} className={data.region === region.value ? "border-sb-border-focus bg-sb-accent-muted" : ""} onClick={() => update("region", region.value)}>
                          {data.region === region.value && <Check size={12} />}{region.label}
                        </Button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-sb-2">
                      <p className="m-0 w-full text-sm font-medium">Channels already within reach <span className="font-normal text-sb-text-tertiary">Optional</span></p>
                      {launchChannelOptions.map(channel => (
                        <Button type="button" variant="secondary" key={channel.value} aria-pressed={data.launch_channels.includes(channel.value)} className={data.launch_channels.includes(channel.value) ? "border-sb-border-focus bg-sb-accent-muted" : ""} onClick={() => toggleChannel(channel.value)}>
                          {data.launch_channels.includes(channel.value) && <Check size={12} />}{channel.label}
                        </Button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Card>

            <footer className="flex flex-col gap-sb-3 border-t border-sb-border-hairline pt-sb-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="block text-sm font-medium">{current.phase}</span>
                <small className="text-sb-text-tertiary">{step + 1} of {steps.length} calibrated</small>
              </div>
              <div className="flex flex-wrap gap-sb-3">
                {step > 0 && <Button variant="ghost" onClick={prev}><ArrowLeft size={14} /> Back</Button>}
                <Button onClick={next} disabled={!canProceed() || saving}>
                  {saving
                    ? <><LoaderCircle className="animate-spin" size={15} /> Saving...</>
                    : step === steps.length - 1
                      ? <>Enter my decision room <ArrowRight size={15} /></>
                      : <>Calibrate next layer <ArrowRight size={15} /></>}
                </Button>
              </div>
            </footer>
          </section>
        </div>
      </div>
    </main>
  );
}
