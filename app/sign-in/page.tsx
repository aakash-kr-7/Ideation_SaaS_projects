"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LockKeyhole, LoaderCircle } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { createClient } from "@/lib/supabase/client";

function SignInCard() {
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";
  const authError = searchParams.get("error");
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(authError ? "Authentication callback failed. Please try again." : "");

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError("");
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(redirectTo)}`,
        },
      });
      if (signInError) {
        setError(signInError.message);
        setLoading(false);
      }
    } catch (e: any) {
      setError(e.message || "An unexpected error occurred.");
      setLoading(false);
    }
  };

  return (
    <div className="auth-card">
      <Brand />
      <div className="auth-copy">
        <p className="eyebrow">SIGNALFIT VALIDATION PLATFORM</p>
        <h1>Stop guessing. Validate your product idea in minutes.</h1>
        <p>Access structured validation reports, competitive intelligence, pricing analysis, and evidence-backed recommendations.</p>
      </div>

      {error && (
        <div style={{
          padding: "12px 14px",
          background: "var(--verdict-avoid-dim)",
          border: "1px solid var(--verdict-avoid)",
          color: "var(--verdict-avoid)",
          borderRadius: "var(--radius)",
          fontSize: "13px",
          marginBottom: "20px"
        }}>
          {error}
        </div>
      )}

      <button 
        className="oauth" 
        onClick={handleGoogleSignIn} 
        disabled={loading}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          cursor: loading ? "not-allowed" : "pointer",
          opacity: loading ? 0.8 : 1,
          width: "100%"
        }}
      >
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
        {loading ? "Signing in..." : "Continue with Google"}
      </button>

      <small style={{ marginTop: "20px" }}>
        <LockKeyhole size={13} style={{ color: "var(--text-tertiary)" }} />
        Secure sign-in via Supabase Auth
      </small>
    </div>
  );
}

export default function SignInPage() {
  return (
    <main className="auth-page">
      <Suspense fallback={<div className="auth-card"><div style={{ display: 'grid', placeItems: 'center', height: '200px' }}><LoaderCircle className="animate-spin" size={32} /></div></div>}>
        <SignInCard />
      </Suspense>
    </main>
  );
}
