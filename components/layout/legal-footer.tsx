import Link from "next/link";
import { ArrowUpRight, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/pricing";
import { Brand } from "./brand";

export function LegalFooter({ compact = false }: { compact?: boolean }) {
  return <footer className={compact ? "legal-footer compact" : "legal-footer"}>
    <div className="legal-footer-glow" aria-hidden="true" />
    <div className="legal-footer-brand">
      <Brand />
      <p>Turn the idea competing for your attention into a decision you can defend.</p>
      <span><ShieldCheck size={13}/> Source-linked research · Private workspace</span>
    </div>

    <div className="legal-footer-directory">
      <nav aria-label="Product">
        <b>Decision system</b>
        <Link href="/research/new">Validate an idea</Link>
        <Link href="/sample-report">Enter a sample report</Link>
        <Link href="/pricing">Access &amp; pricing</Link>
      </nav>
      <nav aria-label="Trust and support">
        <b>Trust layer</b>
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/refunds">Refunds</Link>
        <Link href="/support"><Mail size={12}/>Support</Link>
      </nav>
    </div>

    <div className="legal-footer-action">
      <span><Sparkles size={13}/> Have an idea worth pressure-testing?</span>
      <Link href="/research/new">Put it on trial <ArrowUpRight size={14}/></Link>
      <a className="legal-footer-email" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
    </div>

    <div className="legal-footer-floor">
      <p>© {new Date().getFullYear()} ShouldBuild · Decision intelligence for builders.</p>
      <span>Evidence reduces uncertainty. It does not manufacture certainty.</span>
    </div>
  </footer>;
}
