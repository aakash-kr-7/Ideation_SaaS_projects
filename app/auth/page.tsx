import Link from "next/link";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { Brand } from "@/components/layout/brand";

export default function AuthPage() {
  return <main className="auth-page"><div className="auth-card"><Brand/><div className="auth-copy"><span className="auth-icon"><Sparkles size={20}/></span><p className="eyebrow">SIGNALFIT VALIDATION PLATFORM</p><h1>Stop guessing. Validate your product idea in minutes.</h1><p>Access structured validation reports, competitive intelligence, pricing analysis, and evidence-backed recommendations — before you write a single line of code.</p></div><Link className="oauth" href="/onboarding">Continue with Google <ArrowRight size={16}/></Link><Link className="email" href="/onboarding">Continue with email</Link><small><LockKeyhole size={13}/> Sandbox authentication is active.</small><Link href="/onboarding" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 12, fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>Begin onboarding tour <ArrowRight size={14}/></Link></div></main>;
}
