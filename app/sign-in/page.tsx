"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CircleDot,
  Eye,
  EyeOff,
  Fingerprint,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Radar,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  X,
  Zap,
} from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { LandingPage } from "@/components/landing/landing-page";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/supabase/relations";
import { authCallbackUrl, safeAuthRedirect } from "@/lib/auth-redirect";
import { authErrorMessage } from "@/lib/public-errors";

type AuthView = "sign-in" | "register" | "forgot-password";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
    </svg>
  );
}

function DecisionPreview() {
  return (
    <div className="auth-decision-stage" aria-label="Illustrative ShouldBuild validation report preview">
      <div className="auth-orbit auth-orbit-one" aria-hidden="true" />
      <div className="auth-orbit auth-orbit-two" aria-hidden="true" />

      <div className="auth-float-card auth-float-evidence">
        <span><Search size={12} /> EVIDENCE PASS</span>
        <b>Source-linked signals</b>
        <small><i className="is-live" /> Public market trail mapped</small>
      </div>

      <div className="auth-float-card auth-float-risk">
        <span><Target size={12} /> ADVERSARIAL PASS</span>
        <b>Weak assumption found</b>
        <small>Test pricing power before build</small>
      </div>

      <div className="auth-decision-card">
        <header>
          <span><CircleDot size={13} /> DECISION ROOM</span>
          <i>ILLUSTRATIVE PREVIEW</i>
        </header>
        <div className="auth-decision-title">
          <div>
            <small>OPPORTUNITY / B2B SAAS</small>
            <h3>AI client research copilot</h3>
          </div>
          <span className="auth-score">76<small>/ 100</small></span>
        </div>
        <div className="auth-verdict-line">
          <span><BadgeCheck size={15} /> VERDICT</span>
          <b>VALIDATE FIRST</b>
        </div>
        <div className="auth-signal-list">
          <div>
            <span>Buyer pain</span>
            <i><b style={{ width: "88%" }} /></i>
            <em>STRONG</em>
          </div>
          <div>
            <span>Pricing power</span>
            <i><b style={{ width: "54%" }} /></i>
            <em>PROVE</em>
          </div>
          <div>
            <span>Market gap</span>
            <i><b style={{ width: "71%" }} /></i>
            <em>VISIBLE</em>
          </div>
        </div>
        <div className="auth-next-move">
          <span><Zap size={14} /></span>
          <div>
            <small>HIGHEST-LEVERAGE NEXT MOVE</small>
            <b>Pre-sell the reporting workflow to five research-heavy teams.</b>
          </div>
          <ArrowRight size={16} />
        </div>
      </div>
    </div>
  );
}

function AuthStory() {
  return (
    <section className="auth-story">
      <div className="auth-story-glow" aria-hidden="true" />
      <header className="auth-story-nav">
        <Brand />
        <span><Radar size={13} /> DECISION INTELLIGENCE</span>
      </header>

      <div className="auth-story-copy">
        <p className="auth-story-kicker"><Sparkles size={13} /> FOR BUILDERS WITH MORE IDEAS THAN TIME</p>
        <h2>
          Build the right thing.
          <span>Not just the next thing.</span>
        </h2>
        <p>
          Turn the idea keeping you awake into a decision you can defend.
          ShouldBuild finds market signals, attacks the fragile assumptions,
          and shows you what to build, test, narrow—or leave behind.
        </p>
        <div className="auth-story-benefits">
          <span><Check size={14} /> See buyer pain before you write the pitch</span>
          <span><Check size={14} /> Find what could break the business early</span>
          <span><Check size={14} /> Leave with a next move, not more noise</span>
        </div>
      </div>

      <DecisionPreview />

      <footer className="auth-story-footer">
        <span><Fingerprint size={13} /> CITED PUBLIC SOURCES</span>
        <span><ShieldCheck size={13} /> CONTRADICTION CHECKS</span>
        <span><Target size={13} /> ACTIONABLE VERDICT</span>
      </footer>
    </section>
  );
}

function SignInCard() {
  const searchParams = useSearchParams();
  const router = useRouter();
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

  return (
    <div className="auth-card">
      <div className="auth-modal-brandbar">
        <Brand />
        <Link className="auth-modal-close" href="/" aria-label="Close sign in">
          <X size={16} />
        </Link>
      </div>

      {view === "sign-in" && (
        <div className="auth-view auth-view-enter">
          <div className="auth-copy">
            <p className="eyebrow">SECURE SIGN IN</p>
            <h1>Welcome back.</h1>
            <p>Sign in to continue to your ShouldBuild workspace.</p>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <button className="oauth" onClick={handleGoogleSignIn} disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" size={16} /> : <GoogleMark />}
            {loading ? "Signing in…" : "Continue with Google"}
          </button>

          <div className="auth-divider"><span>or use email</span></div>

          <form onSubmit={handleEmailSignIn} className="auth-form">
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <div className="auth-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Your password"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <button type="button" className="auth-forgot-link" onClick={() => switchView("forgot-password")}>
              Forgot password?
            </button>
            <button className="button auth-submit" type="submit" disabled={loading}>
              {loading
                ? <><LoaderCircle className="animate-spin" size={15} /> Signing in…</>
                : <>Sign in to ShouldBuild <ArrowRight size={15} /></>}
            </button>
          </form>

          <p className="auth-switch">
            New here?{" "}
            <button type="button" onClick={() => switchView("register")}>Create a workspace</button>
          </p>
        </div>
      )}

      {view === "register" && (
        <div className="auth-view auth-view-enter">
          <div className="auth-copy">
            <p className="eyebrow">CREATE AN ACCOUNT</p>
            <h1>Your workspace.</h1>
            <p>Keep your ideas, evidence, and decisions in one private place.</p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="oauth" onClick={handleGoogleSignIn} disabled={loading}>
            {loading ? <LoaderCircle className="animate-spin" size={16} /> : <GoogleMark />}
            {loading ? "Opening Google…" : "Start with Google"}
          </button>

          <div className="auth-divider"><span>or use email</span></div>

          <form onSubmit={handleEmailRegister} className="auth-form">
            <label className="auth-field">
              <span>Full name</span>
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
            <label className="auth-field">
              <span>Work email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@company.com"
                required
                autoComplete="email"
              />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <div className="auth-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Make it strong"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="auth-password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
            <small className="auth-password-note">6+ characters with upper, lower, and a number.</small>
            <button className="button auth-submit" type="submit" disabled={loading}>
              {loading
                ? <><LoaderCircle className="animate-spin" size={15} /> Creating account…</>
                : <>Create my workspace <ArrowRight size={15} /></>}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account?{" "}
            <button type="button" onClick={() => switchView("sign-in")}>Sign in</button>
          </p>
        </div>
      )}

      {view === "forgot-password" && (
        <div className="auth-view auth-view-enter">
          <div className="auth-copy">
            <button type="button" className="auth-back-link" onClick={() => switchView("sign-in")}>
              <ArrowLeft size={14} /> Back to sign in
            </button>
            <p className="eyebrow">WORKSPACE RECOVERY</p>
            <h1>Reset password.</h1>
            <p>We&apos;ll email you a secure reset link.</p>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <form onSubmit={handleForgotPassword} className="auth-form">
            <label className="auth-field">
              <span>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
              />
            </label>
            <button className="button auth-submit" type="submit" disabled={loading}>
              {loading
                ? <><LoaderCircle className="animate-spin" size={15} /> Sending…</>
                : <>Send reset link <Mail size={15} /></>}
            </button>
          </form>

          <p className="auth-switch">
            Remember your password?{" "}
            <button type="button" onClick={() => switchView("sign-in")}>Sign in</button>
          </p>
        </div>
      )}

      <div className="auth-trust-line">
        <span><LockKeyhole size={12} /> Secure sign in</span>
        <i />
        <span>Private workspace</span>
      </div>
      {view === "register" && (
        <p className="auth-legal">
          Continuing means you accept our <Link href="/legal/terms">Terms</Link> and <Link href="/legal/privacy">Privacy Policy</Link>.
        </p>
      )}
    </div>
  );
}

export default function SignInPage() {
  return (
    <div className="auth-page auth-experience auth-modal-page">
      <div className="auth-site-backdrop" aria-hidden="true" inert>
        <LandingPage />
      </div>
      <div className="auth-modal-scrim" aria-hidden="true" />
      <div className="auth-legacy-story-hidden" aria-hidden="true">
        <AuthStory />
      </div>
      <section className="auth-modal-layer" aria-label="Sign in to ShouldBuild">
        <Suspense fallback={
          <div className="auth-card auth-card-loading">
            <div>
              <LoaderCircle className="animate-spin" size={28} />
              <span>Preparing secure sign in…</span>
            </div>
          </div>
        }>
          <SignInCard />
        </Suspense>
      </section>
    </div>
  );
}
