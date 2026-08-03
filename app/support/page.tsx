import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileQuestion, Mail, ReceiptText, ShieldAlert } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { LegalFooter } from "@/components/layout/legal-footer";
import { Card } from "@/components/ui/card";
import { SUPPORT_EMAIL } from "@/lib/pricing";

export const metadata: Metadata = { title: "Support | ShouldBuild", description: "Contact ShouldBuild support for account, report, access, or privacy help." };

const linkClass = "text-sm text-sb-text-primary underline decoration-sb-border-hairline-strong underline-offset-4 hover:decoration-sb-text-secondary";

export default function SupportPage() {
  return (
    <main className="min-h-screen bg-sb-bg-base text-sb-text-primary">
      <header className="border-b border-sb-border-hairline">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-sb-4 px-sb-5 py-sb-4 md:px-sb-8">
          <Brand />
          <Link className="inline-flex items-center gap-sb-2 text-sm text-sb-text-secondary hover:text-sb-text-primary" href="/"><ArrowLeft size={14} />Back to ShouldBuild</Link>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-3xl justify-items-start gap-sb-4 px-sb-5 pb-sb-10 pt-sb-16 md:px-sb-8">
        <p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-sb-text-tertiary">ShouldBuild support</p>
        <h1 className="m-0 font-sb-display text-4xl font-[480] tracking-[-0.015em]">How can we help?</h1>
        <p className="m-0 max-w-2xl text-base leading-8 text-sb-text-secondary">For account, report, entitlement, or privacy questions, email the ShouldBuild support team. Paid checkout is not currently available.</p>
        <a className="inline-flex min-h-10 items-center justify-center gap-sb-2 rounded-sb-md border border-sb-accent bg-sb-accent px-sb-4 py-sb-2 text-sm font-medium text-sb-text-primary transition-colors duration-sb-fast ease-sb-standard hover:border-sb-accent-hover hover:bg-sb-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href={`mailto:${SUPPORT_EMAIL}`}><Mail size={16} />Email {SUPPORT_EMAIL}</a>
      </section>

      <section className="mx-auto grid w-full max-w-5xl gap-sb-4 px-sb-5 pb-sb-8 md:grid-cols-3 md:px-sb-8">
        <Card className="grid content-start gap-sb-3 p-sb-5"><FileQuestion className="text-sb-text-secondary" size={19} /><h2 className="m-0 text-lg font-[480]">Report issue</h2><p className="m-0 text-sm leading-relaxed text-sb-text-secondary">Include the report or run ID, the account email, what you expected, and what happened. Do not send passwords or sensitive idea details.</p></Card>
        <Card className="grid content-start gap-sb-3 p-sb-5"><ReceiptText className="text-sb-text-secondary" size={19} /><h2 className="m-0 text-lg font-[480]">Payments status</h2><p className="m-0 text-sm leading-relaxed text-sb-text-secondary">Paid checkout is unavailable. Report any unexpected ShouldBuild charge descriptor without sending complete card details.</p><Link className={linkClass} href="/legal/refunds">Review payments status</Link></Card>
        <Card className="grid content-start gap-sb-3 p-sb-5"><ShieldAlert className="text-sb-text-secondary" size={19} /><h2 className="m-0 text-lg font-[480]">Privacy or security</h2><p className="m-0 text-sm leading-relaxed text-sb-text-secondary">Use the subject “Privacy request” or “Security issue.” Never email a password, authentication code, or complete payment-card number.</p><Link className={linkClass} href="/legal/privacy">Review the privacy policy</Link></Card>
      </section>

      <Card className="mx-auto mb-sb-16 grid w-[calc(100%_-_2.5rem)] max-w-5xl gap-sb-2 border-dashed p-sb-5 md:w-[calc(100%_-_4rem)]"><b className="text-sm">Research conclusions are not support defects.</b><p className="m-0 text-sm leading-relaxed text-sb-text-secondary">ShouldBuild reduces uncertainty but does not guarantee a business outcome. Verified technical failures restore credits under the published policy.</p></Card>
      <LegalFooter />
    </main>
  );
}
