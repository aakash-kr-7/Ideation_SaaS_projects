import Link from "next/link";
import { ArrowUpRight, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/pricing";
import { Brand } from "./brand";

export function LegalFooter({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return <footer className="sb-global-footer sb-global-footer-compact">
      <div className="sb-footer-compact-brand">
        <Brand />
        <span><ShieldCheck size={12}/> Evidence stays attached to the verdict.</span>
      </div>
      <nav aria-label="Legal and support">
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/refunds">Refunds</Link>
        <Link href="/support"><Mail size={12}/> Support</Link>
      </nav>
      <span className="sb-footer-copyright">© {new Date().getFullYear()} ShouldBuild</span>
    </footer>;
  }

  return <footer className="sb-global-footer sb-global-footer-full">
    <div className="sb-footer-brand">
      <Brand />
      <p>Know what deserves the build—before time, attention, and money make the decision for you.</p>
      <span><ShieldCheck size={13}/> Source-linked research · Private by default</span>
    </div>

    <div className="sb-footer-directory">
      <nav aria-label="Product">
        <b>Decision system</b>
        <Link href="/research/new">Validate an idea</Link>
        <Link href="/sample-report">View a sample report</Link>
        <Link href="/pricing">Plans &amp; report depth</Link>
      </nav>
      <nav aria-label="Trust and support">
        <b>Trust &amp; terms</b>
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/legal/terms">Terms</Link>
        <Link href="/legal/refunds">Refunds</Link>
        <Link href="/support"><Mail size={12}/> Support</Link>
      </nav>
    </div>

    <div className="sb-footer-action">
      <span><Sparkles size={13}/> Have an idea worth pressure-testing?</span>
      <Link href="/research/new">Put it on trial <ArrowUpRight size={14}/></Link>
      <a className="sb-footer-email" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
    </div>

    <div className="sb-footer-floor">
      <p>© {new Date().getFullYear()} ShouldBuild · Decision intelligence for builders.</p>
      <span>Evidence reduces uncertainty. It does not manufacture certainty.</span>
    </div>
  </footer>;
}
