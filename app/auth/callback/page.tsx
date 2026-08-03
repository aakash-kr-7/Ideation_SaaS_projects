"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function CallbackStatus({ status, message, onRetry }: {
  status: "loading" | "success" | "error";
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="w-full max-w-md p-sb-8">
      <div className="grid justify-items-center gap-sb-4 text-center" role={status === "error" ? "alert" : "status"}>
        {status === "loading" && <LoaderCircle className="animate-spin text-sb-accent" size={32} />}
        {status === "success" && <CheckCircle2 className="text-sb-verdict-build" size={32} />}
        {status === "error" && <AlertTriangle className="text-sb-verdict-avoid" size={32} />}
        <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">{message}</p>
        {status === "error" && onRetry && (
          <Button className="mt-sb-2" onClick={onRetry}>Back to sign in</Button>
        )}
      </div>
    </Card>
  );
}

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Completing authentication…");

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient();
      const { data: { session }, error } = await supabase.auth.getSession();

      if (error) {
        setStatus("error");
        setMessage(error.message || "Authentication failed. Sign in again.");
        return;
      }

      if (session) {
        setStatus("success");
        setMessage("Authentication successful. Redirecting…");
        const next = searchParams.get("next") || "/dashboard";
        setTimeout(() => router.replace(next), 800);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 1500));
      const { data: { session: retrySession } } = await supabase.auth.getSession();

      if (retrySession) {
        setStatus("success");
        setMessage("Authentication successful. Redirecting…");
        const next = searchParams.get("next") || "/dashboard";
        setTimeout(() => router.replace(next), 800);
      } else {
        setStatus("error");
        setMessage("Authentication could not be completed. Sign in again.");
      }
    };

    void handleCallback();
  }, [router, searchParams]);

  return <CallbackStatus status={status} message={message} onRetry={() => router.push("/sign-in")} />;
}

export default function AuthCallbackPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-sb-bg-base px-sb-5 py-sb-10 text-sb-text-primary">
      <Suspense fallback={<CallbackStatus status="loading" message="Loading callback handler…" />}>
        <CallbackContent />
      </Suspense>
    </main>
  );
}
