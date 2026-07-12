"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, ArrowRight, LoaderCircle, CheckCircle2, Eye, EyeOff } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const validatePassword = () => {
    if (password.length < 6) return "Password must be at least 6 characters";
    if (!/[a-z]/.test(password)) return "Password must include a lowercase letter";
    if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter";
    if (!/[0-9]/.test(password)) return "Password must include a digit";
    if (password !== confirmPassword) return "Passwords don't match";
    return "";
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validatePassword();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setSuccess(true);
      setTimeout(() => router.push("/dashboard"), 2000);
    } catch (e: any) {
      setError(e.message || "Failed to reset password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="auth-page">
        <div className="auth-card auth-reset-card">
          <Brand />
          <div className="auth-success-state">
            <CheckCircle2 size={32} />
            <h1>Password updated</h1>
            <p>Your password has been reset successfully. Redirecting to your dashboard…</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <div className="auth-card auth-reset-card">
        <Brand />
        <div className="auth-reset-icon">
          <KeyRound size={24} />
        </div>
        <div className="auth-copy">
          <h1>Set new password</h1>
          <p>Choose a strong password for your SignalFit account.</p>
        </div>

        {error && (
          <div className="auth-error">{error}</div>
        )}

        <form onSubmit={handleReset} className="auth-form">
          <label className="auth-field">
            <span>New password</span>
            <div className="auth-password-wrap">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoFocus
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
          <label className="auth-field">
            <span>Confirm password</span>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Type password again"
              required
              minLength={6}
            />
          </label>

          <div className="auth-password-requirements">
            <small className={password.length >= 6 ? "met" : ""}>6+ characters</small>
            <small className={/[a-z]/.test(password) ? "met" : ""}>Lowercase</small>
            <small className={/[A-Z]/.test(password) ? "met" : ""}>Uppercase</small>
            <small className={/[0-9]/.test(password) ? "met" : ""}>Digit</small>
          </div>

          <button className="button auth-submit" type="submit" disabled={loading}>
            {loading ? (
              <><LoaderCircle className="animate-spin" size={15} /> Updating…</>
            ) : (
              <>Update password <ArrowRight size={15} /></>
            )}
          </button>
        </form>
      </div>
    </main>
  );
}
