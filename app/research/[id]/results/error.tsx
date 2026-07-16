"use client";

import Link from "next/link";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="report-error">
      <h1>We couldn’t load this report.</h1>
      <p>{error.message || "The completed run is missing required report data."}</p>
      <div className="error-actions">
        <button className="button" onClick={reset}>Try again</button>
        <Link className="button ghost" href="/dashboard">Back to dashboard</Link>
      </div>
    </main>
  );
}
