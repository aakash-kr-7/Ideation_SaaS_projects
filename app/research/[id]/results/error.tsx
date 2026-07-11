"use client";
export default function Error({reset}:{reset:()=>void}){return <main className="report-error"><h1>We couldn’t load this report.</h1><p>The research run may still be finishing, or its local session may have expired.</p><button onClick={reset}>Try again</button></main>}
