"use client";

import { Suspense, useCallback, useLayoutEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
  X,
} from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { GlassPanel } from "@/components/ui/glass-panel";
import { Input } from "@/components/ui/input";
import { ScrambleReveal } from "@/components/ui/scramble-reveal";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/supabase/relations";
import { authCallbackUrl, safeAuthRedirect } from "@/lib/auth-redirect";
import { authErrorMessage } from "@/lib/public-errors";

type AuthView = "sign-in" | "register" | "forgot-password";

const SIGN_IN_WORDMARK_STORAGE_KEY = "sb-signin-wordmark-resolved:v1";
let signInWordmarkResolvedInMemory = false;

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="currentColor" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="currentColor" />
    </svg>
  );
}

function SignInCard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const wordmarkDecisionRef = useRef<boolean | null>(null);
  const redirectTo = safeAuthRedirect(searchParams.get("redirectTo"));
  const authError = searchParams.get("error");
  const authMessage = searchParams.get("message");

  const [view, setView] = useState<AuthView>(searchParams.get("view") === "register" ? "register" : "sign-in");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    authError ? (authMessage ? decodeURIComponent(authMessage) : "Authentication failed. Please try again.") : ""
  );
  const [success, setSuccess] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [playWordmark, setPlayWordmark] = useState(false);

  useLayoutEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let alreadyResolved = signInWordmarkResolvedInMemory;

    try {
      alreadyResolved ||=
        window.sessionStorage.getItem(SIGN_IN_WORDMARK_STORAGE_KEY) === "true";
    } catch {
      // The component-level one-shot ref remains the fallback when storage is unavailable.
    }

    if (wordmarkDecisionRef.current === null) {
      wordmarkDecisionRef.current = !reducedMotion && !alreadyResolved;
    }

    signInWordmarkResolvedInMemory = true;

    try {
      window.sessionStorage.setItem(SIGN_IN_WORDMARK_STORAGE_KEY, "true");
    } catch {
      // A privacy-restricted session still receives the correct reduced-motion behavior.
    }

    setPlayWordmark(wordmarkDecisionRef.current);
  }, []);

  const clearMessages = useCallback(() => {
    setError("");
    setSuccess("");
  }, []);

  const switchView = useCallback((newView: AuthView) => {
    setView(newView);
    clearMessages();
    setPassword("");
  }, [clearMessages]);

  const validateEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

  const validatePassword = (value: string) => {
    if (value.length < 6) return "Password must be at least 6 characters";
    if (!/[a-z]/.test(value)) return "Must include a lowercase letter";
    if (!/[A-Z]/.test(value)) return "Must include an uppercase letter";
    if (!/[0-9]/.test(value)) return "Must include a digit";
    return "";
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    clearMessages();
    try {
      const supabase = createClient();
      const { data, error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: authCallbackUrl(window.location.origin, redirectTo),
          skipBrowserRedirect: true,
        },
      });
      if (signInError) throw signInError;
      if (!data.url) throw new Error("Google sign-in did not return a redirect URL.");
      window.location.assign(data.url);
    } catch (caught: unknown) {
      setError(authErrorMessage(caught instanceof Error ? caught.message : ""));
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        if (signInError.message.includes("Email not confirmed")) {
          localStorage.setItem("shouldbuild-verify-email", email);
          localStorage.setItem("shouldbuild-auth-redirect", redirectTo);
          router.push(`/auth/verify?next=${encodeURIComponent(redirectTo)}`);
          return;
        }
        setError(authErrorMessage(signInError.message));
        setLoading(false);
        return;
      }
      router.replace(redirectTo);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setLoading(false);
    }
  };

  const handleEmailRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const siteUrl = window.location.origin;
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fullName,
          emailRedirectTo: `${siteUrl}/api/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        }),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => ({}));
        setError(authErrorMessage(failure.error ?? "Registration is temporarily unavailable."));
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (
        signInError
        && !signInError.message.includes("Email not confirmed")
        && !signInError.message.includes("Invalid login credentials")
      ) {
        setError(`Auto-login failed: ${signInError.message}`);
        setLoading(false);
        return;
      }

      localStorage.setItem("shouldbuild-verify-email", email);
      localStorage.setItem("shouldbuild-auth-redirect", redirectTo);
      router.push(`/auth/verify?next=${encodeURIComponent(redirectTo)}`);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setLoading(false);
    }
  };

  const handleForgotPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/auth/reset-password`,
      });
      if (resetError) {
        setError("If an account exists for this email, a password reset link has been sent.");
        setLoading(false);
        return;
      }
      setSuccess("If an account exists for this email, a password reset link has been sent.");
      setLoading(false);
    } catch (caught: unknown) {
      setError(errorMessage(caught));
      setLoading(false);
    }
  };

  const copyClass = "grid gap-sb-2";
  const eyebrowClass = "m-0 text-xs font-medium uppercase tracking-[0.08em] text-sb-text-tertiary";
  const fieldClass = "grid gap-sb-2 text-sm font-medium text-sb-text-primary";

  return (
    <GlassPanel className="grid w-full max-w-md gap-sb-6 p-sb-6 md:p-sb-8">
      <div className="flex items-center justify-between gap-sb-4 border-b border-sb-border-hairline pb-sb-4">
        <div className="flex min-w-0 items-center">
          <Brand
            wordmark={
              <ScrambleReveal
                text="ShouldBuild"
                durationSeconds={0.8}
                play={playWordmark}
              />
            }
          />
        </div>
        <Link className="grid size-9 place-items-center rounded-sb-md text-sb-text-secondary transition-colors duration-sb-fast ease-sb-standard hover:bg-sb-bg-surface-2 hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href="/" aria-label="Close sign in">
          <X size={16} />
        </Link>
      </div>

      {view === "sign-in" && (
        <div className="grid gap-sb-5">
          <div className={copyClass}>
            <p className={eyebrowClass}>Secure sign in</p>
            <h1 className="m-0 font-sb-display text-2xl font-[480]">Welcome back.</h1>
            <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">Sign in to continue to your ShouldBuild workspace.</p>
          </div>

          {error && <Card className="border-sb-verdict-avoid p-sb-3 text-sm text-sb-verdict-avoid" role="alert">{error}</Card>}
          {success && <Card className="border-sb-verdict-build p-sb-3 text-sm text-sb-verdict-build" role="status">{success}</Card>}

          <Button variant="secondary" className="w-full" onClick={handleGoogleSignIn} disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" size={16} /> : <GoogleMark />}
            {loading ? "Signing in…" : "Continue with Google"}
          </Button>

          <div className="flex items-center gap-sb-3 text-xs text-sb-text-tertiary before:h-px before:flex-1 before:bg-sb-border-hairline after:h-px after:flex-1 after:bg-sb-border-hairline"><span>or use email</span></div>

          <form onSubmit={handleEmailSignIn} className="grid gap-sb-4">
            <label className={fieldClass}>
              <span>Email</span>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>
            <label className={fieldClass}>
              <span>Password</span>
              <div className="relative">
                <Input
                  className="pr-sb-12"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Your password"
                  required
                  autoComplete="current-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="absolute right-sb-1 top-1/2 min-h-8 -translate-y-1/2 px-sb-2"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              </div>
            </label>
            <Button type="button" variant="ghost" className="w-fit min-h-0 justify-start p-0 text-xs" onClick={() => switchView("forgot-password")}>
              Forgot password?
            </Button>
            <Button className="relative w-full overflow-hidden" type="submit" disabled={loading}>
                {loading
                  ? <><LoaderCircle className="animate-spin" size={15} /> Signing in…</>
                  : <>Sign in to ShouldBuild <ArrowRight size={15} /></>}
                <BorderBeam persistent/>
            </Button>
          </form>

          <p className="m-0 text-center text-xs leading-relaxed text-sb-text-tertiary">
            Evidence-first validation for founders who&apos;d rather find out now than after they&apos;ve built it.
          </p>

          <p className="m-0 flex flex-wrap items-center justify-center gap-sb-1 text-sm text-sb-text-secondary">
            New here?{" "}
            <Button type="button" variant="ghost" className="min-h-0 p-0 text-sm text-sb-text-primary" onClick={() => switchView("register")}>Create a workspace</Button>
          </p>
        </div>
      )}

      {view === "register" && (
        <div className="grid gap-sb-5">
          <div className={copyClass}>
            <p className={eyebrowClass}>Create an account</p>
            <h1 className="m-0 font-sb-display text-2xl font-[480]">Your workspace.</h1>
            <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">Keep your ideas, evidence, and decisions in one private place.</p>
          </div>

          {error && <Card className="border-sb-verdict-avoid p-sb-3 text-sm text-sb-verdict-avoid" role="alert">{error}</Card>}

          <Button variant="secondary" className="w-full" onClick={handleGoogleSignIn} disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" size={16} /> : <GoogleMark />}
            {loading ? "Opening Google…" : "Start with Google"}
          </Button>

          <div className="flex items-center gap-sb-3 text-xs text-sb-text-tertiary before:h-px before:flex-1 before:bg-sb-border-hairline after:h-px after:flex-1 after:bg-sb-border-hairline"><span>or use email</span></div>

          <form onSubmit={handleEmailRegister} className="grid gap-sb-4">
            <label className={fieldClass}>
              <span>Full name</span>
              <Input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
            <label className={fieldClass}>
              <span>Work email</span>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </label>
            <label className={fieldClass}>
              <span>Password</span>
              <div className="relative">
                <Input
                  className="pr-sb-12"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Make it strong"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  className="absolute right-sb-1 top-1/2 min-h-8 -translate-y-1/2 px-sb-2"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </Button>
              </div>
            </label>
            <small className="text-xs text-sb-text-tertiary">6+ characters with upper, lower, and a number.</small>
            <Button className="relative w-full overflow-hidden" type="submit" disabled={loading}>
              {loading
                ? <><LoaderCircle className="animate-spin" size={15} /> Creating account…</>
                : <>Create my workspace <ArrowRight size={15} /></>}
              <BorderBeam persistent/>
            </Button>
          </form>

          <p className="m-0 text-center text-xs leading-relaxed text-sb-text-tertiary">
            Evidence-first validation for founders who&apos;d rather find out now than after they&apos;ve built it.
          </p>

          <p className="m-0 flex flex-wrap items-center justify-center gap-sb-1 text-sm text-sb-text-secondary">
            Already have an account?{" "}
            <Button type="button" variant="ghost" className="min-h-0 p-0 text-sm text-sb-text-primary" onClick={() => switchView("sign-in")}>Sign in</Button>
          </p>
        </div>
      )}

      {view === "forgot-password" && (
        <div className="grid gap-sb-5">
          <div className={copyClass}>
            <Button type="button" variant="ghost" className="mb-sb-2 w-fit min-h-0 justify-start p-0 text-xs" onClick={() => switchView("sign-in")}>
              <ArrowLeft size={14} /> Back to sign in
            </Button>
            <p className={eyebrowClass}>Workspace recovery</p>
            <h1 className="m-0 font-sb-display text-2xl font-[480]">Reset password.</h1>
            <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">We&apos;ll email you a secure reset link.</p>
          </div>

          {error && <Card className="border-sb-verdict-avoid p-sb-3 text-sm text-sb-verdict-avoid" role="alert">{error}</Card>}
          {success && <Card className="border-sb-verdict-build p-sb-3 text-sm text-sb-verdict-build" role="status">{success}</Card>}

          <form onSubmit={handleForgotPassword} className="grid gap-sb-4">
            <label className={fieldClass}>
              <span>Email address</span>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>
            <Button className="relative w-full overflow-hidden" type="submit" disabled={loading}>
              {loading
                ? <><LoaderCircle className="animate-spin" size={15} /> Sending…</>
                : <>Send reset link <Mail size={15} /></>}
              <BorderBeam persistent/>
            </Button>
          </form>

          <p className="m-0 flex flex-wrap items-center justify-center gap-sb-1 text-sm text-sb-text-secondary">
            Remember your password?{" "}
            <Button type="button" variant="ghost" className="min-h-0 p-0 text-sm text-sb-text-primary" onClick={() => switchView("sign-in")}>Sign in</Button>
          </p>
        </div>
      )}

      <div className="flex items-center justify-center gap-sb-3 border-t border-sb-border-hairline pt-sb-4 text-xs text-sb-text-tertiary">
        <span className="inline-flex items-center gap-sb-1"><LockKeyhole size={12} /> Secure sign in</span>
        <i className="size-1 rounded-sb-pill bg-sb-border-hairline-strong" />
        <span>Private workspace</span>
      </div>
      {view === "register" && (
        <p className="m-0 text-center text-xs leading-relaxed text-sb-text-tertiary">
          Continuing means you accept our <Link className="text-sb-text-secondary underline underline-offset-4" href="/legal/terms">Terms</Link> and <Link className="text-sb-text-secondary underline underline-offset-4" href="/legal/privacy">Privacy Policy</Link>.
        </p>
      )}
    </GlassPanel>
  );
}

export default function SignInPage() {
  return (
    <div className="relative isolate grid min-h-screen overflow-hidden bg-sb-bg-base text-sb-text-primary">
      <AuroraBackground className="opacity-60"/>
      <section className="relative z-[1] grid min-h-screen place-items-center px-sb-5 py-sb-10" aria-label="Sign in to ShouldBuild">
        <Suspense fallback={
          <GlassPanel className="grid w-full max-w-md place-items-center gap-sb-3 p-sb-8 text-sm text-sb-text-secondary" role="status">
            <LoaderCircle className="animate-spin text-sb-accent" size={28} />
            <span>Preparing secure sign in…</span>
          </GlassPanel>
        }>
          <SignInCard />
        </Suspense>
      </section>
    </div>
  );
}
