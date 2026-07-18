import Link from "next/link";
import { Mail } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/pricing";

export function LegalFooter({ compact = false }: { compact?: boolean }) {
  return <footer className={compact ? "legal-footer compact" : "legal-footer"}>
    <p>© {new Date().getFullYear()} ShouldBuild. Evidence-backed market validation.</p>
    <nav aria-label="Legal and support">
      <Link href="/legal/terms">Terms</Link>
      <Link href="/legal/privacy">Privacy</Link>
      <Link href="/legal/refunds">Refunds</Link>
      <Link href="/support"><Mail size={12}/>Support</Link>
    </nav>
    <a className="legal-footer-email" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>
  </footer>;
}
