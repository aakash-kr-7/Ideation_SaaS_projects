import Link from "next/link";
import { ArrowUpRight, Mail, ShieldCheck } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/pricing";
import { Brand } from "./brand";

const legalLinks = [
  { href: "/legal/privacy", label: "Privacy" },
  { href: "/legal/terms", label: "Terms" },
  { href: "/legal/refunds", label: "Refunds" },
] as const;

const linkClass = "rounded-sb-sm text-sm text-sb-text-tertiary hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus";

export function LegalFooter({ compact = false }: { compact?: boolean }) {
  const year = new Date().getFullYear();

  if (compact) {
    return (
      <footer className="flex flex-col gap-sb-3 border-t border-sb-border-hairline px-sb-4 py-sb-5 text-xs text-sb-text-tertiary sm:flex-row sm:items-center sm:justify-between md:px-sb-6">
        <span className="inline-flex items-center gap-sb-2"><ShieldCheck size={12}/> Evidence stays attached to the verdict.</span>
        <nav className="flex flex-wrap items-center gap-sb-4" aria-label="Legal and support">
          {legalLinks.map((link) => <Link className={linkClass} href={link.href} key={link.href}>{link.label}</Link>)}
          <Link className={linkClass} href="/support"><Mail className="mr-sb-1 inline" size={12}/>Support</Link>
        </nav>
        <span className="font-sb-mono tabular-nums">© {year} ShouldBuild</span>
      </footer>
    );
  }

  return (
    <footer className="border-t border-sb-border-hairline bg-sb-bg-surface-1 px-sb-5 py-sb-10 text-sb-text-secondary md:px-sb-8">
      <div className="mx-auto grid max-w-6xl gap-sb-8 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Brand/>
          <p className="mb-0 mt-sb-4 max-w-md text-sm leading-relaxed text-sb-text-secondary">Know what deserves the build before time, attention, and money make the decision for you.</p>
          <span className="mt-sb-4 inline-flex items-center gap-sb-2 text-xs text-sb-text-tertiary"><ShieldCheck size={13}/>Source-linked research · Private by default</span>
        </div>

        <nav className="grid content-start gap-sb-3" aria-label="Product">
          <b className="text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Decision system</b>
          <Link className={linkClass} href="/research/new">Validate an idea</Link>
          <Link className={linkClass} href="/sample-report">View a sample report</Link>
          <Link className={linkClass} href="/pricing">Plans and report depth</Link>
        </nav>

        <nav className="grid content-start gap-sb-3" aria-label="Trust and support">
          <b className="text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Trust and terms</b>
          {legalLinks.map((link) => <Link className={linkClass} href={link.href} key={link.href}>{link.label}</Link>)}
          <Link className={linkClass} href="/support"><Mail className="mr-sb-1 inline" size={12}/>Support</Link>
        </nav>
      </div>

      <div className="mx-auto mt-sb-8 flex max-w-6xl flex-col gap-sb-4 border-t border-sb-border-hairline pt-sb-5 text-xs text-sb-text-tertiary sm:flex-row sm:items-center sm:justify-between">
        <p className="m-0 font-sb-mono tabular-nums">© {year} ShouldBuild</p>
        <span>Evidence reduces uncertainty. It does not manufacture certainty.</span>
        <a className={linkClass} href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}<ArrowUpRight className="ml-sb-1 inline" size={12}/></a>
      </div>
    </footer>
  );
}
