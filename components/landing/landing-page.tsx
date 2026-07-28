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
          "description": "Evidence-backed startup idea validation — cited sources, adversarial analysis, and a clear build or avoid verdict.",
          "url": "https://shouldbuild.app",
          "applicationCategory": "BusinessApplication",
          "offers": {
            "@type": "Offer",
            "price": "0",
            "priceCurrency": "USD",
            "description": "Free monthly Quick Scan"
          },
          "featureList": [
            "12-factor scoring with verdict",
            "Cited public-source evidence",
            "Adversarial contradiction analysis",
            "Competitor and pricing analysis",
            "Evidence Confidence rating",
            "Exportable decision reports"
          ]
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
          className="button" 
          href={authEntryUrl("/dashboard", "register")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
        >
          Run a Free Quick Scan <ArrowRight size={15}/>
        </Link>
      </div>
    </header>
    <main>
      {/* ── HERO ── */}
      <section className="bs-hero">
        <div className="bs-hero-copy">
          <p className="bs-kicker"><Radar size={14}/> Evidence-backed idea validation</p>
          <h1>Stop building on assumptions.<br/><span>Validate before you invest.</span></h1>
          <p>Don't waste months building what the market doesn't want. ShouldBuild searches real public sources, analyzes competitors, and delivers a definitive build or avoid verdict — so you can commit with confidence.</p>
          <div className="bs-actions">
            <Link
              className="button" 
              href={authEntryUrl("/research/new?mode=quick_scan", "register")}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              Validate My Idea Free <ArrowRight size={16}/>
            </Link>
            <Link className="bs-link" href="/sample-report?mode=full_validation">View a Sample Full Validation <ChevronRight size={15}/></Link>
          </div>
          <small><ShieldCheck size={14}/> Real source citations · Adversarial contradiction analysis · No fabricated evidence</small>
        </div>
        <MemoPreview/>
      </section>

      <section className="bs-report-types" aria-labelledby="report-types-title">
        <div className="bs-section-head">
          <p className="bs-kicker">Two levels of research</p>
          <h2 id="report-types-title">One scan to filter. One report to decide.</h2>
        </div>
        <div className="bs-report-type-grid">
          <article><Gauge size={22}/><p className="eyebrow">1 credit · free monthly</p><h3>Quick Scan</h3><p>The fast decision checkpoint. Is there real demand? Real competition? Obvious risk? Quick Scan answers the question before you invest another day thinking about it.</p><ul><li>12-factor score, verdict, and core evidence</li><li>Ideal for filtering ideas before committing time</li></ul></article>
          <article className="featured"><Shield size={22}/><p className="eyebrow">3 credits · complete research</p><h3>Full Validation</h3><p>The comprehensive decision dossier. Essential before you write a line of code, raise money, or hire. Deep adversarial research, competitor mapping, pricing strategy, and a go-to-market plan grounded in cited evidence.</p><ul><li>Broader evidence, explicit objections, and contradiction analysis</li><li>Essential before committing meaningful time or money</li></ul></article>
        </div>
      </section>

      {/* ── SIGNAL STRIP ── */}
      <div className="bs-signal-strip-label">Evidence gathered from real public sources — not AI invention</div>
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
          <h2>From evidence screen to a decision you can defend.</h2>
          <p>Quick Scan gives you the score, verdict, core evidence, risks, and next actions. Full Validation goes deeper on every dimension — with citations to back each conclusion.</p>
        </div>
        <div className="bs-value-grid">
          <Value icon={Users} title="Buyer pain analysis" text="Understand what customers are actually complaining about in public — and what that tells you about willingness to pay."/>
          <Value icon={Target} title="Competitor breakdown" text="See who you're up against, what they charge, where they're weak, and what gap you can realistically own."/>
          <Value icon={DollarSign} title="Pricing direction" text="Cited pricing signals and willingness-to-pay evidence — not guesswork. Validated against real market behaviour."/>
          <Value icon={AlertTriangle} title="Risk assessment" text="Market, execution, platform, and distribution risks — surfaced before they become expensive problems."/>
          <Value icon={Zap} title="MVP scope" text="A proposed first build scope with explicit exclusions — so you know what to build and what to skip."/>
          <Value icon={Rocket} title="Go-to-market direction" text="Evidence-informed acquisition channels, outreach language, and a week-one experiment — not generic advice."/>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="bs-proof">
        <div className="bs-section-head">
          <p className="bs-kicker">The methodology</p>
          <h2>Designed to challenge your assumptions, not confirm them.</h2>
          <p>Most tools look for reasons to say yes. ShouldBuild is engineered to look for reasons to say no — before you spend months building something the market doesn't want.</p>
        </div>
        <div className="bs-loop">
          <Brief number="01" title="Multi-Pass Evidence Search" text="The research engine runs broad, targeted, and explicitly disconfirming search passes across forums, competitor sites, review platforms, and directories."/>
          <Brief number="02" title="Source Quality Weighting" text="Not all signals are equal. Willingness-to-pay evidence is weighted higher than discussion-only signals. Tier-1 sources are prioritised."/>
          <Brief number="03" title="Adversarial Verdict Gate" text="Before finalising the score, the system actively challenges its own conclusion — looking for contradictions and counterevidence — then cites everything."/>
        </div>
      </section>

      {/* ── VERDICT SYSTEM ── */}
      <section className="bs-value">
        <div className="bs-section-head">
          <p className="bs-kicker">The verdict system</p>
          <h2>Build, validate, niche down, or walk away — with reasons.</h2>
          <p>Every report ends with a clear, evidence-based recommendation. Not "it depends." A decision you can act on today.</p>
        </div>
        <div className="bs-verdicts">
          <VerdictCard cls="build" title="Build Now" desc="Strong signals across demand, competition, and pricing. The evidence supports moving forward."/>
          <VerdictCard cls="validate" title="Validate First" desc="Promising signals, but key assumptions need direct buyer confirmation before you commit."/>
          <VerdictCard cls="niche" title="Niche Down" desc="Opportunity exists — but not at this scope. Narrow the buyer or use case to find a viable entry point."/>
          <VerdictCard cls="weak" title="Weak Signal" desc="Not enough evidence to proceed confidently. The report tells you exactly what's missing."/>
          <VerdictCard cls="avoid" title="Avoid" desc="Red flags outweigh the opportunity. Redirect your energy — the report explains why."/>
        </div>
      </section>

      {/* ── INSIDE A REPORT ── */}
      <section className="bs-showcase" id="report">
        <div className="bs-section-head">
          <p className="bs-kicker">Inside the report</p>
          <h2>Every conclusion has a source. Every score is explainable.</h2>
          <p>Not a wall of AI-generated text. A structured decision document where evidence, interpretation, contradictions, and risks are clearly separated — and every claim links to its original source.</p>
        </div>
        <MemoPreview expanded/>
        <Link className="button ghost" href="/sample-report?mode=full_validation">Read the full sample report <ArrowRight size={15}/></Link>
      </section>

      {/* ── WHAT THIS IS NOT ── */}
      <section className="bs-value">
        <div className="bs-section-head">
          <p className="bs-kicker">Honest about the limits</p>
          <h2>What ShouldBuild is — and isn't.</h2>
          <p>Trust comes from knowing exactly what a tool can and can't do. Here's where ShouldBuild ends and your judgment begins.</p>
        </div>
        <div className="bs-verdicts">
          <VerdictCard cls="weak" title="Not a replacement for customers" desc="ShouldBuild structures market evidence into a verdict. You still need to talk to real buyers — the report tells you what to ask."/>
          <VerdictCard cls="avoid" title="Not an AI idea generator" desc="Every claim in a ShouldBuild report links to a cited, verifiable public source. We do not invent market data."/>
          <VerdictCard cls="niche" title="Not a guarantee" desc="The report surfaces evidence, gaps, and a recommended next experiment. Markets are uncertain — this reduces that uncertainty."/>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="bs-pricing">
        <div>
          <p className="bs-kicker">Pricing</p>
          <h2>Start free. Go deeper when the evidence justifies it.</h2>
          <p>One Quick Scan is available each calendar month. Paid credit purchase is not active yet — see the pricing page for current access details.</p>
        </div>
        <div className="bs-price-row">
          <span className="active">Quick Scan<b>Free monthly</b><small>1 run included every calendar month</small></span>
          <span>Full Validation<b>Coming soon</b><small>Paid credit purchase in progress</small></span>
          <span>Pro plan<b>Not launched</b><small>Terms not yet finalised</small></span>
        </div>
        <Link className="button" href="/pricing">See current access details <ArrowRight size={15}/></Link>
        <small className="pricing-disclosure">No payment or checkout is active at this time.</small>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="bs-final">
        <p className="bs-kicker">Stop building on assumptions.</p>
        <h2>Your next idea deserves<br/>evidence, not a guess.</h2>
        <Link
          className="button" 
          href={authEntryUrl("/research/new?mode=quick_scan", "register")}
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
        >
          Validate My Idea Free <ArrowRight size={16}/>
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
