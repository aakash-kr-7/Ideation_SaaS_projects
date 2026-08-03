"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Database, LoaderCircle, Mail, Save, ShieldCheck, UserRound } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/components/layout/auth-provider";
import { ProjectSettings } from "@/components/settings/project-settings";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SUPPORT_EMAIL } from "@/lib/pricing";

const fieldClass = "grid gap-sb-2 text-sm font-medium text-sb-text-primary";
const selectClass = "min-h-10 w-full rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-1 px-sb-3 py-sb-2 text-sm text-sb-text-primary transition-colors duration-sb-fast ease-sb-standard focus:border-sb-border-focus focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus";
const sectionHeadingClass = "flex items-start gap-sb-3 border-b border-sb-border-hairline pb-sb-4 text-sb-text-secondary";

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [formData, setFormData] = useState({
    display_name: "",
    experience_level: "",
    preferred_market: "",
    target_customer_type: "",
    revenue_goal: "",
    business_model: "",
    technical_level: "",
    region: "",
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        display_name: profile.display_name || "",
        experience_level: profile.experience_level || "",
        preferred_market: profile.preferred_market || "",
        target_customer_type: profile.target_customer_type || "",
        revenue_goal: profile.revenue_goal || "",
        business_model: profile.business_model || "",
        technical_level: profile.technical_level || "",
        region: profile.region || "",
      });
    }
  }, [profile]);

  const handleSave = async () => {
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...formData, onboarding_completed: true }),
      });
      if (!response.ok) {
        const result: unknown = await response.json().catch(() => null);
        const message = typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
          ? result.error
          : "Settings could not be saved. Review the form and try again.";
        throw new Error(message);
      }
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (caught: unknown) {
      setSaveError(caught instanceof Error ? caught.message : "Settings could not be saved. Review the form and try again.");
    } finally {
      setSaving(false);
    }
  };

  const update = (field: string, value: string) => {
    setFormData(current => ({ ...current, [field]: value }));
    setSaved(false);
  };

  return (
    <AppShell title="Settings">
      <div className="mx-auto grid w-full max-w-4xl gap-sb-6 px-sb-5 py-sb-8 md:px-sb-8">
        <div className="grid gap-sb-2">
          <p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-sb-text-tertiary">Decision system calibration</p>
          <h2 className="m-0 font-sb-display text-2xl font-[480] tracking-[-0.015em]">Make every verdict fit the way you build.</h2>
          <p className="m-0 max-w-2xl text-sm leading-relaxed text-sb-text-secondary">Your market, ambition, technical range, and working context shape what a useful next move looks like.</p>
        </div>

        <Card className="grid gap-sb-5 p-sb-5 md:p-sb-6">
          <div className={sectionHeadingClass}>
            <UserRound size={19} />
            <div><h3 className="m-0 text-base font-[480] text-sb-text-primary">Decision lens</h3><p className="m-0 text-sm leading-relaxed">The personal and commercial context carried into every new validation.</p></div>
          </div>
          <div className="grid gap-sb-4 md:grid-cols-2">
            {saveError && <Card className="border-sb-verdict-avoid p-sb-3 text-sm text-sb-verdict-avoid md:col-span-2" role="alert">{saveError}</Card>}
            <label className={fieldClass}><span>Display name</span><Input type="text" value={formData.display_name} onChange={event => update("display_name", event.target.value)} placeholder="Your name" /></label>
            <label className={fieldClass}><span>Email</span><Input type="email" value={user?.email || ""} disabled /><small className="font-normal text-sb-text-tertiary">Email cannot be changed here</small></label>
            <label className={fieldClass}><span>Experience level</span><select className={selectClass} value={formData.experience_level} onChange={event => update("experience_level", event.target.value)}><option value="">Not set</option><option value="first-time">First-time builder</option><option value="solo-founder">Solo founder</option><option value="serial-founder">Serial founder</option><option value="agency-studio">Agency / Studio</option><option value="product-team">Product team member</option><option value="student">Student / Learning</option></select></label>
            <label className={fieldClass}><span>Preferred market</span><select className={selectClass} value={formData.preferred_market} onChange={event => update("preferred_market", event.target.value)}><option value="">Not set</option><option value="B2B">B2B SaaS</option><option value="D2C">Direct to Consumer</option><option value="Creator">Creator Economy</option><option value="Developer Tool">Developer Tools</option><option value="Local Business">Local Business</option><option value="Agency Tool">Agency Tools</option><option value="Student/Career">Student / Career</option><option value="Other">Other</option></select></label>
            <label className={fieldClass}><span>Revenue goal</span><select className={selectClass} value={formData.revenue_goal} onChange={event => update("revenue_goal", event.target.value)}><option value="">Not set</option><option value="side-income">$1k MRR — Side project</option><option value="ramen">$5k MRR — Ramen profitability</option><option value="full-time">$10k MRR — Full-time income</option><option value="venture">Venture-scale</option></select></label>
            <label className={fieldClass}><span>Technical level</span><select className={selectClass} value={formData.technical_level} onChange={event => update("technical_level", event.target.value)}><option value="">Not set</option><option value="non-technical">Non-technical</option><option value="some-coding">Some coding</option><option value="full-stack">Full-stack developer</option></select></label>
            <label className={fieldClass}><span>Region</span><select className={selectClass} value={formData.region} onChange={event => update("region", event.target.value)}><option value="">Not set</option><option value="us">United States</option><option value="europe">Europe</option><option value="india">India</option><option value="global">Global / Remote</option><option value="other">Other</option></select></label>
            <div className="flex items-end"><Button onClick={handleSave} disabled={saving}>{saving ? <><LoaderCircle className="animate-spin" size={14} /> Saving…</> : saved ? <><CheckCircle2 size={14} /> Saved</> : <><Save size={14} /> Save changes</>}</Button></div>
          </div>
        </Card>

        <ProjectSettings />

        <Card className="grid gap-sb-4 p-sb-5 md:p-sb-6">
          <div className={sectionHeadingClass}><Database size={19} /><div><h3 className="m-0 text-base font-[480] text-sb-text-primary">Data &amp; Storage</h3><p className="m-0 text-sm leading-relaxed">Your validation reports and evidence use tenant-scoped Supabase storage.</p></div></div>
          <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">Full Validation supports PDF, Markdown, CSV, and JSON exports. Quick Scan supports PDF. Export buttons appear only when the stored report includes that format.</p>
        </Card>

        <Card className="grid gap-sb-4 p-sb-5 md:p-sb-6">
          <div className={sectionHeadingClass}><Mail size={19} /><div><h3 className="m-0 text-base font-[480] text-sb-text-primary">Account, privacy, and support</h3><p className="m-0 text-sm leading-relaxed">Get help or exercise your account and data rights.</p></div></div>
          <div className="grid gap-sb-3 text-sm leading-relaxed text-sb-text-secondary">
            <p className="m-0">Contact <a className="text-sb-text-primary underline underline-offset-4" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for account deletion, privacy requests, report issues, or access questions. Paid checkout is not currently available.</p>
            <div className="flex flex-wrap gap-sb-4"><Link className="text-sb-text-primary underline underline-offset-4" href="/support">Support</Link><Link className="text-sb-text-primary underline underline-offset-4" href="/legal/privacy">Privacy</Link><Link className="text-sb-text-primary underline underline-offset-4" href="/legal/terms">Terms</Link><Link className="text-sb-text-primary underline underline-offset-4" href="/legal/refunds">Refunds</Link></div>
          </div>
        </Card>

        <Card className="flex items-start gap-sb-3 border-dashed p-sb-5"><ShieldCheck className="shrink-0 text-sb-text-secondary" size={19} /><div><b className="text-sm">Your data stays yours</b><p className="mb-0 mt-sb-1 text-sm leading-relaxed text-sb-text-secondary">Source references remain attached to their evidence. Reports are exportable. Scores are never represented as revenue guarantees.</p></div></Card>
      </div>
    </AppShell>
  );
}
