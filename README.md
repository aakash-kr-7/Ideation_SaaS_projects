# SignalFit

**SignalFit** is an evidence-backed market validation and product research platform for founders, solo builders, indie hackers, creators, agencies, and students. 

It helps you decide what to build, what to validate, what to niche down, and what to avoid before wasting weeks writing code. A single validation run turns a raw idea into a structured, decision-grade report with buyer pain analysis, competitor mapping, pricing logic, risk assessment, MVP scope, and a step-by-step launch playbook.

The entire platform communicates one thing instantly:  
*“This tool tells me if my idea is worth building, why, what could kill it, who would pay, how to price it, and how to get my first customers.”*

---

## High-Level Architecture

SignalFit operates on a hybrid architecture designed for both fast local prototyping and production SaaS scaling:

```
                  ┌──────────────────────────────────────┐
                  │          Next.js Frontend            │
                  │  (Dashboard, Form, Interactive Rep)  │
                  └──────────────────┬───────────────────┘
                                     │
                     ┌───────────────┴───────────────┐
                     ▼                               ▼
       ┌───────────────────────────┐   ┌───────────────────────────┐
       │   In-Memory Demo Engine   │   │     SaaS Service Layer    │
       │    (Local Dev Pipeline)    │   │  (Supabase Server Actions)│
       └───────────────────────────┘   └─────────────┬─────────────┘
                                                     │
                                                     ▼
                                       ┌───────────────────────────┐
                                       │     Supabase Platform     │
                                       │  (Postgres DB, RLS, Auth, │
                                       │    Webhooks, Realtime)    │
                                       └─────────────┬─────────────┘
                                                     │
                                                     ▼
                                       ┌───────────────────────────┐
                                       │   Supabase Edge Function  │
                                       │ (Background Worker Queue) │
                                       └───────────────────────────┘
```

*   **Next.js Frontend (App Router)**: Captures user briefs, manages dashboard summaries, handles interactive checklists (via LocalStorage), and provides responsive decision-ready exports (Markdown, CSV, JSON, printer-friendly PDF).
*   **In-Memory Validation Engine (Local Dev)**: Enables offline testing. Runs query generation, web scrapes, source extraction, scoring, and report compilation fully client-side using mock adapters (`lib/research/`).
*   **Supabase SaaS Service Layer (Production)**: Coordinates PostgreSQL database access, Google OAuth/Email login, Row Level Security (RLS) tenant isolation policies, and database triggers.
*   **Supabase Edge Functions & Webhooks (Background Queue)**: Receives database insert webhooks, executes LLM analysis, updates progression states, and broadcasts live progress logs over Supabase Realtime to the UI.

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
  api/research/        # API endpoints for pipeline progress, starts, and exports
  dashboard/           # User dashboard showing previous validations and next steps
  research/            # Idea brief form, real-time progress page, and results view
  sample-report/       # Public validation report sandbox
components/
  dashboard/           # Dashboard stats and project list items
  landing/             # Landing page marquee, CTA, and visual signals
  opportunity/         # Comparison matrix and verdict badge components
  report/              # Report tab views (Verdict, Pricing, MVP, Launch, Heatmap)
  research/            # Idea brief form and step progress logger
  scoring/             # SVG score badges, score guide, and breakdown sliders
  ui/                  # Standard buttons, premium cards, and visual tokens
lib/
  actions/             # Server Actions calling database repositories
  repositories/        # Data access layer interfacing directly with Supabase clients
  services/            # Business logic orchestration layer
  supabase/            # Supabase server client and middleware helpers
  research/            # In-memory validation engine and mock stores
  report-schema.ts     # Zod contract schemas for frontend/backend validation
  report-mocks.ts      # Structured sample validation data
  scoring.ts           # 12-factor calculation metrics and verdict thresholds
supabase/
  migrations/          # 15 chronological SQL migrations managing schema and RLS policies
  functions/           # Supabase Edge Functions (Deno background worker)
scripts/               # Development helper scripts for auditing realtime and RLS
```

---

## Deep-Dive Documentation

For advanced details, check the respective files:
*   **Database Schema & SQL Migrations**: Refer to [README-BACKEND.md](file:///c:/Users/aakash09/Desktop/Ideation/README_BACKEND.md)
*   **Frontend Dashboard, Tabs & Visual System**: Refer to [README-FRONTEND.md](file:///c:/Users/aakash09/Desktop/Ideation/README-FRONTEND.md)
*   **Entity Relationships**: Refer to [Database.md](file:///c:/Users/aakash09/Desktop/Ideation/docs/Database.md)
*   **Code Layers & Architecture Layers**: Refer to [Architecture.md](file:///c:/Users/aakash09/Desktop/Ideation/docs/Architecture.md)
*   **Validation Pipeline Stages**: Refer to [Pipeline.md](file:///c:/Users/aakash09/Desktop/Ideation/docs/Pipeline.md)
