"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2, ChevronRight, FileSearch, Gauge, Radar, Shield, ShieldCheck, Target, TrendingUp, Users, Zap, AlertTriangle, DollarSign, Rocket, BarChart3, LoaderCircle } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { createClient } from "@/lib/supabase/client";
import { authCallbackUrl } from "@/lib/auth-redirect";
import { LegalFooter } from "@/components/layout/legal-footer";
import { launchPricing, regionalPrice, type PricingRegionHint } from "@/lib/pricing";
import { usePricingRegion } from "@/components/pricing/use-pricing-region";

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

export function LandingPage({ initialRegion = "auto" }: { initialRegion?: PricingRegionHint }) {
  const [activeCta, setActiveCta] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const pricingRegion = usePricingRegion(initialRegion);
  const quickPrice = regionalPrice(launchPricing.oneOff.quick, pricingRegion);
  const fullPrice = regionalPrice(launchPricing.oneOff.full, pricingRegion);
  const proPrice = regionalPrice(launchPricing.plans.proMonthly, pricingRegion);

  const handleGoogleSignIn = async (ctaKey: string, redirectTo: string) => {
    setActiveCta(ctaKey);
    setAuthError("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: authCallbackUrl(window.location.origin, redirectTo),
          skipBrowserRedirect: true,
        },
      });
      if (error) {
        throw error;
      }
      if (!data.url) {
        throw new Error("Google sign-in did not return a redirect URL.");
      }
      window.location.assign(data.url);
    } catch (e: unknown) {
      setAuthError(e instanceof Error ? e.message : "Google sign-in could not be started.");
      setActiveCta(null);
    }
  };

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
        <a 
          href="#" 
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          onClick={(e) => { e.preventDefault(); handleGoogleSignIn("signin", "/dashboard"); }}
        >
          {activeCta === "signin" && <LoaderCircle size={14} className="animate-spin" />}
          Sign in
        </a>
        <a 
          className="bs-btn bs-btn-bright" 
          href="#" 
          style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          onClick={(e) => { e.preventDefault(); handleGoogleSignIn("get-started", "/dashboard"); }}
        >
          {activeCta === "get-started" && <LoaderCircle size={14} className="animate-spin" />}
          Get started <ArrowRight size={15}/>
        </a>
      </div>
    </header>
    <main>
      {authError && <div className="auth-error" role="alert">{authError}</div>}
      {/* ── HERO ── */}
      <section className="bs-hero">
        <div className="bs-hero-copy">
          <p className="bs-kicker"><Radar size={14}/> Market validation for builders</p>
          <h1>Don't guess. Run an adversarial<br/><span>market validation.</span></h1>
          <p>ShouldBuild uses a multi-pass research pipeline to test your idea against real market signals. It weights willingness-to-pay over cheap talk, tries to disprove its own verdict, and delivers a cited report in ~5 minutes.</p>
          <div className="bs-actions">
            <a 
              className="bs-btn bs-btn-bright" 
              href="#" 
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
              onClick={(e) => { e.preventDefault(); handleGoogleSignIn("validate-hero", "/research/new"); }}
            >
              {activeCta === "validate-hero" && <LoaderCircle size={14} className="animate-spin" />}
              Validate your idea — free <ArrowRight size={16}/>
            </a>
            <Link className="bs-link" href="/sample-report">See a sample report <ChevronRight size={15}/></Link>
          </div>
          <small><ShieldCheck size={14}/> Real market signals · Every source cited · No fake data</small>
        </div>
        <MemoPreview/>
      </section>

      {/* ── SIGNAL STRIP ── */}
      <div className="bs-signal-strip-label">Research incorporates signals from trusted public platforms</div>
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
          <p className="bs-kicker">What you get in every report</p>
          <h2>One report. Every answer you need before building.</h2>
          <p>Each validation covers buyer pain, competition, pricing intelligence, risk assessment, MVP scope, and a step-by-step launch plan.</p>
        </div>
        <div className="bs-value-grid">
          <Value icon={Users} title="Buyer pain analysis" text="Find out if real people actually have this problem — and how badly they want it solved."/>
          <Value icon={Target} title="Competition breakdown" text="See who you're up against, what they charge, where the gaps are, and what you can exploit."/>
          <Value icon={DollarSign} title="Pricing intelligence" text="Know what buyers will pay before you set a price. Anchored to real competitive data."/>
          <Value icon={AlertTriangle} title="Risk assessment" text="See the risks before they cost you weeks. Market, execution, platform, and distribution."/>
          <Value icon={Zap} title="MVP scope" text="Know exactly what to build first and what to skip. No feature creep. No wasted sprints."/>
          <Value icon={Rocket} title="Launch playbook" text="Get a plan to reach your first 10 paying customers. Channels, outreach scripts, and success metrics."/>
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
        <Link className="bs-btn bs-btn-outline" href="/sample-report">Read the full sample report <ArrowRight size={15}/></Link>
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
          <VerdictCard cls="niche" title="Not an execution guarantee" desc="We can tell you if the market wants it and what to build first. The rest is on you."/>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="bs-pricing">
        <div>
          <p className="bs-kicker">Pricing</p>
          <h2>Start free. Pay when an idea deserves deeper research.</h2>
          <p>One useful Quick Scan every month, with no card required. Buy a report once or subscribe when you validate regularly.</p>
        </div>
        <div className="bs-price-row">
          <span>Free<b>{regionalPrice(launchPricing.plans.free, pricingRegion)}</b><small>1 Quick Scan every 30 days</small></span>
          <span>Quick Scan<b>{quickPrice}</b><small>One-off · 1 credit</small></span>
          <span className="active">Full Validation<b>{fullPrice}</b><small>One-off · 3 credits</small></span>
          <span>Pro<b>{proPrice}</b><small>6 credits each month</small></span>
        </div>
        <Link className="bs-btn bs-btn-bright" href="/pricing">Compare plans and reports <ArrowRight size={15}/></Link>
        <small className="pricing-disclosure">{pricingRegion === "india" ? "India pricing shown in INR." : "Global pricing shown in USD."} Taxes included where applicable.</small>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="bs-final">
        <p className="bs-kicker">Ready to validate?</p>
        <h2>Your next idea deserves<br/>better than a guess.</h2>
        <a 
          className="bs-btn bs-btn-bright" 
          href="#" 
          style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
          onClick={(e) => { e.preventDefault(); handleGoogleSignIn("validate-final", "/research/new"); }}
        >
          {activeCta === "validate-final" && <LoaderCircle size={14} className="animate-spin" />}
          Validate your first idea — free <ArrowRight size={16}/>
        </a>
      </section>
    </main>
    <LegalFooter />
  </div>;
}

function MemoPreview({ expanded = false }: { expanded?: boolean }) {
  return <div className={`bs-product-frame${expanded ? " expanded" : ""}`}>
    <div className="bs-window">
      <header><span className="bs-window-dot"/><span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--display)", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.02em" }}><Image src="/brand/shouldbuild-mark.svg" alt="" width={16} height={16} style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,.15))" }}/>Should<span className="text-accent">Build</span></span><span style={{ opacity: 0.6 }}> / VALIDATION REPORT</span><i>SAMPLE DATA</i></header>
      <aside>
        <b>82</b>
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
            <h3>Recruiter resume reformatting engine</h3>
          </div>
          <button>Validate First</button>
        </div>
        <div className="bs-dashboard-stats">
          <Stat n="82" label="Overall score"/>
          <Stat n="68%" label="Evidence confidence"/>
          <Stat n="12" label="Sources analyzed"/>
        </div>
        <div className="bs-dashboard-panel">
          <div>
            <b>Verdict: Validate First</b>
            <small>Strong workflow pain with clear willingness to pay. Test document parsing accuracy before building.</small>
            <p><i/> Run a paid pilot with 3 agencies using messy PDF templates.</p>
            <p><i/> Conduct 5 buyer interviews before defining the MVP.</p>
          </div>
          <div className="bs-dashboard-panel score">
            <b>82</b>
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
