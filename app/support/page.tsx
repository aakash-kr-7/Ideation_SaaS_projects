import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileQuestion, Mail, ReceiptText, ShieldAlert } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { LegalFooter } from "@/components/layout/legal-footer";
import { SUPPORT_EMAIL } from "@/lib/pricing";

export const metadata: Metadata = { title: "Support | ShouldBuild", description: "Contact ShouldBuild support for account, report, billing, refund, or privacy help." };

export default function SupportPage() {
  return <main className="support-page">
    <header className="legal-header"><Brand/><Link href="/"><ArrowLeft size={14}/>Back to ShouldBuild</Link></header>
    <section className="support-hero">
      <p className="eyebrow">ShouldBuild support</p>
      <h1>How can we help?</h1>
      <p>For account, report, billing, refund, or privacy questions, email the ShouldBuild support team. Include the details below so we can resolve the issue efficiently.</p>
      <a className="button" href={`mailto:${SUPPORT_EMAIL}`}><Mail size={16}/>Email {SUPPORT_EMAIL}</a>
    </section>
    <section className="support-grid">
      <article><FileQuestion size={19}/><h2>Report issue</h2><p>Include the report or run ID, the account email, what you expected, and what happened. Do not send passwords or sensitive idea details.</p></article>
      <article><ReceiptText size={19}/><h2>Billing or refund</h2><p>Include the account email and Dodo Payments invoice or transaction reference.</p><Link href="/legal/refunds">Review the refund policy</Link></article>
      <article><ShieldAlert size={19}/><h2>Privacy or security</h2><p>Use the subject “Privacy request” or “Security issue.” Never email a password, authentication code, or complete payment-card number.</p><Link href="/legal/privacy">Review the privacy policy</Link></article>
    </section>
    <div className="support-note"><b>Research conclusions are not support defects.</b><p>ShouldBuild reduces uncertainty but does not guarantee a business outcome. Verified technical failures restore credits under the published policy.</p></div>
    <LegalFooter />
  </main>;
}
