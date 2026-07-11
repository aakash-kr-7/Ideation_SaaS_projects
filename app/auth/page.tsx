import Link from "next/link";
import { ArrowRight, LockKeyhole, Sparkles } from "lucide-react";
import { Brand } from "@/components/layout/brand";

export default function AuthPage() {
  return <main className="auth-page"><div className="auth-card"><Brand/><div className="auth-copy"><span className="auth-icon"><Sparkles size={20}/></span><p className="eyebrow">WELCOME TO BUILDSIGNAL</p><h1>Make your next idea earn its build time.</h1><p>Authentication is mocked in this foundation. Your first sign-in still begins with a short product tour, so you know exactly where to research, compare, and act.</p></div><Link className="oauth" href="/onboarding">Continue with Google <ArrowRight size={16}/></Link><Link className="email" href="/onboarding">Continue with email</Link><small><LockKeyhole size={13}/> No provider is connected in this demo.</small><Link href="/onboarding">Start the workspace tour <ArrowRight size={14}/></Link></div></main>;
}
