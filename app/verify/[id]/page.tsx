import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarDays, ShieldCheck, UsersRound } from "lucide-react";
import { loadPublicVerificationCard } from "@/lib/verification-card";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { BorderBeam } from "@/components/ui/border-beam";
import { VerdictBadge } from "@/components/ui/verdict-badge";
import { Card } from "@/components/ui/card";
import { GlassPanel } from "@/components/ui/glass-panel";
import { MagneticButton } from "@/components/ui/magnetic-button";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const card = await loadPublicVerificationCard(id);
  return card
    ? {
      title: `${card.title} — ${card.verdict}`,
      description:
        `${card.title}. ${card.verdict}. Evidence Confidence: ${card.evidenceConfidence}. A decision-readiness measure, not a success probability.`,
    }
    : { title: "Verification card not found" };
}

export default async function VerificationCardPage({ params }: Props) {
  const { id } = await params;
  const card = await loadPublicVerificationCard(id);
  if (!card) notFound();
  return (
    <main className="relative isolate grid min-h-screen place-items-center overflow-hidden bg-sb-bg-base px-sb-5 py-sb-8 text-sb-text-primary">
      <AuroraBackground static className="opacity-60"/>
      <GlassPanel className="relative z-[1] w-full max-w-3xl overflow-hidden" role="article" aria-label="ShouldBuild verification card">
        <header className="border-b border-sb-border-hairline p-sb-6 md:p-sb-10">
          <span className="flex items-center gap-sb-2 font-sb-body text-xs font-medium uppercase tracking-[0.02em] text-sb-text-secondary"><BadgeCheck size={18} /> Verified report identity</span>
          <h1 className="mt-sb-8 font-sb-display text-4xl font-[480] tracking-[-0.015em] md:text-5xl">{card.title}</h1>
          <VerdictBadge className="mt-sb-3" verdict={card.verdict}/>
        </header>
        <div className="grid gap-sb-3 p-sb-5 md:grid-cols-3 md:p-sb-8">
          <Card className="flex min-h-28 flex-col gap-sb-2 rounded-sb-md bg-sb-bg-surface-2 p-sb-4">
            <ShieldCheck className="text-sb-text-secondary" size={20} />
            <span className="text-sm text-sb-text-secondary">Evidence Confidence</span>
            <strong className="mt-auto font-sb-mono text-xl font-semibold tabular-nums">{card.evidenceConfidence}</strong>
          </Card>
          <Card className="flex min-h-28 flex-col gap-sb-2 rounded-sb-md bg-sb-bg-surface-2 p-sb-4">
            <UsersRound className="text-sb-text-secondary" size={20} />
            <span className="text-sm text-sb-text-secondary">Independent evidence groups</span>
            <strong className="mt-auto font-sb-mono text-xl font-semibold tabular-nums">{card.independentEvidenceGroups}</strong>
          </Card>
          <Card className="flex min-h-28 flex-col gap-sb-2 rounded-sb-md bg-sb-bg-surface-2 p-sb-4">
            <CalendarDays className="text-sb-text-secondary" size={20} />
            <span className="text-sm text-sb-text-secondary">Current as of</span>
            <strong className="mt-auto font-sb-mono text-xl font-semibold tabular-nums">{card.currentAsOf}</strong>
          </Card>
        </div>
        <footer className="grid gap-sb-3 px-sb-6 pb-sb-8 md:px-sb-10">
          <p className="text-sm leading-relaxed text-sb-text-secondary">
            The ShouldBuild Readiness Score measures evidence-based decision
            readiness. It is not a probability or prediction of success.
          </p>
          <MagneticButton className="w-fit">
            <Link className="relative inline-flex min-h-10 items-center justify-center overflow-hidden rounded-sb-md border border-sb-accent bg-sb-accent px-sb-4 py-sb-2 text-sm font-medium text-sb-text-primary transition-colors duration-sb-fast ease-sb-standard hover:border-sb-accent-hover hover:bg-sb-accent-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sb-border-focus" href={card.methodologyUrl}>
              Read the scoring methodology
              <BorderBeam persistent/>
            </Link>
          </MagneticButton>
          <small className="break-all font-sb-mono text-xs text-sb-text-tertiary">Immutable verification ID: {id}</small>
        </footer>
      </GlassPanel>
    </main>
  );
}
