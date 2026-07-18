"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Database, Mail, ShieldCheck, UserRound, Save, LoaderCircle, CheckCircle2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useAuth } from "@/components/layout/auth-provider";
import { SUPPORT_EMAIL } from "@/lib/pricing";

export default function SettingsPage() {
  const { user, profile, refreshProfile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
    try {
      await fetch("/api/user/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          onboarding_completed: true,
        }),
      });
      await refreshProfile();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // Handle error
    } finally {
      setSaving(false);
    }
  };

  const update = (field: string, value: string) => {
    setFormData(d => ({ ...d, [field]: value }));
    setSaved(false);
  };

  return (
    <AppShell title="Settings">
      <div className="page-content settings-page">
        <div className="page-lead">
          <p className="eyebrow">Settings</p>
          <h2>Configure your workspace.</h2>
          <p>Manage your profile, research preferences, and account settings.</p>
        </div>

        {/* Profile Section */}
        <section className="settings-section">
          <div className="settings-section-header">
            <UserRound size={19} />
            <div>
              <h3>Profile</h3>
              <p>Your identity and research preferences. These shape your validation reports.</p>
            </div>
          </div>
          <div className="settings-form">
            <label className="settings-field">
              <span>Display name</span>
              <input
                type="text"
                value={formData.display_name}
                onChange={e => update("display_name", e.target.value)}
                placeholder="Your name"
              />
            </label>
            <label className="settings-field">
              <span>Email</span>
              <input type="email" value={user?.email || ""} disabled />
              <small>Email cannot be changed here</small>
            </label>
            <label className="settings-field">
              <span>Experience level</span>
              <select value={formData.experience_level} onChange={e => update("experience_level", e.target.value)}>
                <option value="">Not set</option>
                <option value="first-time">First-time builder</option>
                <option value="solo-founder">Solo founder</option>
                <option value="serial-founder">Serial founder</option>
                <option value="agency-studio">Agency / Studio</option>
                <option value="product-team">Product team member</option>
                <option value="student">Student / Learning</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Preferred market</span>
              <select value={formData.preferred_market} onChange={e => update("preferred_market", e.target.value)}>
                <option value="">Not set</option>
                <option value="B2B">B2B SaaS</option>
                <option value="D2C">Direct to Consumer</option>
                <option value="Creator">Creator Economy</option>
                <option value="Developer Tool">Developer Tools</option>
                <option value="Local Business">Local Business</option>
                <option value="Agency Tool">Agency Tools</option>
                <option value="Student/Career">Student / Career</option>
                <option value="Other">Other</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Revenue goal</span>
              <select value={formData.revenue_goal} onChange={e => update("revenue_goal", e.target.value)}>
                <option value="">Not set</option>
                <option value="side-income">$1k MRR — Side project</option>
                <option value="ramen">$5k MRR — Ramen profitability</option>
                <option value="full-time">$10k MRR — Full-time income</option>
                <option value="venture">Venture-scale</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Technical level</span>
              <select value={formData.technical_level} onChange={e => update("technical_level", e.target.value)}>
                <option value="">Not set</option>
                <option value="non-technical">Non-technical</option>
                <option value="some-coding">Some coding</option>
                <option value="full-stack">Full-stack developer</option>
              </select>
            </label>
            <label className="settings-field">
              <span>Region</span>
              <select value={formData.region} onChange={e => update("region", e.target.value)}>
                <option value="">Not set</option>
                <option value="us">United States</option>
                <option value="europe">Europe</option>
                <option value="india">India</option>
                <option value="global">Global / Remote</option>
                <option value="other">Other</option>
              </select>
            </label>
            <button className="button settings-save" onClick={handleSave} disabled={saving}>
              {saving ? (
                <><LoaderCircle className="animate-spin" size={14} /> Saving…</>
              ) : saved ? (
                <><CheckCircle2 size={14} /> Saved</>
              ) : (
                <><Save size={14} /> Save changes</>
              )}
            </button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <Database size={19} />
            <div>
              <h3>Data &amp; Storage</h3>
              <p>Your validation reports and evidence are stored securely in Supabase.</p>
            </div>
          </div>
          <div className="settings-info-card">
            <p>All research data is stored securely and linked to your account. Reports are exportable as Markdown, JSON, CSV, or PDF from any report page.</p>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-header">
            <Mail size={19} />
            <div>
              <h3>Account, privacy, and support</h3>
              <p>Get help or exercise your account and data rights.</p>
            </div>
          </div>
          <div className="settings-info-card settings-support-links">
            <p>Contact <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> for account deletion, privacy requests, report issues, or billing support.</p>
            <div><Link href="/support">Support</Link><Link href="/legal/privacy">Privacy</Link><Link href="/legal/terms">Terms</Link><Link href="/legal/refunds">Refunds</Link></div>
          </div>
        </section>

        <div className="security-note">
          <ShieldCheck size={19}/>
          <div>
            <b>Your data stays yours</b>
            <p>Source references remain attached to their evidence. Reports are exportable. Scores are never represented as revenue guarantees.</p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
