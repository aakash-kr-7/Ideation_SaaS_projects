import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronRight, FileSearch, Gauge, Radar, Shield, ShieldCheck, Target, TrendingUp, Users, Zap, AlertTriangle, DollarSign, Rocket, BarChart3 } from "lucide-react";
import { Brand } from "@/components/layout/brand";

const signals = ["Reddit", "Product Hunt", "G2", "Capterra", "Chrome Web Store", "Hacker News", "App Reviews", "Competitor Pricing", "Founder Communities", "Search Trends"];
// Duplicate for seamless marquee loop
const marqueeSignals = [...signals, ...signals];

export function LandingPage() {
  return <div className="bs-modern">
    <header className="bs-nav"><Brand/><nav><a href="#how">How it works</a><a href="#report">Sample report</a><a href="#pricing">Pricing</a></nav><div><Link href="/auth">Sign in</Link><Link className="bs-btn bs-btn-bright" href="/research/new">Validate your idea <ArrowRight size={15}/></Link></div></header>
    <main>
      {/* ── HERO ── */}
      <section className="bs-hero">
        <div className="bs-hero-copy">
          <p className="bs-kicker"><Radar size={14}/> Market validation for builders</p>
          <h1>Stop building products<br/>nobody <span>wants.</span></h1>
          <p>Describe your idea. Get a market-backed verdict — Build Now, Validate First, Niche Down, or Avoid — with buyer pain, competition, pricing, risks, and a first-customer plan.</p>
          <div className="bs-actions">
            <Link className="bs-btn bs-btn-bright" href="/research/new">Validate your idea <ArrowRight size={16}/></Link>
            <Link className="bs-link" href="/sample-report">See a sample report <ChevronRight size={15}/></Link>
          </div>
          <small><ShieldCheck size={14}/> Real market signals · Every source cited · No fake data</small>
        </div>
        <MemoPreview/>
      </section>

      {/* ── SIGNAL STRIP ── */}
      <section className="bs-signal-strip">
        <span>Market signals analyzed from</span>
        <div>{marqueeSignals.map((signal, i) => <b key={`${signal}-${i}`}>{signal}</b>)}</div>
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
          <p className="bs-kicker">How it works</p>
          <h2>From raw idea to market-backed verdict in minutes.</h2>
          <p>Three steps. No guessing. No weeks of manual research. Just a clear answer on whether to build, validate, narrow down, or walk away.</p>
        </div>
        <div className="bs-loop">
          <Brief number="01" title="Describe your idea" text="Tell us the product, the target buyer, and the problem it solves. Takes about 30 seconds."/>
          <Brief number="02" title="We analyze the market" text="SignalFit scans Reddit, G2, Product Hunt, competitor pricing, and 6 more source categories for real market signals."/>
          <Brief number="03" title="Get your verdict" text="Receive a scored report with a clear verdict — Build Now, Validate First, Niche Down, or Avoid — plus your exact next steps."/>
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

      {/* ── PRICING ── */}
      <section id="pricing" className="bs-pricing">
        <div>
          <p className="bs-kicker">Pricing</p>
          <h2>Know what to build. Starting at $0.</h2>
          <p>Start with a free scan. Upgrade when you need full reports, comparison tools, or client-ready exports.</p>
        </div>
        <div className="bs-price-row">
          <span>Signal<b>$0</b><small>1 quick scan per month</small></span>
          <span className="active">Analyst<b>$29</b><small>Full validation reports</small></span>
          <span>Principal<b>$69</b><small>Compare + custom scoring</small></span>
          <span>Director<b>$149</b><small>Client-ready exports</small></span>
        </div>
        <Link className="bs-btn bs-btn-bright" href="/pricing">See full pricing <ArrowRight size={15}/></Link>
      </section>

      {/* ── FINAL CTA ── */}
      <section className="bs-final">
        <p className="bs-kicker">Ready to validate?</p>
        <h2>Your next idea deserves<br/>better than a guess.</h2>
        <Link className="bs-btn bs-btn-bright" href="/research/new">Validate your first idea — free <ArrowRight size={16}/></Link>
      </section>
    </main>
    <footer><Brand/><span>SignalFit · Know what to build before you build it.</span></footer>
  </div>;
}

function MemoPreview({ expanded = false }: { expanded?: boolean }) {
  return <div className={`bs-product-frame${expanded ? " expanded" : ""}`}>
    <div className="bs-window">
      <header><span className="bs-window-dot"/><span>SIGNALFIT / VALIDATION REPORT</span><i>SAMPLE DATA</i></header>
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
