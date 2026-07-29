import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, CalendarDays, ShieldCheck, UsersRound } from "lucide-react";
import { loadPublicVerificationCard } from "@/lib/verification-card";

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
    <main className="verification-page">
      <article className="verification-card" aria-label="ShouldBuild verification card">
        <header>
          <span><BadgeCheck size={18} /> Verified report identity</span>
          <h1>{card.title}</h1>
          <p>{card.verdict}</p>
        </header>
        <div className="verification-card-grid">
          <section>
            <ShieldCheck size={20} />
            <span>Evidence Confidence</span>
            <strong>{card.evidenceConfidence}</strong>
          </section>
          <section>
            <UsersRound size={20} />
            <span>Independent evidence groups</span>
            <strong>{card.independentEvidenceGroups}</strong>
          </section>
          <section>
            <CalendarDays size={20} />
            <span>Current as of</span>
            <strong>{card.currentAsOf}</strong>
          </section>
        </div>
        <footer>
          <p>
            The ShouldBuild Readiness Score measures evidence-based decision
            readiness. It is not a probability or prediction of success.
          </p>
          <Link href={card.methodologyUrl}>Read the scoring methodology</Link>
          <small>Immutable verification ID: {id}</small>
        </footer>
      </article>
    </main>
  );
}
