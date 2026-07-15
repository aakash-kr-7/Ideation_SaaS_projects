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
            │                  │ (Supabase Realtime)
            │                  ▼
            └─────► [ Report Result View (/research/[id]/results) ]
```

### A. The Dashboard (`app/dashboard/page.tsx`)
*   **Purpose**: The central command center showing validation stats, next actions, and historical runs.
*   **Data Source**: Tenant-scoped `research_runs`, `opportunities`, `opportunity_scores`, and normalized opportunity child rows read from Supabase under the signed-in user’s RLS context.
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
*   **Action**: Calls the repository-backed `startResearchRun` Server Action, creates a real `research_runs` row, dispatches the Edge worker, and redirects to `/research/${result.id}/progress`. Dispatch rejection marks that same row `Failed`; the form never falls back to a mock route or in-memory store.

### C. Live Progress View (`app/research/[id]/progress/page.tsx`)
*   **Purpose**: Real-time status tracker for running validations.
*   **Data Source**: The client hydrates once from tenant-scoped `research_runs`, `research_stages`, `sources`, `evidence_items`, `opportunities`, and `competitors`, then subscribes to `research_runs` and `research_stages` through Supabase Realtime. RLS supplies tenant isolation; application code does not add a `team_id` filter.
*   **UI Components**:
    *   Pulsing progress loaders and progression bars (0% to 100%).
    *   **Live Metrics Panel**: Displays real-time tickers for "sources scanned", "evidence found", and "competitors mapped".
    *   **Terminal Log**: A terminal-style rendering of persisted `research_stages.created_at`, `progress_detail`, and `error_message` values.
*   **Routing**: Automatically redirects the user to `/research/${id}/results` when a real `research_runs.status = 'Completed'` Realtime event arrives. No timer, simulated ticker, or polling loop advances the UI.

---

## 3. Interactive Report View (`components/report/ValidationReport.tsx`)

Once a validation run completes, the user receives an interactive 10-tab validation report:

The production report loader reads the run’s normalized records directly under the signed-in user’s RLS context. It requires the `reports` row plus its `opportunities`, `evidence_items`/`sources`, `competitors`, `risks`, `pricing_models`, `mvp_plans`/`mvp_scope_items`, `launch_plans`/`launch_strategies`, `opportunity_scores`, `score_breakdowns`, `score_evidence_refs`, and `report_exports`. A completed run missing required normalized records is shown as an explicit data error; the UI does not substitute illustrative content.

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
    *   Displays the persisted pricing model, core price, first offer, rationale, and initial customer target.
    *   *Interactive Feature*: Includes an embedded calculator seeded from the run’s real `pricing_models.price_point`.
7.  **Launch**:
    *   Provides channels, customer outreach templates, and structured first-week validation experiments.
8.  **Action plan (Interactive)**:
    *   An interactive check-off guide split into Setup, Pain Mining, Financial Intent, and Launch Scope.
    *   *Interactive Feature*: Checkbox selections are tracked and saved to the browser's `LocalStorage` scoped by the report UUID, displaying progress meters.
9.  **Risks**:
    *   A severity heatmap displaying the persisted `risks` rows for the current opportunity.
10. **Export (Interactive)**:
    *   `MD`, `JSON`, `CSV`, and `PDF` request the immutable artifacts recorded in `report_exports` and stored in the private Supabase Storage `exports` bucket.
    *   The browser does not compile production exports and the PDF control does not use the print dialog.

The 2026-07-15 closure audit found a live regression in this request path: the latest report version had all four stored artifacts, but the authenticated export route returned `409 Stored export is not ready`. The UI therefore must not be described as successfully downloading production exports until the nested `reports -> report_versions` relation handling in `app/api/research/[id]/export/route.ts` is corrected and all four controls are re-tested.

### Sample report boundary

`/sample-report` intentionally imports `lib/sample-reports.ts`. It is an illustrative public demo, is labelled `PUBLIC SAMPLE REPORT` and `Sample validation report`, and is the only user-facing route allowed to use fixture data. Its client-side sample exports remain isolated from authenticated production reports.

---

## 4. Frontend File & Component Map

Use this map to locate UI pieces and components in the repository:

*   **Pages & Layouts**:
    *   `app/layout.tsx` -> High-level HTML structure, metadata title tags, and Google Fonts loading (`Instrument Sans` + `Inter`).
    *   `app/dashboard/page.tsx` -> Main dashboard page layout and stats aggregation.
    *   `app/research/new/page.tsx` -> Validation submission page container.
    *   `app/research/[id]/progress/page.tsx` -> Realtime progress page container.
    *   `app/research/[id]/results/page.tsx` -> Validation results container.
    *   `app/compare/page.tsx` -> Side-by-side run comparison layout.
*   **Components**:
    *   `components/layout/app-shell.tsx` -> The sidebar navigation and header layout wrapper.
    *   `components/landing/` -> Marketing home page elements and flow marquee strips.
    *   `components/dashboard/` -> Project cards and telemetry cards.
    *   `components/research/` -> Server Action form handler (`research-form.tsx`) and Realtime layout (`research-progress.tsx`).
    *   `components/scoring/` -> SVG scorecard indicators (`score-badge.tsx`), criteria guides (`ScoreGuide.tsx`), and weight slider workbenches (`ScoreBreakdown.tsx`, `ScoringWorkbench.tsx`).
    *   `components/report/` -> Report container (`ValidationReport.tsx`), embedded pricing calculator (`PricingCalculator.tsx`), and validation tests (`ValidationExperiment.tsx`).
    *   `components/opportunity/` -> Verdict badges and comparison grids (`CompareMatrix.tsx`).
