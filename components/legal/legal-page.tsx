import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { LegalFooter } from "@/components/layout/legal-footer";

export type LegalSection = {
  title: string;
  paragraphs?: React.ReactNode[];
  bullets?: React.ReactNode[];
};

export function LegalPage({ eyebrow, title, summary, sections }: { eyebrow: string; title: string; summary: React.ReactNode; sections: LegalSection[] }) {
  return <main className="legal-page">
    <header className="legal-header"><Brand/><Link href="/">Back to ShouldBuild</Link></header>
    <div className="legal-shell">
      <aside className="legal-toc">
        <p>{eyebrow}</p>
        <nav aria-label={`${title} sections`}>
          {sections.map((section, index) => <a href={`#section-${index + 1}`} key={section.title}>{index + 1}. {section.title}</a>)}
        </nav>
      </aside>
      <article className="legal-document">
        <header><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{summary}</p><small>Effective 18 July 2026 · Last updated 18 July 2026</small></header>
        {sections.map((section, index) => <section id={`section-${index + 1}`} key={section.title}>
          <h2>{index + 1}. {section.title}</h2>
          {section.paragraphs?.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
          {section.bullets && <ul>{section.bullets.map((bullet, bulletIndex) => <li key={bulletIndex}>{bullet}</li>)}</ul>}
        </section>)}
      </article>
    </div>
    <LegalFooter />
  </main>;
}
