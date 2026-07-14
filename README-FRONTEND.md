# SignalFit Frontend Architecture & User Interface

This document describes the design system, page routes, interactive validation report tabs, and file mapping of the **SignalFit** Next.js frontend.

---

## 1. Design System & Aesthetics

SignalFit is styled as a premium founder intelligence desk. It relies on a high-contrast dark theme, crisp typography, and responsive, interactive micro-animations.

*   **Colors**:
    *   **Backgrounds**: Base background is deep black (`#09090B`), cards and components use surface grey (`#0F1012`), and elevated surfaces use (`#16171B`).
    *   **Accent Color**: Deep Indigo Core (`#6366F1`) signals active operations and hero CTAs.
    *   **Verdicts & Risk Accents**:
        *   🟢 **Build Now** / **Low Risk**: Emerald Green (`#10B981`)
        *   🟡 **Validate First** / **Medium Risk**: Amber (`#F59E0B`)
        *   🔵 **Niche Down** / **High Risk**: Cobalt Blue (`#3B82F6`)
        *   🔴 **Avoid** / **Critical Risk**: Crimson Red (`#EF4444`)
*   **Typography**:
    *   **Display headings**: `Instrument Sans` (bold, tight letter spacing for display and headings).
    *   **UI copy / body text**: `Inter` (neutral, readable sans-serif).
    *   **Metrics / Data**: `IBM Plex Mono` (monospace for scores, prices, confidence percentages, and tables).

---

## 2. Page Routes & User Flows

The Next.js application has three main pages in the authenticated workspace:

```
  [ Dashboard (/dashboard) ] 
            │
            ├───► [ New Validation Form (/research/new) ]
            │                  │
            │                  ▼
            │     [ Progress View (/research/[id]/progress) ]
            │                  │ (WebSocket / Polling)
            │                  ▼
            └─────► [ Report Result View (/research/[id]/results) ]
```

### A. The Dashboard (`app/dashboard/page.tsx`)
*   **Purpose**: The central command center showing validation stats, next actions, and historical runs.
*   **Data Source**: Populated via `researchStore.list()` from the in-memory store.
*   **Elements**:
    *   **Empty State**: Shown when no validation runs exist. Guides the user to input their first idea.
    *   **Stats Cards**: Displays "Ideas validated", "Average score" of completed runs, "In progress" queue count, and "Ready to build" count.
    *   **Next Steps ("Do these first")**: Dynamic action items extracted from top-scored reports (e.g. Week 1 customer acquisition channel strategies).
    *   **Previous Validations**: Lists completed scans with their creation date, depth mode, and links to reports.
    *   **Leaderboard**: Ranks completed validation ideas by total score alongside verdict badges.

### B. New Brief Form (`app/research/new/page.tsx`)
*   **Purpose**: User input interface to submit product concepts.
*   **Inputs**:
    *   *Idea Name* & *Description* (what it does).
    *   *Target Customer* (who would pay for it).
    *   *Target Region* (defaults to "Global") and *Market Type* (B2B, D2C, Creator, Developer Tool, Local Business, etc.).
    *   *Constraints Adjuster*: Adjustment dropdowns for revenue targets, monetization models, complexity tolerance, and platform dependency limits.
    *   *Depth Modes*: "Fast Scan" (~2 minutes) or "Deep Validation" (~5 minutes).
*   **Action**: Submits POST to `/api/research/start`, creates an in-memory run, and redirects to `/research/${result.id}/progress`.

### C. Live Progress View (`app/research/[id]/progress/page.tsx`)
*   **Purpose**: Real-time status tracker for running validations.
*   **UI Components**:
    *   Pulsing progress loaders and progression bars (0% to 100%).
    *   **Live Metrics Panel**: Displays real-time tickers for "sources scanned", "evidence found", and "competitors mapped".
    *   **Terminal Log**: A terminal-style box displaying simulated pipeline log operations (e.g. `[12:00:00] Formulation queries...`).
*   **Routing**: Automatically redirects the user to `/research/${id}/results` once `reportReady: true` is polled from the API.

---

## 3. Interactive Report View (`components/report/ValidationReport.tsx`)

Once a validation run completes, the user receives an interactive 10-tab validation report:

1.  **Verdict**:
    *   Displays the executive summary, target buyer segment, core pain point, and the primary current workarounds identified.
2.  **Evidence**:
    *   Renders cards for extracted market signals (complaints, workarounds, pricing threads). Shows confidence levels, snippet text, and source URL citations.
3.  **Competitors**:
    *   A tabular analysis comparing competitor positioning, pricing, target buyer wedges, core strengths, and exploitable positioning gaps.
4.  **Scoring (Interactive)**:
    *   Renders the 12-factor score breakdown card.
    *   *Interactive Feature*: Users can adjust individual criteria weight sliders (or pick presets like "Solo Builder Friendly") to instantly recalculate the total score and action verdict.
5.  **MVP Blueprint**:
    *   Maps product evolution from Version 0 (concierge problem interview) to Version 3 (workflow retention). Explicitly categorizes features into "Must-have" vs. "Exclude for now".
6.  **Pricing (Interactive)**:
    *   Displays a four-tier pricing strategy (Free, Starter, Pro, Agency).
    *   *Interactive Feature*: Includes an embedded calculator permitting users to simulate MRR goals. Adjusting target prices and volume targets dynamically computes paths to $500 MRR and $3,000 MRR.
7.  **Launch**:
    *   Provides channels, customer outreach templates, and structured first-week validation experiments.
8.  **Action plan (Interactive)**:
    *   An interactive check-off guide split into Setup, Pain Mining, Financial Intent, and Launch Scope.
    *   *Interactive Feature*: Checkbox selections are tracked and saved to the browser's `LocalStorage` scoped by the report UUID, displaying progress meters.
9.  **Risks**:
    *   A severity heatmap displaying market, build, distribution, compliance, platform, pricing, and retention risk factors.
10. **Export (Interactive)**:
    *   Provides client-side triggers to download report files:
        *   `MD` (compiles report to GitHub Markdown).
        *   `JSON` (downloads structured raw data payload).
        *   `CSV` (exports summaries for spreadsheet modeling).
        *   `PDF` (opens system print dialog formatted for print layouts).

---

## 4. Frontend File & Component Map

Use this map to locate UI pieces and components in the repository:

*   **Pages & Layouts**:
    *   `app/layout.tsx` -> High-level HTML structure, metadata title tags, and Google Fonts loading (`Instrument Sans` + `Inter`).
    *   `app/dashboard/page.tsx` -> Main dashboard page layout and stats aggregation.
    *   `app/research/new/page.tsx` -> Validation submission page container.
    *   `app/research/[id]/progress/page.tsx` -> Progress polling page container.
    *   `app/research/[id]/results/page.tsx` -> Validation results container.
    *   `app/compare/page.tsx` -> Side-by-side run comparison layout.
*   **Components**:
    *   `components/layout/app-shell.tsx` -> The sidebar navigation and header layout wrapper.
    *   `components/landing/` -> Marketing home page elements and flow marquee strips.
    *   `components/dashboard/` -> Project cards and telemetry cards.
    *   `components/research/` -> Input form handler (`research-form.tsx`) and polling layout (`research-progress.tsx`).
    *   `components/scoring/` -> SVG scorecard indicators (`score-badge.tsx`), criteria guides (`ScoreGuide.tsx`), and weight slider workbenches (`ScoreBreakdown.tsx`, `ScoringWorkbench.tsx`).
    *   `components/report/` -> Report container (`ValidationReport.tsx`), embedded pricing calculator (`PricingCalculator.tsx`), and validation tests (`ValidationExperiment.tsx`).
    *   `components/opportunity/` -> Verdict badges and comparison grids (`CompareMatrix.tsx`).
