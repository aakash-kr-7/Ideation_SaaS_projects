"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export function ReportRetryState({ reason }: { reason: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 1_500);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <section className="empty-state" role="status" aria-live="polite">
      <RefreshCw size={24} aria-hidden="true" />
      <h2>Your completed report is being made available</h2>
      <p>The evidence-backed report is safely stored. This page will retry automatically.</p>
      <button type="button" className="btn-secondary" onClick={() => router.refresh()}>
        Retry now
      </button>
      <span className="sr-only">Consistency state: {reason}</span>
    </section>
  );
}
