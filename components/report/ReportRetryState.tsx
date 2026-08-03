"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state-message";

export function ReportRetryState({ reason }: { reason: string }) {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 1_500);
    return () => window.clearInterval(timer);
  }, [router]);

  return (
    <div className="mx-auto max-w-3xl" aria-live="polite">
      <EmptyState
        message="The research run is complete, but its latest immutable report version is not visible yet. This page will keep checking; recheck now if you want to query it immediately."
        action={<Button variant="secondary" onClick={() => router.refresh()}>Recheck report</Button>}
      />
      <span className="sr-only">Consistency state: {reason}</span>
    </div>
  );
}
