"use client";

import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2, ChevronRight, FileSearch, Gauge, Radar, Shield, ShieldCheck, Target, Users, Zap, AlertTriangle, DollarSign, Rocket } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { authEntryUrl } from "@/lib/auth-redirect";
import { LegalFooter } from "@/components/layout/legal-footer";
import { sampleFullValidation } from "@/lib/sample-reports";
import { countEvidenceSources } from "@/lib/report-mode-ui";

const signals = [
  { name: "Reddit", logoPath: "/logos/reddit.svg" },
  { name: "Product Hunt", logoPath: "/logos/producthunt.svg" },
  { name: "G2", logoPath: "/logos/g2.svg" },
  { name: "Capterra", logoPath: "/logos/capterra.svg" },
  { name: "GitHub", logoPath: "/logos/github.svg" },
  { name: "Hacker News", logoPath: "/logos/hackernews.svg" },
  { name: "Google Trends", logoPath: "/logos/googletrends.svg" },
  { name: "YouTube", logoPath: "/logos/youtube.svg" },
  { name: "LinkedIn", logoPath: "/logos/linkedin.svg" },
  { name: "X", logoPath: "/logos/x.svg" },
];
// Duplicate for seamless marquee loop
const marqueeSignals = [...signals, ...signals, ...signals];

export function LandingPage() {
  return <div className="bs-modern">
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          "name": "ShouldBuild",
          "applicationCategory": "BusinessApplication",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD"
          }
        })
      }}
    />
    <header className="bs-nav">
      <Brand/>
      <nav>
        <a href="#how">How it works</a>
        <a href="#report">Sample report</a>
        <a href="#pricing">Pricing</a>
      </nav>
      <div>
        <Link href={authEntryUrl("/dashboard")}>Sign in</Link>
        <Link
          className="bs-btn bs-btn-bright" 
          href={authEntryUrl("/dashboard", "register")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          Get started <ArrowRight size={15}/>
        </Link>
      </div>
    </header>
    <main>
      {/* ── HERO ── */}
      <section className="bs-hero">
        <div className="bs-hero-copy">
          <p className="bs-kicker"><Radar size={14}/> Market validation for builders</p>
          <h1>Don't guess. Run an adversarial<br/><span>market validation.</span></h1>
          <p>ShouldBuild tests your idea against real market signals, weighs evidence quality, and actively searches for reasons the opportunity may fail. Start with a rapid screen, then go deeper only when the evidence justifies it.</p>
          <div className="bs-actions">
            <Link
              className="bs-btn bs-btn-bright" 
              href={authEntryUrl("/research/new?mode=quick_scan", "register")}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              Run your free Quick Scan <ArrowRight size={16}/>
            </Link>
            <Link className="bs-link" href="/sample-report?mode=full_validation">See a Full Validation <ChevronRight size={15}/></Link>
          </div>
          <small><ShieldCheck size={14}/> Public-source research · Cited report claims · No sample fallback in real reports</small>
        </div>
        <MemoPreview/>
      </section>

      <section className="bs-report-types" aria-labelledby="report-types-title">
        <div className="bs-section-head">
          <p className="bs-kicker">Two levels of evidence</p>
          <h2 id="report-types-title">Screen quickly. Investigate deeply when it matters.</h2>
        </div>
        <div className="bs-report-type-grid">
          <article><Gauge size={22}/><p className="eyebrow">1 credit · one free monthly</p><h3>Quick Scan</h3><p>A rapid evidence-backed screen to determine whether an idea deserves deeper research.</p><ul><li>Concise score, verdict, and evidence signals</li><li>Best for filtering ideas before investing more</li></ul></article>
          <article className="featured"><Shield size={22}/><p className="eyebrow">3 credits · flagship report</p><h3>Full Validation</h3><p>Deeper grounded research with attributable evidence, adversarial analysis, MVP scope, pricing logic, and launch direction.</p><ul><li>Broader evidence and explicit objections</li><li>Best before committing meaningful time or money</li></ul></article>
        </div>
      </section>

      {/* ── SIGNAL STRIP ── */}
      <div className="bs-signal-strip-label">Examples of public platforms that search results may reference</div>
      <section className="bs-signal-strip">
        <div>
          {marqueeSignals.map((signal, i) => (
            <b key={`${signal.name}-${i}`}>
              <Image 
                src={signal.logoPath} 
                alt={`${signal.name} logo`} 
                width={28} 
                height={28}
              />
              {signal.name}
            </b>
          ))}
        </div>
      </section>

      {/* ── WHAT YOU GET ── */}
      <section className="bs-value" id="how">
        <div className="bs-section-head">
          <p className="bs-kicker">What Full Validation adds</p>
          <h2>Go from evidence screen to a decision-ready build brief.</h2>
          <p>Quick Scan covers the score, verdict, core evidence, risks, pricing direction, and next actions. Full Validation adds deeper evidence-backed sections and all export formats.</p>
        </div>
        <div className="bs-value-grid">
          <Value icon={Users} title="Buyer pain analysis" text="Review public evidence about the problem and identify what still needs direct buyer confirmation."/>
          <Value icon={Target} title="Competition breakdown" text="See who you're up against, what they charge, where the gaps are, and what you can exploit."/>
          <Value icon={DollarSign} title="Pricing direction" text="Assess cited pricing and willingness-to-pay signals, then validate the recommendation with a real purchase decision."/>
          <Value icon={AlertTriangle} title="Risk assessment" text="See the risks before they cost you weeks. Market, execution, platform, and distribution."/>
          <Value icon={Zap} title="MVP scope" text="Review a proposed first scope and explicit exclusions, then validate them before implementation."/>
          <Value icon={Rocket} title="Launch direction" text="Get evidence-informed channels, outreach language, and success criteria to test with potential customers."/>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="bs-proof">
        <div className="bs-section-head">
          <p className="bs-kicker">The methodology</p>
          <h2>Built to try and prove itself wrong.</h2>
          <p>We don't just look for people agreeing with your idea. The pipeline is actively adversarial, searching for existing workarounds and reasons not to build before finalizing a 12-factor score.</p>
        </div>
        <div className="bs-loop">
          <Brief number="01" title="Multi-Pass Research" text="The engine runs broad, targeted, and explicitly disconfirming search passes across forums, competitor sites, and directories."/>
          <Brief number="02" title="Source Tiering" text="Not all signals are equal. We weight willingness-to-pay evidence higher than discussion-only evidence."/>
          <Brief number="03" title="Adversarial Verdict Gate" text="Before finalizing the score, the system actively challenges its own conclusion to prevent confirmation bias, delivering a cited report."/>
        </div>
      </section>

      {/* ── VERDICT SYSTEM ── */}
      <section className="bs-value">
        <div className="bs-section-head">
          <p className="bs-kicker">The verdict system</p>
          <h2>Get the build, validate, niche down, or avoid verdict.</h2>
          <p>Every report ends with a clear recommendation based on the evidence. No vague "it depends." A decision you can act on.</p>
        </div>
        <div className="bs-verdicts">
          <VerdictCard cls="build" title="Build Now" desc="Strong signals across the board. Start building with confidence."/>
          <VerdictCard cls="validate" title="Validate First" desc="Promising, but key assumptions need testing before you commit."/>
          <VerdictCard cls="niche" title="Niche Down" desc="Opportunity exists, but narrow your focus to a specific buyer segment."/>
          <VerdictCard cls="weak" title="Weak Signal" desc="Not enough evidence yet. Dig deeper before making a decision."/>
          <VerdictCard cls="avoid" title="Avoid" desc="Red flags outweigh the opportunity. Redirect your energy."/>
        </div>
      </section>

      {/* ── INSIDE A REPORT ── */}
      <section className="bs-showcase" id="report">
        <div className="bs-section-head">
          <p className="bs-kicker">Inside the report</p>
          <h2>Every conclusion has evidence. Every score is explainable.</h2>
          <p>Not a wall of AI-generated text. A structured decision document where evidence, interpretation, and risks are separate and inspectable.</p>
        </div>
        <MemoPreview expanded/>
        <Link className="bs-btn bs-btn-outline" href="/sample-report?mode=full_validation">Read the full sample report <ArrowRight size={15}/></Link>
      </section>

      {/* ── WHAT THIS IS NOT ── */}
      <section className="bs-value">
        <div className="bs-section-head">
          <p className="bs-kicker">Limitations</p>
          <h2>What ShouldBuild is not.</h2>
          <p>A credible tool knows its limits. We use data to kill bad ideas quickly, not magic to predict the future.</p>
        </div>
        <div className="bs-verdicts">
          <VerdictCard cls="weak" title="Not a replacement for customers" desc="ShouldBuild structures market evidence into a verdict, but you still need to talk to real buyers to close them."/>
          <VerdictCard cls="avoid" title="Not an 'AI generator'" desc="We do not hallucinate business plans. Every claim in a ShouldBuild report is tied to cited, verifiable source material."/>
          <VerdictCard cls="niche" title="Not an execution guarantee" desc="The report surfaces evidence, uncertainty, and a recommended next test. It cannot prove the market will respond."/>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="bs-pricing">
        <div>
          <p className="bs-kicker">Pricing</p>
          <h2>Start with the monthly Quick Scan entitlement.</h2>
          <p>One Quick Scan entitlement is available each calendar month. Paid checkout and subscriptions are not available yet.</p>
        </div>
        <div className="bs-price-row">
          <span className="active">Quick Scan<b>Available</b><small>1 entitlement each calendar month</small></span>
          <span>Full Validation<b>Unavailable</b><small>Paid credit purchase is not connected</small></span>
          <span>Pro<b>Not launched</b><small>Plan terms are not finalized</small></span>
        </div>
        <Link className="bs-btn bs-btn-bright" href="/pricing">See current report access <ArrowRight size={15}/></Link>
        <small className="pricing-disclosure">No checkout or payment collection is active.</small>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="bs-final">
        <p className="bs-kicker">Ready to validate?</p>
        <h2>Your next idea deserves<br/>better than a guess.</h2>
        <Link
          className="bs-btn bs-btn-bright" 
          href={authEntryUrl("/research/new?mode=quick_scan", "register")}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          Run your free Quick Scan <ArrowRight size={16}/>
        </Link>
      </section>
    </main>
    <LegalFooter />
  </div>;
}

function MemoPreview({ expanded = false }: { expanded?: boolean }) {
  const report = sampleFullValidation;
  const { scorecard, evidence } = report.opportunity;
  return <div className={`bs-product-frame${expanded ? " expanded" : ""}`}>
    <div className="bs-window">
      <header><span className="bs-window-dot"/><span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--display)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}><Image src="/brand/shouldbuild-mark.svg" alt="" width={16} height={16} style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,.15))" }}/>Should<span className="text-accent">Build</span></span><span style={{ opacity: 0.6 }}> / VALIDATION REPORT</span><i>SAMPLE DATA</i></header>
      <aside>
        <b>{scorecard.total}</b>
        <span className="active">Verdict</span>
        <span>Evidence</span>
        <span>Competition</span>
        <span>Pricing</span>
        <span>MVP Scope</span>
        <span>Launch Plan</span>
        <span>Risks</span>
      </aside>
      <main>
        <div className="bs-dashboard-top">
          <div>
            <small>IDEA BEING VALIDATED</small>
            <h3>{report.opportunity.name}</h3>
          </div>
          <span className="bs-verdict-label">{scorecard.verdict}</span>
        </div>
        <div className="bs-dashboard-stats">
          <Stat n={String(scorecard.total)} label="Overall score"/>
          <Stat n={`${scorecard.confidence}%`} label="Evidence confidence"/>
          <Stat n={String(countEvidenceSources(evidence))} label="Distinct cited sources"/>
        </div>
        <div className="bs-dashboard-panel">
          <div>
            <b>Verdict: {scorecard.verdict}</b>
            <small>{report.executiveSummary}</small>
            <p><i/> {report.opportunity.launch.weekOne[0]}</p>
            <p><i/> {report.opportunity.launch.weekOne[2]}</p>
          </div>
          <div className="bs-dashboard-panel score">
            <b>{scorecard.total}</b>
            <small>Overall<br/>score</small>
          </div>
        </div>
      </main>
    </div>
  </div>;
}

function Stat({ n, label }: { n: string; label: string }) { return <span><b>{n}</b><small>{label}</small></span>; }
function Brief({ number, title, text }: { number: string; title: string; text: string }) { return <article><span>{number}</span><h3>{title}</h3><p>{text}</p><CheckCircle2 size={16}/></article>; }
function Value({ icon: Icon, title, text }: { icon: typeof FileSearch; title: string; text: string }) { return <article><Icon size={20}/><h3>{title}</h3><p>{text}</p></article>; }
function VerdictCard({ cls, title, desc }: { cls: string; title: string; desc: string }) { return <div className={`bs-verdict-card ${cls}`}><b>{title}</b><p>{desc}</p></div>; }
