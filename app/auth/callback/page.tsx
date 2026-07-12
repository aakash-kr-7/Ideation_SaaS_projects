"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { LoaderCircle, CheckCircle2, AlertTriangle } from "lucide-react";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Completing authentication…");

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient();

      // Check if there's already a session (hash-based flows auto-resolve)
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        setStatus("error");
        setMessage(error.message || "Authentication failed. Please try again.");
        return;
      }

      if (session) {
        setStatus("success");
        setMessage("Authentication successful. Redirecting…");
        const next = searchParams.get("next") || "/dashboard";
        setTimeout(() => router.replace(next), 800);
        return;
      }

      // If no session and no error, the hash may need processing
      // Supabase client auto-processes hash fragments on init
      // Wait briefly and check again
      await new Promise(resolve => setTimeout(resolve, 1500));
      const { data: { session: retrySession } } = await supabase.auth.getSession();

      if (retrySession) {
        setStatus("success");
        setMessage("Authentication successful. Redirecting…");
        const next = searchParams.get("next") || "/dashboard";
        setTimeout(() => router.replace(next), 800);
      } else {
        setStatus("error");
        setMessage("Could not complete authentication. Please sign in again.");
      }
    };

    handleCallback();
  }, [router, searchParams]);

  return (
    <div className="auth-card auth-callback-card">
      <div className="auth-callback-status">
        {status === "loading" && <LoaderCircle className="animate-spin" size={32} style={{ color: "var(--accent)" }} />}
        {status === "success" && <CheckCircle2 size={32} style={{ color: "var(--verdict-build)" }} />}
        {status === "error" && <AlertTriangle size={32} style={{ color: "var(--verdict-avoid)" }} />}
        <p>{message}</p>
        {status === "error" && (
          <button className="button" onClick={() => router.push("/sign-in")} style={{ marginTop: 16 }}>
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <main className="auth-page">
      <Suspense fallback={
        <div className="auth-card auth-callback-card">
          <div className="auth-callback-status">
            <LoaderCircle className="animate-spin" size={32} style={{ color: "var(--accent)" }} />
            <p>Loading callback handler…</p>
          </div>
        </div>
      }>
        <CallbackContent />
      </Suspense>
    </main>
  );
}
