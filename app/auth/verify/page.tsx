"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, LoaderCircle, Mail } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass-panel";
import { createClient } from "@/lib/supabase/client";
import { authEntryUrl, safeAuthRedirect } from "@/lib/auth-redirect";

const stepClass = "grid grid-cols-[2rem_1fr] items-start gap-sb-3 rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 p-sb-3";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [nextPath, setNextPath] = useState("/dashboard");
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [email, setEmail] = useState("");

  useEffect(() => {
    const intendedDestination = safeAuthRedirect(new URL(window.location.href).searchParams.get("next"));
    setNextPath(intendedDestination);
    const stored = localStorage.getItem("shouldbuild-verify-email");
    if (stored) setEmail(stored);

    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email_confirmed_at) {
        const storedRedirect = localStorage.getItem("shouldbuild-auth-redirect");
        localStorage.removeItem("shouldbuild-auth-redirect");
        router.replace(safeAuthRedirect(storedRedirect, intendedDestination));
      }
    });
  }, [router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(current => current - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (!email || cooldown > 0) return;
    setResending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(nextPath)}` },
      });
      if (error) throw error;
      setResent(true);
      setCooldown(60);
      setTimeout(() => setResent(false), 4000);
    } catch {
      // Do not reveal whether an email address exists.
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="relative isolate grid min-h-screen overflow-hidden bg-sb-bg-base text-sb-text-primary">
      <AuroraBackground className="opacity-60"/>
      <main className="relative z-[1] grid min-h-screen place-items-center px-sb-5 py-sb-10">
      <GlassPanel className="grid w-full max-w-lg gap-sb-6 p-sb-8">
        <Brand />
        <div className="grid size-12 place-items-center rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 text-sb-text-secondary"><Mail size={28} /></div>
        <div className="grid gap-sb-2">
          <h1 className="m-0 font-sb-display text-2xl font-[480]">Check your email</h1>
          <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">
            We sent a verification link to {email ? <strong className="text-sb-text-primary">{email}</strong> : "your email address"}. Click the link to verify your account and get started.
          </p>
        </div>

        <div className="grid gap-sb-3">
          {[
            ["Open your email", "Check your inbox (and spam folder)"],
            ["Click the verification link", "Use the link before it expires"],
            ["Start validating ideas", "You'll be redirected automatically"],
          ].map(([title, detail], index) => (
            <div className={stepClass} key={title}>
              <span className="grid size-8 place-items-center rounded-sb-pill border border-sb-border-hairline-strong font-sb-mono text-xs">{index + 1}</span>
              <div><b className="block text-sm">{title}</b><small className="text-sb-text-secondary">{detail}</small></div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-sb-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={handleResend} disabled={resending || cooldown > 0}>
            {resending ? <><LoaderCircle className="animate-spin" size={14} /> Sending…</> : resent ? <><CheckCircle2 size={14} /> Email sent</> : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification email"}
          </Button>
          <Button className="relative overflow-hidden" onClick={() => router.push(authEntryUrl(nextPath))}>
            Back to sign in <ArrowRight size={14} />
            <BorderBeam persistent/>
          </Button>
        </div>
      </GlassPanel>
      </main>
    </div>
  );
}
