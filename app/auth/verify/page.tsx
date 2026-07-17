"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Mail, ArrowRight, LoaderCircle, CheckCircle2 } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { createClient } from "@/lib/supabase/client";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [email, setEmail] = useState("");

  useEffect(() => {
    // Try to get the email from the current session or localStorage
    const stored = typeof window !== "undefined" ? localStorage.getItem("shouldbuild-verify-email") : null;
    if (stored) setEmail(stored);

    // Check if already verified
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user?.email_confirmed_at) {
        router.replace("/dashboard");
      }
    });
  }, [router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const handleResend = async () => {
    if (!email || cooldown > 0) return;
    setResending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resend({ type: "signup", email });
      if (error) throw error;
      setResent(true);
      setCooldown(60);
      setTimeout(() => setResent(false), 4000);
    } catch {
      // Silently handle — don't reveal whether email exists
    } finally {
      setResending(false);
    }
  };

  return (
    <main className="auth-page">
      <div className="auth-card auth-verify-card">
        <Brand />
        <div className="auth-verify-icon">
          <Mail size={28} />
        </div>
        <div className="auth-copy">
          <h1>Check your email</h1>
          <p>
            We sent a verification link to{" "}
            {email ? <strong>{email}</strong> : "your email address"}.
            Click the link to verify your account and get started.
          </p>
        </div>

        <div className="auth-verify-steps">
          <div className="verify-step">
            <span>1</span>
            <div>
              <b>Open your email</b>
              <small>Check your inbox (and spam folder)</small>
            </div>
          </div>
          <div className="verify-step">
            <span>2</span>
            <div>
              <b>Click the verification link</b>
              <small>The link expires in 60 minutes</small>
            </div>
          </div>
          <div className="verify-step">
            <span>3</span>
            <div>
              <b>Start validating ideas</b>
              <small>You&apos;ll be redirected automatically</small>
            </div>
          </div>
        </div>

        <div className="auth-verify-actions">
          <button
            className="button ghost"
            onClick={handleResend}
            disabled={resending || cooldown > 0}
          >
            {resending ? (
              <><LoaderCircle className="animate-spin" size={14} /> Sending…</>
            ) : resent ? (
              <><CheckCircle2 size={14} /> Email sent!</>
            ) : cooldown > 0 ? (
              `Resend in ${cooldown}s`
            ) : (
              "Resend verification email"
            )}
          </button>
          <button className="button" onClick={() => router.push("/sign-in")}>
            Back to sign in <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </main>
  );
}
