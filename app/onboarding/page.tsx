"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Check, User, Briefcase, Target, Rocket, Code, LoaderCircle } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { createClient } from "@/lib/supabase/client";

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
    eyebrow: "Let's personalize your experience",
    title: "What should we call you?",
    why: "We'll use your name to personalize reports and recommendations.",
  },
  {
    id: "experience",
    icon: Briefcase,
    eyebrow: "Your background shapes our recommendations",
    title: "What describes you best?",
    why: "This adjusts the language and depth of our reports. A first-time founder needs different guidance than a serial entrepreneur.",
  },
  {
    id: "market",
    icon: Target,
    eyebrow: "Default research settings",
    title: "What market are you focused on?",
    why: "Pre-fills your research form so you can validate ideas faster. You can always change it per-idea.",
  },
  {
    id: "goals",
    icon: Rocket,
    eyebrow: "Revenue and business model preferences",
    title: "What are you building toward?",
    why: "This shapes pricing analysis and revenue path calculations in your reports.",
  },
  {
    id: "technical",
    icon: Code,
    eyebrow: "Technical context and region",
    title: "A few more details to refine your reports.",
    why: "Your technical level affects MVP scope recommendations. Region shapes launch channel suggestions.",
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

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
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
    // Pre-fill name from auth profile
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.user_metadata?.full_name) {
        setData(d => ({ ...d, display_name: user.user_metadata.full_name }));
      } else if (user?.email) {
        setData(d => ({ ...d, display_name: user.email!.split("@")[0] }));
      }
    });
  }, []);

  const update = (field: keyof OnboardingData, value: any) => {
    setData(d => ({ ...d, [field]: value }));
  };

  const toggleChannel = (channel: string) => {
    setData(d => ({
      ...d,
      launch_channels: d.launch_channels.includes(channel)
        ? d.launch_channels.filter(c => c !== channel)
        : [...d.launch_channels, channel],
    }));
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
    try {
      await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          onboarding_completed: true,
        }),
      });
      router.replace("/dashboard?tour=start");
    } catch {
      router.replace("/dashboard");
    }
  };

  const skip = async () => {
    setSaving(true);
    try {
      await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          display_name: data.display_name || null,
          onboarding_completed: true,
        }),
      });
    } catch {
      // Best effort
    }
    router.replace("/dashboard?tour=start");
  };

  const next = () => {
    if (step < steps.length - 1) {
      setStep(s => s + 1);
    } else {
      finish();
    }
  };

  const prev = () => {
    if (step > 0) setStep(s => s - 1);
  };

  const current = steps[step];
  const Icon = current.icon;

  return (
    <main className="onboarding-page">
      <div className="onboarding-bg" />
      <div className="onboarding-shell">
        <header className="onboarding-header">
          <Brand />
          <button className="onboarding-skip" onClick={skip} disabled={saving}>
            Skip for now
          </button>
        </header>

        <div className="onboarding-card" key={step}>
          <div className="onboarding-card-icon">
            <Icon size={22} />
          </div>
          <p className="eyebrow">{current.eyebrow}</p>
          <h1>{current.title}</h1>
          <p className="onboarding-why">{current.why}</p>

          <div className="onboarding-fields">
            {/* Step 0: Name */}
            {step === 0 && (
              <label className="onboarding-text-field">
                <input
                  type="text"
                  value={data.display_name}
                  onChange={e => update("display_name", e.target.value)}
                  placeholder="Your name"
                  autoFocus
                />
              </label>
            )}

            {/* Step 1: Experience level */}
            {step === 1 && (
              <div className="onboarding-option-grid">
                {experienceLevels.map(opt => (
                  <button
                    key={opt.value}
                    className={`onboarding-option ${data.experience_level === opt.value ? "selected" : ""}`}
                    onClick={() => update("experience_level", opt.value)}
                  >
                    {data.experience_level === opt.value && <Check size={14} />}
                    <b>{opt.label}</b>
                    <small>{opt.desc}</small>
                  </button>
                ))}
              </div>
            )}

            {/* Step 2: Market + Customer type */}
            {step === 2 && (
              <>
                <div className="onboarding-chip-grid">
                  {markets.map(m => (
                    <button
                      key={m.value}
                      className={`onboarding-chip ${data.preferred_market === m.value ? "selected" : ""}`}
                      onClick={() => update("preferred_market", m.value)}
                    >
                      {data.preferred_market === m.value && <Check size={12} />}
                      {m.label}
                    </button>
                  ))}
                </div>
                <label className="onboarding-text-field" style={{ marginTop: 16 }}>
                  <span>Who is your typical target customer?</span>
                  <input
                    type="text"
                    value={data.target_customer_type}
                    onChange={e => update("target_customer_type", e.target.value)}
                    placeholder="e.g. Solo freelancers, SMB owners, DevOps engineers"
                  />
                </label>
              </>
            )}

            {/* Step 3: Revenue + Business Model */}
            {step === 3 && (
              <>
                <div className="onboarding-option-grid compact">
                  {revenueGoals.map(opt => (
                    <button
                      key={opt.value}
                      className={`onboarding-option ${data.revenue_goal === opt.value ? "selected" : ""}`}
                      onClick={() => update("revenue_goal", opt.value)}
                    >
                      {data.revenue_goal === opt.value && <Check size={14} />}
                      <b>{opt.label}</b>
                      <small>{opt.desc}</small>
                    </button>
                  ))}
                </div>
                <div className="onboarding-chip-grid" style={{ marginTop: 20 }}>
                  <p className="onboarding-sub-label">Preferred business model</p>
                  {businessModels.map(m => (
                    <button
                      key={m.value}
                      className={`onboarding-chip ${data.business_model === m.value ? "selected" : ""}`}
                      onClick={() => update("business_model", m.value)}
                    >
                      {data.business_model === m.value && <Check size={12} />}
                      {m.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Step 4: Technical + Region + Launch Channels */}
            {step === 4 && (
              <>
                <div className="onboarding-option-grid compact">
                  {technicalLevels.map(opt => (
                    <button
                      key={opt.value}
                      className={`onboarding-option ${data.technical_level === opt.value ? "selected" : ""}`}
                      onClick={() => update("technical_level", opt.value)}
                    >
                      {data.technical_level === opt.value && <Check size={14} />}
                      <b>{opt.label}</b>
                      <small>{opt.desc}</small>
                    </button>
                  ))}
                </div>
                <div className="onboarding-chip-grid" style={{ marginTop: 20 }}>
                  <p className="onboarding-sub-label">Your region</p>
                  {regions.map(r => (
                    <button
                      key={r.value}
                      className={`onboarding-chip ${data.region === r.value ? "selected" : ""}`}
                      onClick={() => update("region", r.value)}
                    >
                      {data.region === r.value && <Check size={12} />}
                      {r.label}
                    </button>
                  ))}
                </div>
                <div className="onboarding-chip-grid" style={{ marginTop: 20 }}>
                  <p className="onboarding-sub-label">Preferred launch channels (select any)</p>
                  {launchChannelOptions.map(ch => (
                    <button
                      key={ch.value}
                      className={`onboarding-chip ${data.launch_channels.includes(ch.value) ? "selected" : ""}`}
                      onClick={() => toggleChannel(ch.value)}
                    >
                      {data.launch_channels.includes(ch.value) && <Check size={12} />}
                      {ch.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="onboarding-progress">
          {steps.map((_, i) => (
            <i className={i <= step ? "active" : ""} key={i} />
          ))}
        </div>

        <div className="onboarding-actions">
          {step > 0 && (
            <button className="button ghost onboarding-back" onClick={prev}>
              <ArrowLeft size={14} /> Back
            </button>
          )}
          <button
            className="button onboarding-next"
            onClick={next}
            disabled={!canProceed() || saving}
          >
            {saving ? (
              <><LoaderCircle className="animate-spin" size={15} /> Saving…</>
            ) : step === steps.length - 1 ? (
              <><Check size={15} /> Finish setup</>
            ) : (
              <>Continue <ArrowRight size={15} /></>
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
