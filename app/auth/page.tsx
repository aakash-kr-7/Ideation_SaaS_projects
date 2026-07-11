import Link from "next/link";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { Brand } from "@/components/layout/brand";

export default function AuthPage() {
  return <main className="auth-page"><div className="auth-card"><Brand/><div className="auth-copy"><span className="auth-icon"><Sparkles size={20}/></span><p className="eyebrow">SIGNALFIT RESEARCH PLATFORM</p><h1>Make informed product decisions, not expensive assumptions.</h1><p>Access structured research memos, competitive intelligence, and evidence-backed recommendations — built for the decisions that happen before code gets written.</p></div><Link className="oauth" href="/onboarding">Continue with Google <ArrowRight size={16}/></Link><Link className="email" href="/onboarding">Continue with email</Link><small><LockKeyhole size={13}/> Authentication is configured for demonstration.</small><Link href="/onboarding">Begin workspace orientation <ArrowRight size={14}/></Link></div></main>;
}
