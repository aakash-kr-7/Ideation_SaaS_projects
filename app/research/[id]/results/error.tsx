"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/state-message";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const detail = error.message || "The completed run is missing required report data.";
  return (
    <main className="mx-auto grid min-h-[50vh] w-full max-w-3xl place-items-center px-sb-5 py-sb-12">
      <ErrorState
        message={`${detail} Recheck the immutable report; return to the dashboard if the state has not changed.`}
        action={
          <div className="flex flex-wrap gap-sb-3">
            <Button variant="secondary" onClick={reset}>Recheck report</Button>
            <Link className="inline-flex min-h-10 items-center rounded-sb-md px-sb-3 py-sb-2 text-sm text-sb-text-secondary hover:bg-sb-bg-surface-2 hover:text-sb-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href="/dashboard">Back to dashboard</Link>
          </div>
        }
      />
    </main>
  );
}
