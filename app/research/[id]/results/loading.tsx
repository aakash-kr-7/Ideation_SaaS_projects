import { Card } from "@/components/ui/card";

export default function Loading() {
  return (
    <main className="mx-auto grid min-h-[50vh] w-full max-w-3xl place-items-center px-sb-5 py-sb-12" aria-live="polite" aria-busy="true">
      <Card className="grid w-full gap-sb-3 p-sb-6 sm:p-sb-8" role="status">
        <p className="m-0 text-xs font-medium uppercase tracking-[0.02em] text-sb-text-tertiary">Validation report</p>
        <h1 className="m-0 font-sb-display text-2xl font-[480]">Resolving the latest immutable report version…</h1>
        <p className="m-0 text-sm leading-relaxed text-sb-text-secondary">The completed run, stored evidence, and canonical report version are being read together.</p>
      </Card>
    </main>
  );
}
