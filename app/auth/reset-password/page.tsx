"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/supabase/relations";

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

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
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
    } catch (caught: unknown) {
      setError(errorMessage(caught, "Password could not be reset. Request a new reset link."));
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <main className="grid min-h-screen place-items-center bg-sb-bg-base px-sb-5 py-sb-10 text-sb-text-primary">
        <Card className="grid w-full max-w-md gap-sb-6 p-sb-8">
          <Brand />
          <div className="grid justify-items-start gap-sb-3" role="status">
            <CheckCircle2 className="text-sb-verdict-build" size={32} />
            <h1 className="m-0 font-sb-display text-2xl font-[480]">Password updated</h1>
            <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">Your password has been reset. Redirecting to your dashboard…</p>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-sb-bg-base px-sb-5 py-sb-10 text-sb-text-primary">
      <Card className="grid w-full max-w-md gap-sb-6 p-sb-8">
        <Brand />
        <div className="grid size-11 place-items-center rounded-sb-md border border-sb-border-hairline bg-sb-bg-surface-2 text-sb-text-secondary">
          <KeyRound size={24} />
        </div>
        <div className="grid gap-sb-2">
          <h1 className="m-0 font-sb-display text-2xl font-[480]">Set new password</h1>
          <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">Choose a strong password for your ShouldBuild account.</p>
        </div>

        {error && <Card className="border-sb-verdict-avoid p-sb-3 text-sm text-sb-verdict-avoid" role="alert">{error}</Card>}

        <form onSubmit={handleReset} className="grid gap-sb-4">
          <label className="grid gap-sb-2 text-sm font-medium text-sb-text-primary">
            <span>New password</span>
            <div className="relative">
              <Input
                className="pr-sb-12"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="At least 6 characters"
                required
                minLength={6}
                autoFocus
              />
              <Button
                type="button"
                variant="ghost"
                className="absolute right-sb-1 top-1/2 min-h-8 -translate-y-1/2 px-sb-2"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </Button>
            </div>
          </label>
          <label className="grid gap-sb-2 text-sm font-medium text-sb-text-primary">
            <span>Confirm password</span>
            <Input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={event => setConfirmPassword(event.target.value)}
              placeholder="Type password again"
              required
              minLength={6}
            />
          </label>

          <div className="flex flex-wrap gap-x-sb-4 gap-y-sb-2 text-xs">
            <small className={password.length >= 6 ? "text-sb-verdict-build" : "text-sb-text-tertiary"}>{password.length >= 6 ? "✓" : "○"} 6+ characters</small>
            <small className={/[a-z]/.test(password) ? "text-sb-verdict-build" : "text-sb-text-tertiary"}>{/[a-z]/.test(password) ? "✓" : "○"} Lowercase</small>
            <small className={/[A-Z]/.test(password) ? "text-sb-verdict-build" : "text-sb-text-tertiary"}>{/[A-Z]/.test(password) ? "✓" : "○"} Uppercase</small>
            <small className={/[0-9]/.test(password) ? "text-sb-verdict-build" : "text-sb-text-tertiary"}>{/[0-9]/.test(password) ? "✓" : "○"} Digit</small>
          </div>

          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? <><LoaderCircle className="animate-spin" size={15} /> Updating…</> : <>Update password <ArrowRight size={15} /></>}
          </Button>
        </form>
      </Card>
    </main>
  );
}
