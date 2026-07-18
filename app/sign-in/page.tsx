"use client";

import { Suspense, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { LockKeyhole, LoaderCircle, ArrowRight, Mail, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/supabase/relations";
import { authCallbackUrl, safeAuthRedirect } from "@/lib/auth-redirect";

type AuthView = "sign-in" | "register" | "forgot-password";

function SignInCard() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const redirectTo = safeAuthRedirect(searchParams.get("redirectTo"));
  const authError = searchParams.get("error");
  const authMessage = searchParams.get("message");

  const [view, setView] = useState<AuthView>("sign-in");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(
    authError ? (authMessage ? decodeURIComponent(authMessage) : "Authentication failed. Please try again.") : ""
  );
  const [success, setSuccess] = useState("");

  // Form fields
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

  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const validatePassword = (pw: string) => {
    if (pw.length < 6) return "Password must be at least 6 characters";
    if (!/[a-z]/.test(pw)) return "Must include a lowercase letter";
    if (!/[A-Z]/.test(pw)) return "Must include an uppercase letter";
    if (!/[0-9]/.test(pw)) return "Must include a digit";
    return "";
  };

  // ─── Google OAuth ───
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
      if (signInError) {
        throw signInError;
      }
      if (!data.url) {
        throw new Error("Google sign-in did not return a redirect URL.");
      }
      window.location.assign(data.url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Google sign-in could not be started.");
      setLoading(false);
    }
  };

  // ─── Email Sign In ───
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
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
          router.push("/auth/verify");
          return;
        }
        setError(signInError.message === "Invalid login credentials" ? "Incorrect email or password." : signInError.message);
        setLoading(false);
        return;
      }
      router.replace(redirectTo);
    } catch (error: unknown) {
      setError(errorMessage(error));
      setLoading(false);
    }
  };

  // ─── Email Register ───
  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    const pwError = validatePassword(password);
    if (pwError) {
      setError(pwError);
      return;
    }
    setLoading(true);
    clearMessages();
    try {
      const supabase = createClient();
      const siteUrl = window.location.origin;
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
          emailRedirectTo: `${siteUrl}/api/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }
      localStorage.setItem("shouldbuild-verify-email", email);
      router.push("/auth/verify");
    } catch (error: unknown) {
      setError(errorMessage(error));
      setLoading(false);
    }
  };

  // ─── Forgot Password ───
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
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
        setError(resetError.message);
        setLoading(false);
        return;
      }
      setSuccess("Password reset link sent. Check your email.");
      setLoading(false);
    } catch (error: unknown) {
      setError(errorMessage(error));
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <Brand />

      {/* ─── SIGN IN VIEW ─── */}
      {view === "sign-in" && (
        <div className="auth-view auth-view-enter">
          <div className="auth-copy">
            <p className="eyebrow">SHOULDBUILD VALIDATION PLATFORM</p>
            <h1>Welcome back</h1>
            <p>Sign in to access your validation reports and research workspace.</p>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <button className="oauth" onClick={handleGoogleSignIn} disabled={loading}>
            {loading ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
            )}
            {loading ? "Signing in…" : "Continue with Google"}
          </button>

          <div className="auth-divider"><span>or</span></div>

          <form onSubmit={handleEmailSignIn} className="auth-form">
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                autoFocus
              />
            </label>
            <label className="auth-field">
              <span>Password</span>
              <div className="auth-password-wrap">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>
            <button type="button" className="auth-forgot-link" onClick={() => switchView("forgot-password")}>
              Forgot password?
            </button>
            <button className="button auth-submit" type="submit" disabled={loading}>
              {loading ? <><LoaderCircle className="animate-spin" size={15} /> Signing in…</> : <>Sign in <ArrowRight size={15} /></>}
            </button>
          </form>

          <p className="auth-switch">
            Don&apos;t have an account?{" "}
            <button type="button" onClick={() => switchView("register")}>Create one</button>
          </p>
        </div>
      )}

      {/* ─── REGISTER VIEW ─── */}
      {view === "register" && (
        <div className="auth-view auth-view-enter">
          <div className="auth-copy">
            <p className="eyebrow">GET STARTED</p>
            <h1>Create your account</h1>
            <p>Start validating product ideas with market-backed evidence.</p>
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button className="oauth" onClick={handleGoogleSignIn} disabled={loading}>
            {loading ? (
              <LoaderCircle className="animate-spin" size={16} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
              </svg>
            )}
            Continue with Google
          </button>

          <div className="auth-divider"><span>or</span></div>

          <form onSubmit={handleEmailRegister} className="auth-form">
            <label className="auth-field">
              <span>Full name</span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                autoFocus
              />
            </label>
            <label className="auth-field">
              <span>Email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
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
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>
            <div className="auth-password-requirements">
              <small className={password.length >= 6 ? "met" : ""}>6+ characters</small>
              <small className={/[a-z]/.test(password) ? "met" : ""}>Lowercase</small>
              <small className={/[A-Z]/.test(password) ? "met" : ""}>Uppercase</small>
              <small className={/[0-9]/.test(password) ? "met" : ""}>Digit</small>
            </div>
            <button className="button auth-submit" type="submit" disabled={loading}>
              {loading ? <><LoaderCircle className="animate-spin" size={15} /> Creating account…</> : <>Create account <ArrowRight size={15} /></>}
            </button>
          </form>

          <p className="auth-switch">
            Already have an account?{" "}
            <button type="button" onClick={() => switchView("sign-in")}>Sign in</button>
          </p>
        </div>
      )}

      {/* ─── FORGOT PASSWORD VIEW ─── */}
      {view === "forgot-password" && (
        <div className="auth-view auth-view-enter">
          <div className="auth-copy">
            <button type="button" className="auth-back-link" onClick={() => switchView("sign-in")}>
              <ArrowLeft size={14} /> Back to sign in
            </button>
            <h1>Reset your password</h1>
            <p>Enter your email and we&apos;ll send you a link to reset your password.</p>
          </div>

          {error && <div className="auth-error">{error}</div>}
          {success && <div className="auth-success">{success}</div>}

          <form onSubmit={handleForgotPassword} className="auth-form">
            <label className="auth-field">
              <span>Email address</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoComplete="email"
                autoFocus
              />
            </label>
            <button className="button auth-submit" type="submit" disabled={loading}>
              {loading ? <><LoaderCircle className="animate-spin" size={15} /> Sending…</> : <>Send reset link <Mail size={15} /></>}
            </button>
          </form>

          <p className="auth-switch">
            Remember your password?{" "}
            <button type="button" onClick={() => switchView("sign-in")}>Sign in</button>
          </p>
        </div>
      )}

      <small className="auth-footer">
        <LockKeyhole size={13} />
        Encrypted authentication via Supabase
      </small>
      <p className="auth-legal">By continuing, you agree to the <Link href="/legal/terms">Terms of Service</Link> and acknowledge the <Link href="/legal/privacy">Privacy Policy</Link>.</p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <main className="auth-page">
      <Suspense fallback={
        <div className="auth-card">
          <div style={{ display: 'grid', placeItems: 'center', height: '200px' }}>
            <LoaderCircle className="animate-spin" size={32} style={{ color: 'var(--accent)' }} />
          </div>
        </div>
      }>
        <SignInCard />
      </Suspense>
    </main>
  );
}
