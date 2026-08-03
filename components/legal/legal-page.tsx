import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { LegalFooter } from "@/components/layout/legal-footer";

export type LegalSection = {
  title: string;
  paragraphs?: React.ReactNode[];
  bullets?: React.ReactNode[];
};

export function LegalPage({ eyebrow, title, summary, sections }: {
  eyebrow: string;
  title: string;
  summary: React.ReactNode;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen bg-sb-bg-base text-sb-text-primary">
      <header className="border-b border-sb-border-hairline">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-sb-4 px-sb-5 py-sb-4 md:px-sb-8">
          <Brand />
          <Link className="text-sm text-sb-text-secondary underline decoration-sb-border-hairline-strong underline-offset-4 transition-colors duration-sb-fast ease-sb-standard hover:text-sb-text-primary" href="/">Back to ShouldBuild</Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-6xl gap-sb-10 px-sb-5 py-sb-10 md:px-sb-8 lg:grid-cols-[13rem_minmax(0,1fr)] lg:py-sb-16">
        <aside className="self-start lg:sticky lg:top-sb-8">
          <p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-sb-text-tertiary">{eyebrow}</p>
          <nav className="mt-sb-4 grid gap-sb-2" aria-label={`${title} sections`}>
            {sections.map((section, index) => (
              <a className="text-sm leading-relaxed text-sb-text-secondary hover:text-sb-text-primary" href={`#section-${index + 1}`} key={section.title}>{index + 1}. {section.title}</a>
            ))}
          </nav>
        </aside>

        <article className="min-w-0 max-w-[72ch] font-sb-body text-base leading-8 text-sb-text-secondary">
          <header className="border-b border-sb-border-hairline pb-sb-10">
            <p className="m-0 text-xs font-medium uppercase tracking-[0.08em] text-sb-text-tertiary">{eyebrow}</p>
            <h1 className="mb-sb-4 mt-sb-3 font-sb-display text-3xl font-[480] tracking-[-0.015em] text-sb-text-primary md:text-4xl">{title}</h1>
            <p className="m-0 text-lg leading-8 text-sb-text-secondary">{summary}</p>
            <small className="mt-sb-4 block font-sb-mono text-xs text-sb-text-tertiary">Effective 18 July 2026 · Last updated 18 July 2026</small>
          </header>

          {sections.map((section, index) => (
            <section className="scroll-mt-sb-8 border-b border-sb-border-hairline py-sb-8 last:border-b-0" id={`section-${index + 1}`} key={section.title}>
              <h2 className="mb-sb-4 mt-0 font-sb-display text-xl font-[480] text-sb-text-primary">{index + 1}. {section.title}</h2>
              {section.paragraphs?.map((paragraph, paragraphIndex) => <p className="my-sb-4" key={paragraphIndex}>{paragraph}</p>)}
              {section.bullets && (
                <ul className="my-sb-4 grid list-disc gap-sb-3 pl-sb-6 marker:text-sb-text-tertiary">
                  {section.bullets.map((bullet, bulletIndex) => <li key={bulletIndex}>{bullet}</li>)}
                </ul>
              )}
            </section>
          ))}
        </article>
      </div>
      <LegalFooter />
    </main>
  );
}
