# SignalFit

**SignalFit** is an evidence-backed market validation and product research platform for founders, solo builders, indie hackers, creators, agencies, and students. 

It helps you decide what to build, what to validate, what to niche down, and what to avoid before wasting weeks writing code. A single validation run turns a raw idea into a structured, decision-grade report with buyer pain analysis, competitor mapping, pricing logic, risk assessment, MVP scope, and a step-by-step launch playbook.

The entire platform communicates one thing instantly:  
*“This tool tells me if my idea is worth building, why, what could kill it, who would pay, how to price it, and how to get my first customers.”*

---

## Key Features & Capabilities

- **Premium SaaS Rebrand**: Overhauled visual identity with a refined color system—featuring an **Indigo core** (`#6366F1`) combined with green, amber, and red accents to communicate risk, opportunity, and verdicts clearly.
- **Differentiated Typography**: Uses **Instrument Sans** for bold display headings, **Inter** for readable body UI, and **IBM Plex Mono** for structured metrics and data tables.
- **Ethical Signal Strip Marquee**: An animated flowing marquee of real validation sources where buyers already speak (Reddit, Product Hunt, G2, Capterra, Chrome Web Store, Hacker News, App Reviews, Competitor Pricing, Founder Communities, and Search Trends).
- **12-Factor Scoring Model**: A transparent scoring system weighted across 12 validation criteria with inverted platform and regulatory risk calculations. Weights are fully adjustable to match your specific definition of a worthwhile opportunity.
- **5-State Verdict System**: Clear, actionable recommendations based on the evidence:
  - 🟢 **Build Now** (Score 85–100): Strong signals across the board.
  - 🟡 **Validate First** (Score 70–84): Promising, but key assumptions need testing.
  - 🔵 **Niche Down** (Score 55–69): Signal exists, but requires a narrower buyer segment.
  - ⚪ **Weak Signal** (Score 40–54): Insufficient evidence to justify build time yet.
  - 🔴 **Avoid** (Score 0–39): Red flags outweigh the opportunity.
- **Premium Validation Reports**: Interactive report tabs covering Verdict, Evidence Ledger (with source types and confidence scores), Competitor Table (with threat levels), Scoring Breakdown, MVP Blueprint (Versions 0 to 3), Pricing Strategy, Launch Playbook, Interactive Action Plan, and Risk Heatmap.
- **Decision-Ready Exports**: Seamless export pipelines to Markdown, JSON, CSV, and printer-ready PDF.
- **Side-by-Side Comparison Matrix**: Compare up to four opportunities across criteria, MRR paths, and validation steps.

---

## Design System & Aesthetics

SignalFit is styled as a premium founder intelligence desk: serious, sharp, trustworthy, and decision-oriented. It explicitly avoids the typical playful "AI chatbot wrapper" look.

- **Background**: Deep, warm charcoal black (`#09090B` base, `#0F1012` surface, `#16171B` elevated) with subtle gradient borders.
- **Visual Score Badges**: Circular SVG ring components that dynamically fill and color-code based on the overall opportunity score.
- **Zero Placeholders**: Clean, client-ready presentation templates filled with realistic B2B, agency, D2C, and tool mock reports.

---

## Local Development

### Prerequisites

- Node.js 18 or later

### Install Dependencies

```bash
npm install
```

### Start Development Server (with hot reloading)

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). If port 3000 is busy, Next.js will pick the next available local port. To force port 3001:

```bash
npm run dev:3001
```

### Production Build

```bash
npm run build
```

### Start Production Server

```bash
npm run start
```

*Note: The automatic server launcher searches for available ports from 3000 to 3019 to prevent port conflicts.*

---

## Project Structure

```text
app/
  api/research/        # Route handlers for query generation, search, and extraction
  dashboard/           # Validation pipeline index and scoring simulator
  research/            # New brief form, real-time progress logs, and report views
  sample-report/       # Public validation report sandbox
  sample-reports/      # Illustrative report library
components/
  dashboard/           # Pipeline overview and stat cards
  landing/             # Conversion-focused landing page and signals marquee
  opportunity/         # Verdict badges and comparison matrices
  report/              # Interactive validation report sections (Pricing, Launch, MVP, etc.)
  research/            # Idea brief form and step progress logger
  scoring/             # SVG score badges, score guide, and weight sliders
  ui/                  # Standard buttons, premium cards, and UI tokens
lib/
  copy.ts              # Central copywriting library (direct, commercial tone)
  scoring.ts           # 12-factor calculation logic and verdict thresholds
  report-schema.ts     # Zod contract schemas for API integrity
  report-mocks.ts      # Sample opportunity validation data
  research/            # Database mock adapters and in-memory store
supabase/
  schema.sql           # Canonical SQLite and PostgreSQL-compatible database schemas
```

---

## Validation Framework Samples

SignalFit includes five pre-built validation reports illustrating different opportunity profiles:

1. **Recruiter Resume Reformatting Engine** (Validate First - Score: 82)
2. **Visa Document Compiler** (Validate First - Score: 71)
3. **Stripe Failed Payment Recovery Tool** (Validate First - Score: 79)
4. **Designer Approval Portal** (Niche Down - Score: 68)
5. **GEO Audit Suite** (Validate First - Score: 71)

*These samples are designed to demonstrate the structure, depth, and presentation capability of a SignalFit document. They are not actual customer records.*
