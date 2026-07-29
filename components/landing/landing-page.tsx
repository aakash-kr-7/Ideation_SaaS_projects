"use client";

import Link from "next/link";
import Image from "next/image";
import type { CSSProperties } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  DollarSign,
  FileSearch,
  Fingerprint,
  Gauge,
  Radar,
  Rocket,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Zap,
} from "lucide-react";
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
        <a href="#system">How it works</a>
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
          Put My Idea On Trial <ArrowRight size={15}/>
        </Link>
      </div>
    </header>
    <main>
      {/* ── HERO ── */}
      <section className="bs-hero bs-hero-cinematic">
        <div className="bs-hero-glow" aria-hidden="true"/>
        <div className="bs-hero-copy">
          <p className="bs-kicker"><Sparkles size={14}/> For builders with more ideas than time</p>
          <h1>Know what&apos;s worth building.<span>Before it costs you.</span></h1>
          <p>
            The market is already leaving clues. ShouldBuild turns them into one brutally useful
            decision—what to build, what to test, and what deserves none of your next six months.
          </p>
          <div className="bs-actions">
            <Link
              className="button" 
              href={authEntryUrl("/research/new?mode=quick_scan", "register")}
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              Put My Idea On Trial <ArrowRight size={16}/>
            </Link>
            <Link className="bs-link" href="/sample-report?mode=full_validation">Open a sample verdict <ChevronRight size={15}/></Link>
          </div>
          <div className="bs-hero-assurances">
            <span><Fingerprint size={13}/> Cited public sources</span>
            <span><ShieldCheck size={13}/> Contradiction checks</span>
            <span><Target size={13}/> An explicit next move</span>
          </div>
          <div className="bs-hero-audience">
            <small>BUILT FOR THE MOMENT BEFORE THE ROADMAP</small>
            <div>
              <span>FOUNDERS</span>
              <span>PRODUCT LEADERS</span>
              <span>STUDIOS</span>
              <span>INVESTORS</span>
            </div>
          </div>
        </div>
        <HeroDecisionRoom/>
        <div className="bs-hero-scroll-cue" aria-hidden="true"><i/><span>THE EVIDENCE STARTS BELOW</span></div>
      </section>

      <CinematicLandingBody/>

      {false && <>
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
      </>}
    </main>
    <LegalFooter />
  </div>;
}

function CinematicLandingBody() {
  const report = sampleFullValidation;
  const sourceCount = countEvidenceSources(report.opportunity.evidence);

  return (
    <div className="sb-body">
      <section className="sb-depth" id="system" aria-labelledby="depth-title">
        <div className="sb-section-glow sb-glow-violet" aria-hidden="true"/>
        <div className="sb-source-rail" aria-label="Public evidence sources">
          <span>TRACES FROM THE OPEN MARKET</span>
          <div className="sb-source-marquee">
            <div>
              {marqueeSignals.map((signal, i) => (
                <b key={`cinematic-${signal.name}-${i}`}>
                  <Image src={signal.logoPath} alt="" width={24} height={24}/>
                  {signal.name}
                </b>
              ))}
            </div>
          </div>
        </div>

        <div className="sb-section-intro">
          <p className="sb-overline"><CircleDot size={13}/> Choose the depth of the decision</p>
          <h2 id="depth-title">A fast no.<br/><span>Or a defensible yes.</span></h2>
          <p>
            Some ideas need a pressure test. Others need a case you can take into the room.
            Start at the depth your decision actually deserves.
          </p>
        </div>

        <div className="sb-depth-grid">
          <Link
            className="sb-depth-card sb-depth-quick"
            href="/sample-report?mode=quick_scan"
            aria-label="Open the Quick Scan sample report"
          >
            <div className="sb-card-number">01</div>
            <div className="sb-depth-card-copy">
              <span className="sb-chip"><Gauge size={14}/> Monthly decision filter</span>
              <h3>Quick Scan</h3>
              <p>Find out whether an idea deserves another hour—or should leave your head today.</p>
              <ul>
                <li><Check size={14}/> 12-factor opportunity score</li>
                <li><Check size={14}/> Market, competition, and risk signals</li>
                <li><Check size={14}/> One explicit verdict and next move</li>
              </ul>
              <span className="sb-text-link">Open the Quick Scan sample <ArrowRight size={15}/></span>
            </div>
            <div className="sb-quick-visual" aria-label="Illustrative Quick Scan score">
              <div className="sb-score-ring">
                <div><strong>72</strong><small>/100</small></div>
              </div>
              <span>VALIDATE FIRST</span>
              <div className="sb-factor-row"><i style={{"--fill":"82%"} as CSSProperties}/><b>Buyer pain</b><em>Strong</em></div>
              <div className="sb-factor-row"><i style={{"--fill":"64%"} as CSSProperties}/><b>Demand signal</b><em>Promising</em></div>
              <div className="sb-factor-row"><i style={{"--fill":"48%"} as CSSProperties}/><b>Wedge clarity</b><em>Test</em></div>
            </div>
          </Link>

          <Link
            className="sb-depth-card sb-depth-full"
            href="/sample-report?mode=full_validation"
            aria-label="Open the Full Validation sample report"
          >
            <div className="sb-card-number">02</div>
            <div className="sb-depth-card-copy">
              <span className="sb-chip"><ShieldCheck size={14}/> Complete decision dossier</span>
              <h3>Full Validation</h3>
              <p>Turn a consequential idea into an evidence-backed position your team can challenge—and act on.</p>
              <ul>
                <li><Check size={14}/> Adversarial contradiction analysis</li>
                <li><Check size={14}/> Competitor, pricing, and positioning map</li>
                <li><Check size={14}/> MVP scope and launch sequence</li>
              </ul>
              <span className="sb-text-link">Open the Full Validation sample <ArrowRight size={15}/></span>
            </div>
            <div className="sb-dossier-stack" aria-hidden="true">
              <div className="sb-stack-sheet sb-stack-sheet-back"/>
              <div className="sb-stack-sheet sb-stack-sheet-mid"/>
              <div className="sb-stack-sheet sb-stack-sheet-front">
                <div className="sb-stack-head"><Fingerprint size={14}/><span>EVIDENCE MEMO</span><b>76</b></div>
                <div className="sb-stack-title">AI client research copilot</div>
                <div className="sb-stack-verdict"><ShieldCheck size={13}/> VALIDATE FIRST</div>
                <div className="sb-stack-bars"><i/><i/><i/><i/></div>
                <div className="sb-stack-foot"><span>17 cited signals</span><span>4 weak assumptions</span></div>
              </div>
            </div>
          </Link>
        </div>
      </section>

      <section className="sb-leverage" aria-labelledby="leverage-title">
        <div className="sb-section-glow sb-glow-lime" aria-hidden="true"/>
        <div className="sb-section-intro sb-section-intro-wide">
          <p className="sb-overline"><Zap size={13}/> Research engineered for leverage</p>
          <h2 id="leverage-title">You don&apos;t need more information.<br/><span>You need the advantage hiding inside it.</span></h2>
          <p>Every module is built to collapse ambiguity into a decision, a question, or a move.</p>
        </div>

        <div className="sb-bento">
          <article className="sb-bento-card sb-bento-pain">
            <div className="sb-bento-top"><span><Users size={16}/> Buyer pain</span><em>LIVE SIGNAL MAP</em></div>
            <h3>Hear the sentence<br/>customers keep repeating.</h3>
            <p>Clusters recurring complaints, workarounds, and urgency cues so the problem stops sounding theoretical.</p>
            <div className="sb-quote-stream">
              <div><i>01</i><p>“We lose the context between the call and the roadmap.”</p><span>Recurring workflow signal</span></div>
              <div><i>02</i><p>“I know the pain is real. I can&apos;t prove who pays.”</p><span>Commercial uncertainty</span></div>
              <div><i>03</i><p>“The current tool is powerful, but nobody keeps it updated.”</p><span>Adoption friction</span></div>
            </div>
          </article>

          <article className="sb-bento-card sb-bento-competition">
            <div className="sb-bento-top"><span><Target size={16}/> Competition</span><em>WHITE SPACE</em></div>
            <h3>See the crowded room—and the door nobody owns.</h3>
            <div className="sb-radar-map" aria-hidden="true">
              <i/><i/><i/><i/><i/>
              <span className="dot dot-a"/><span className="dot dot-b"/><span className="dot dot-c"/><span className="dot dot-you"/>
              <b>YOUR WEDGE</b>
            </div>
          </article>

          <article className="sb-bento-card sb-bento-risk">
            <div className="sb-bento-top"><span><AlertTriangle size={16}/> Fragile assumptions</span><em>ADVERSARIAL PASS</em></div>
            <h3>Find the belief that can quietly kill the business.</h3>
            <div className="sb-risk-callout"><b>ASSUMPTION 04</b><p>Buyers will switch before the product owns their system of record.</p><span>Test before build</span></div>
          </article>

          <article className="sb-bento-card sb-bento-pricing">
            <div className="sb-bento-top"><span><DollarSign size={16}/> Pricing</span><em>ANCHOR MAP</em></div>
            <h3>Price against what the pain already costs.</h3>
            <div className="sb-price-axis"><span>$</span><i/><b>LOW FRICTION</b><b>VALUE PROOF</b><b>PREMIUM WEDGE</b></div>
          </article>

          <article className="sb-bento-card sb-bento-next">
            <div className="sb-bento-top"><span><Rocket size={16}/> Next move</span><em>7-DAY ACTION</em></div>
            <h3>Leave with a move,<br/>not a reading list.</h3>
            <div className="sb-next-ticket">
              <span>Highest-leverage experiment</span>
              <p>Put the pricing promise in front of 8 qualified buyers before touching the product.</p>
              <div><b>OWNER</b><em>Founder</em><b>DECISION</b><em>Friday</em></div>
            </div>
          </article>
        </div>
      </section>

      <section className="sb-method" aria-labelledby="method-title">
        <div className="sb-method-orbit" aria-hidden="true"/>
        <div className="sb-section-intro">
          <p className="sb-overline"><Radar size={13}/> The adversarial research loop</p>
          <h2 id="method-title">We don&apos;t ask what proves you right.<br/><span>We look for what could make you wrong.</span></h2>
          <p>Optimism starts ideas. Opposition makes the ones worth keeping much harder to kill.</p>
        </div>

        <div className="sb-method-track">
          <article>
            <span>01 / DISCOVER</span><Search size={27}/>
            <h3>Map the market&apos;s existing behavior.</h3>
            <p>Demand traces, substitutes, complaints, pricing, communities, and buying language.</p>
          </article>
          <div className="sb-method-link"><i/><ArrowRight size={18}/></div>
          <article>
            <span>02 / WEIGH</span><FileSearch size={27}/>
            <h3>Separate evidence from enthusiasm.</h3>
            <p>Every signal is graded for relevance, reliability, recency, and contradiction.</p>
          </article>
          <div className="sb-method-link"><i/><ArrowRight size={18}/></div>
          <article>
            <span>03 / ATTACK</span><AlertTriangle size={27}/>
            <h3>Pressure-test the fragile assumptions.</h3>
            <p>The report hunts the objection, dependency, or switching cost that changes the decision.</p>
          </article>
        </div>

        <div className="sb-method-result">
          <span>INPUT</span><b>Your conviction</b><i/>
          <span>OUTPUT</span><b>A decision that survived opposition</b>
        </div>
      </section>

      <section className="sb-verdict" aria-labelledby="verdict-title">
        <div className="sb-section-intro sb-section-intro-wide">
          <p className="sb-overline"><BadgeCheck size={13}/> The verdict system</p>
          <h2 id="verdict-title">No &ldquo;it depends.&rdquo;<br/><span>Just the next move.</span></h2>
          <p>Every report ends in one of five positions. The nuance stays inside the evidence—not in the recommendation.</p>
        </div>
        <div className="sb-verdict-stage">
          <div className="sb-verdict-line" aria-hidden="true"/>
          <article className="sb-verdict-card sb-v-build"><i/><small>01</small><h3>Build Now</h3><p>The evidence supports motion. Protect speed.</p><span>COMMIT</span></article>
          <article className="sb-verdict-card sb-v-validate"><i/><small>02</small><h3>Validate First</h3><p>The opportunity is real. One belief still needs proof.</p><span>TEST</span></article>
          <article className="sb-verdict-card sb-v-niche"><i/><small>03</small><h3>Niche Down</h3><p>The signal exists. Your scope is hiding it.</p><span>FOCUS</span></article>
          <article className="sb-verdict-card sb-v-weak"><i/><small>04</small><h3>Weak Signal</h3><p>There isn&apos;t enough evidence to earn conviction yet.</p><span>WAIT</span></article>
          <article className="sb-verdict-card sb-v-avoid"><i/><small>05</small><h3>Avoid</h3><p>The red flags outweigh the available upside.</p><span>REDIRECT</span></article>
        </div>
      </section>

      <section className="sb-report" id="report" aria-labelledby="report-title">
        <div className="sb-report-intro">
          <p className="sb-overline"><Fingerprint size={13}/> Open the decision room</p>
          <h2 id="report-title">A report that earns the right<br/><span>to influence your roadmap.</span></h2>
          <p>Not a wall of generated prose. A navigable case: claim, source, contradiction, confidence, action.</p>
          <Link className="sb-text-link" href="/sample-report?mode=full_validation">
            Explore the live sample <ArrowRight size={15}/>
          </Link>
        </div>
        <DecisionDossier report={report} sourceCount={sourceCount}/>
      </section>

      <section className="sb-trust" aria-labelledby="trust-title">
        <div className="sb-trust-copy">
          <p className="sb-overline"><ShieldCheck size={13}/> Confidence without the theatre</p>
          <h2 id="trust-title">The strongest answer is sometimes:<br/><span>we don&apos;t know yet.</span></h2>
          <p>ShouldBuild makes uncertainty visible, so confidence has to be earned rather than performed.</p>
        </div>
        <div className="sb-trust-grid">
          <article><span>01</span><Fingerprint size={24}/><h3>Evidence over invention</h3><p>Claims point back to public sources you can inspect for yourself.</p></article>
          <article><span>02</span><AlertTriangle size={24}/><h3>Uncertainty stays visible</h3><p>Missing evidence and weak confidence are part of the verdict, not hidden below it.</p></article>
          <article><span>03</span><Users size={24}/><h3>Customers still get the last word</h3><p>The report sharpens who to interview, what to ask, and which answer changes the bet.</p></article>
        </div>
      </section>

      <section className="sb-pricing" id="pricing" aria-labelledby="pricing-title">
        <div className="sb-pricing-glow" aria-hidden="true"/>
        <div className="sb-pricing-copy">
          <p className="sb-overline"><DollarSign size={13}/> Start before the sunk cost</p>
          <h2 id="pricing-title">Your first decision costs less<br/><span>than the first hour of the wrong build.</span></h2>
          <p>Run one Quick Scan free each month. Go deeper when the evidence—and the decision—actually warrants it.</p>
        </div>
        <div className="sb-access-card">
          <div className="sb-access-head"><span>FOUNDER ACCESS</span><em>AVAILABLE NOW</em></div>
          <div className="sb-access-price"><b>Free</b><span>1 Quick Scan<br/>every month</span></div>
          <ul>
            <li><CheckCircle2 size={16}/> 12-factor opportunity score</li>
            <li><CheckCircle2 size={16}/> Cited market evidence</li>
            <li><CheckCircle2 size={16}/> Verdict and next action</li>
          </ul>
          <Link className="button" href={authEntryUrl("/research/new?mode=quick_scan", "register")}>
            Put My Idea On Trial <ArrowRight size={16}/>
          </Link>
          <small>No card. No checkout. Full Validation access is coming soon.</small>
        </div>
      </section>

      <section className="sb-final" aria-labelledby="final-title">
        <div className="sb-final-grid" aria-hidden="true"/>
        <div className="sb-final-orbits" aria-hidden="true"><i/><i/><i/></div>
        <div className="sb-final-content">
          <p className="sb-overline"><Sparkles size={13}/> One idea. One honest verdict.</p>
          <h2 id="final-title">Your idea is asking<br/>for a verdict.</h2>
          <p>Give it one before you give it your year.</p>
          <div className="sb-actions">
            <Link className="button" href={authEntryUrl("/research/new?mode=quick_scan", "register")}>
              Put My Idea On Trial <ArrowRight size={16}/>
            </Link>
            <Link className="sb-text-link" href="/sample-report?mode=full_validation">See what the verdict looks like <ChevronRight size={15}/></Link>
          </div>
          <div className="sb-final-proof"><span><Fingerprint size={13}/> Source-linked</span><span><ShieldCheck size={13}/> Adversarial</span><span><Target size={13}/> Actionable</span></div>
        </div>
      </section>
    </div>
  );
}

function DecisionDossier({
  report,
  sourceCount,
}: {
  report: typeof sampleFullValidation;
  sourceCount: number;
}) {
  const { scorecard } = report.opportunity;
  const verdictLabel = scorecard.verdict.replace("_", " ");

  return (
    <div className="sb-dossier-stage">
      <div className="sb-dossier-note sb-note-one"><Fingerprint size={13}/><b>SOURCE-LINKED</b><span>Every claim has a trail</span></div>
      <div className="sb-dossier-note sb-note-two"><AlertTriangle size={13}/><b>ASSUMPTION 04</b><span>Switching cost needs proof</span></div>
      <div className="sb-dossier-window">
        <header>
          <Brand/>
          <span>VALIDATION / DECISION DOSSIER</span>
          <div><i/> SAMPLE DATA</div>
        </header>
        <div className="sb-dossier-shell">
          <aside>
            <div className="sb-dossier-score"><strong>{scorecard.total}</strong><small>/100</small><span>OPPORTUNITY<br/>SCORE</span></div>
            <nav>
              <b>Verdict</b><span>Evidence</span><span>Competition</span><span>Pricing</span><span>MVP Scope</span><span>Launch Plan</span><span>Risks</span>
            </nav>
            <div className="sb-dossier-confidence"><i/><span>EVIDENCE CONFIDENCE</span><b>{scorecard.confidence}%</b></div>
          </aside>
          <main>
            <div className="sb-dossier-title">
              <div><span>IDEA BEING VALIDATED</span><h3>{report.opportunity.name}</h3><p>{report.opportunity.oneLiner}</p></div>
              <div className="sb-dossier-verdict"><span>VERDICT</span><b>{verdictLabel}</b></div>
            </div>
            <div className="sb-dossier-metrics">
              <div><strong>{scorecard.total}</strong><span>Overall score</span></div>
              <div><strong>{scorecard.confidence}%</strong><span>Evidence confidence</span></div>
              <div><strong>{sourceCount}</strong><span>Distinct source signals</span></div>
              <div><strong>04</strong><span>Assumptions to test</span></div>
            </div>
            <div className="sb-dossier-content">
              <article className="sb-dossier-summary">
                <span>EXECUTIVE VERDICT</span>
                <h4>The opportunity is credible. The wedge still needs to earn its right to exist.</h4>
                <p>{report.executiveSummary}</p>
                <div className="sb-dossier-actions">
                  <b><CheckCircle2 size={13}/> Interview the narrowest buyer set first</b>
                  <b><CheckCircle2 size={13}/> Test willingness to switch before feature depth</b>
                </div>
              </article>
              <article className="sb-dossier-evidence">
                <div className="sb-dossier-panel-head"><span>EVIDENCE BOARD</span><em>LIVE TRACE</em></div>
                <div><i className="good"/><p><b>Buyer pain repeats across independent sources</b><span>Community discussions · review sites · search behavior</span></p><strong>82</strong></div>
                <div><i className="warn"/><p><b>Incumbent workflow owns meaningful context</b><span>Competitor reviews · migration complaints</span></p><strong>61</strong></div>
                <div><i className="violet"/><p><b>Pricing signal exists, but buyer is too broad</b><span>Comparable products · founder interviews required</span></p><strong>54</strong></div>
              </article>
              <article className="sb-dossier-contradiction">
                <div><AlertTriangle size={16}/><span>ADVERSARIAL PASS</span></div>
                <h4>The most dangerous assumption</h4>
                <p>Users may love the insight but refuse to move their source of truth. Prove the wedge can coexist before you ask it to replace.</p>
                <b>TEST THIS BEFORE BUILDING THE INTEGRATION LAYER <ArrowRight size={13}/></b>
              </article>
              <article className="sb-dossier-next">
                <span>HIGHEST-LEVERAGE NEXT MOVE</span>
                <h4>{report.opportunity.launch.weekOne[0]}</h4>
                <div><span>TIMEBOX</span><b>7 DAYS</b><span>DECISION</span><b>GO / NARROW</b></div>
              </article>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

function HeroDecisionRoom() {
  return (
    <div className="bs-hero-room" aria-label="Illustrative ShouldBuild decision room preview">
      <div className="bs-room-orbit bs-room-orbit-one" aria-hidden="true"/>
      <div className="bs-room-orbit bs-room-orbit-two" aria-hidden="true"/>
      <div className="bs-room-scanline" aria-hidden="true"/>

      <div className="bs-room-float bs-room-float-signal">
        <span><Search size={12}/> MARKET SIGNAL</span>
        <b>Recurring workflow pain</b>
        <small><i/> Strong enough to investigate</small>
      </div>

      <div className="bs-room-float bs-room-float-risk">
        <span><AlertTriangle size={12}/> ASSUMPTION AT RISK</span>
        <b>Pricing intent is unproven</b>
        <small>Test the buying trigger before scope</small>
      </div>

      <div className="bs-room-provocation">
        <Sparkles size={13}/>
        <p>The expensive part of a bad idea isn&apos;t the code.</p>
        <b>It&apos;s the conviction it borrowed from you.</b>
      </div>

      <div className="bs-hero-console">
        <header>
          <span><CircleDot size={13}/> SHOULDBUILD / DECISION ROOM</span>
          <i>ILLUSTRATIVE PREVIEW</i>
        </header>

        <div className="bs-console-body">
          <aside>
            <div className="bs-console-mark"><Radar size={16}/></div>
            <span className="active">Verdict</span>
            <span>Evidence</span>
            <span>Competition</span>
            <span>Pricing</span>
            <span>MVP scope</span>
            <span>Risks</span>
          </aside>

          <main>
            <div className="bs-console-heading">
              <div>
                <small>OPPORTUNITY / B2B SAAS</small>
                <h3>AI client research copilot</h3>
              </div>
              <span className="bs-console-score">76<small>/100</small></span>
            </div>

            <div className="bs-console-verdict">
              <span><BadgeCheck size={15}/> OFFICIAL VERDICT</span>
              <b>VALIDATE FIRST</b>
            </div>

            <div className="bs-console-signals">
              <article>
                <span>BUYER PAIN</span>
                <b>Strong signal</b>
                <i><em style={{ width: "88%" }}/></i>
              </article>
              <article>
                <span>PRICING POWER</span>
                <b>Needs proof</b>
                <i><em style={{ width: "54%" }}/></i>
              </article>
              <article>
                <span>MARKET GAP</span>
                <b>Visible wedge</b>
                <i><em style={{ width: "71%" }}/></i>
              </article>
            </div>

            <div className="bs-console-next">
              <span><Zap size={15}/></span>
              <div>
                <small>HIGHEST-LEVERAGE NEXT MOVE</small>
                <b>Pre-sell the reporting workflow to five research-heavy teams.</b>
              </div>
              <ArrowRight size={16}/>
            </div>
          </main>
        </div>
      </div>

      <div className="bs-room-status">
        <span><i/> EVIDENCE MAPPED</span>
        <span><Check size={11}/> CONTRADICTION PASS COMPLETE</span>
      </div>
    </div>
  );
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
