# SignalFit closure gate — 2026-07-15

## Decision

**REFUSE TO SIGN OFF.** A brand-new user cannot currently be proven to travel from Google OAuth to a completed, evidence-backed report with four downloadable exports and no intervention. The local Google provider is disabled, the new live run failed during normalized artifact validation, the implemented reasoning fallback is Cerebras rather than the required OpenRouter, the authenticated export route returned HTTP 409 despite four valid stored artifacts, and one public table (`scoring_weights`) intentionally permits cross-user reads.

All timestamps below are from the live local Supabase/Next.js system in this session (UTC unless noted).

## 1. Live adversarial RLS matrix

The reusable test is `scripts/audit-rls.mjs`. It created two temporary authenticated users, built disposable victim fixtures for all 37 public tables, authenticated as the attacker, attempted SELECT/INSERT/UPDATE/DELETE against victim rows, and removed both users and fixtures. Test time: `2026-07-15T17:40:42.562Z`.

Legend: `0 rows` means the victim row was hidden by RLS; `42501` is PostgreSQL insufficient privilege / RLS rejection. A mutation returning zero rows is blocked because the victim row is excluded from the attacker-visible target set.

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| analytics_events | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| api_usage_logs | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| audit_logs | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| background_jobs | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| billing_customers | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| billing_subscriptions | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| cached_research | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| competitors | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| error_logs | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| evidence_items | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| feature_limits | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| launch_plans | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| launch_strategies | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| mvp_plans | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| mvp_scope_items | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| notifications | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| opportunities | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| opportunity_scores | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| pricing_models | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| projects | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| reasoning_agent_outputs | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| report_exports | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| report_versions | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| reports | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| research_runs | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| research_stages | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| risks | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| saved_comparisons | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| score_breakdowns | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| score_evidence_refs | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| scoring_weights | **FAIL (1 row visible)** | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| search_cache | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| sources | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| team_members | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| teams | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| user_preferences | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |
| users | PASS (0 rows) | PASS (42501) | PASS (0 rows) | PASS (0 rows) |

Result: 147 of 148 operations met the requested isolation expectation. The one failure is not an accidental leak: migration `20260715170000_reasoning_reports.sql` defines `scoring_weights` as global reference data with `USING (true)` for authenticated users. That design contradicts the gate's requirement that every cross-tenant SELECT on every table fail. Either exclude this non-tenant table from the criterion or move weights into tenant scope.

## 2. Mock-data reachability and repository structure

Repository-wide filename grep for `report-mocks`, `store_dummy`, dummy store, mock pipeline, mock provider, and in-memory store returned `NO_MATCHES`. Repository-wide symbol grep returned only two documentation sentences stating that an in-memory/mock provider is absent.

The fixture import graph is:

```text
lib/sample-reports.ts
  <- app/sample-report/page.tsx
```

No dashboard, authenticated research route, API route, report loader, progress component, or worker imports `lib/sample-reports.ts`. There is no `store_dummy.ts` or replacement store. Production export controls call the authenticated export API; the client-side render helpers in `lib/report-export.ts` execute only when `publicMode` is true for the public sample report.

The permanent worker source exists only under `supabase/functions/_shared/research/`; Next.js compatibility files re-export runtime-neutral types/scoring rather than copying the pipeline. The stale `README_BACKEND.md` duplicate was removed. Historical audit migrations remain because applied migration history is not an orphan and must not be rewritten. `scripts/audit-rls.mjs` is current and reusable rather than a one-off credential-bearing script.

## 3. Live user journey

### Required brand-new Google OAuth journey

**FAIL / BLOCKED.** The checked-in local Auth configuration has Google disabled. A live request to GoTrue returned:

```json
{"status":400,"body":"{\"code\":400,\"error_code\":\"validation_failed\",\"msg\":\"Unsupported provider: provider is not enabled\"}"}
```

The browser already held an authenticated session for the existing `Codex E2E` user, so that session was used only to test the remaining application path. It is not represented as a brand-new signup.

### Fresh live run from the authenticated UI

1. Opened `/research/new` and submitted a Deep Validation:
   - Idea: `ReturnsRadar for Shopify apparel brands`
   - Description: `A Shopify app that clusters return reasons from support tickets, reviews, and return notes, then identifies product-page and sizing issues causing preventable refunds.`
   - Buyer: operations/ecommerce managers at independent apparel brands processing 500–10,000 orders/month
   - Region: United States
   - Run ID: `d3613ab2-e4ea-4111-b1b9-b2ca9da3d161`
2. The browser reached `/research/d3613ab2-e4ea-4111-b1b9-b2ca9da3d161/progress`. Realtime UI observations changed from `Searching` to `Extracting` to `Normalizing`; source count changed from 0 to 3 and evidence count later changed to 15. Persisted stage details included `Searching public evidence with Tavily`, `Extracting three independently addressable sources with Firecrawl`, `Structuring evidence into database rows`, and `Deduplicating evidence and recording contradiction inputs`.
3. Real sources were stored, including:
   - `https://blog.fulfil.io/erp-systems-for-shopify-apparel-brands-operational-guide` (18,022 extracted characters)
   - `https://www.fulfil.io/blog/erp-systems-for-shopify-apparel-brands-operational-guide` (16,948 characters)
   - `https://shiphype.com/apparel-3pl`
4. Real extracted evidence included `Matrix Inventory Complexity` with the snippet `A mid-sized apparel brand with 50 active styles can easily manage 1,000+ active SKUs...` and confidence `0.85`.
5. The run reached terminal `Failed`, progress 100. The failure was persisted in `research_runs`, `research_stages`, `error_logs`, and displayed live in the progress UI. Required fields missing from compatible-provider output were `competitors`, `risks`, `pricing_model`, `mvp_plan`, and `launch_plan`.
6. Because the fresh run failed before scoring/generation, it produced no completed report, no 10-tab run-specific report, and no exports. The dashboard did show the fresh idea and linked it back to its progress/failure page, proving run persistence but not successful completion.

### Existing completed-run regression checks (not a substitute for the failed journey)

Run `28fc4c50-b79b-4a68-9cb0-99ddc62b6d01` (`RevisionProof approval ledger`) loaded as a real normalized report with score `75.6`, verdict `Validate First`, 3 sources, 25 evidence items, and 3 competitors. All 10 tab controls rendered populated run-specific sections:

- Verdict: executive summary and recommendation.
- Evidence: cited cards linked to `https://www.manyrequests.com/blog/design-approval-software` with extracted quotation snippets.
- Competitors: ManyRequests, Filestage, and Ziflow positioning/pricing/gaps.
- Scoring: all 12 factors and linked evidence counts.
- MVP Blueprint: versioned feedback capture, approval state tracking, reminders, exclusions.
- Pricing: persisted tier assumptions ($59/$118/$236 examples).
- Launch: first-customer and week-one sections.
- Action plan: four interactive checklist phases.
- Risks: three risks with mitigations.
- Export: Markdown, PDF, JSON, and CSV controls.

Applying the `Fast Revenue` preset changed weights (for example willingness-to-pay 11 -> 15 and speed-to-first-revenue 7 -> 15) and recalculated the visible score from `75.6` to `76.0`, retaining `Validate First`.

The first production Markdown export click failed visibly with `Stored export is not ready`. Database inspection nevertheless found all four immutable v2 artifacts. Direct service-role reads proved the stored files are non-empty and match their recorded SHA-256 values:

| Format | Bytes | SHA-256 | Content evidence |
|---|---:|---|---|
| JSON | 29,051 | `fa7230f3a005c57f0a18a8e9c832b0f06543afe92ffcb104c29ec7de26db9427` | Run ID, version 2, executive summary, normalized opportunity JSON |
| Markdown | 3,506 | `790379e9450270e08eb6758f105a3399efce954a5067cb024666de7a82aeb5df` | `# RevisionProof approval ledger`, score 75.6, evidence-ID table |
| CSV | 4,972 | `6c84694bb3c50ecf5145fcf92e7c3e525d96be8df0f091c30980052ea84fa850` | Per-factor rows with run ID, verdict, weights, and evidence IDs |
| PDF | 6,042 | `bc18294428ec166ee572fb3b366f222a74ad8a5357006d2de41fbfe3c44a19f0` | `%PDF-1.4` magic bytes |

Thus artifact generation/storage passed for that earlier run, but the real authenticated download user path failed in this session.

## 4. Cost cap, fallback, and usage logs

The fresh run recorded 19 physical provider attempts totaling `$0.2432`, below the configured default `$1.00` cap:

- Tavily search: 5 successes, `$0.0400`.
- Firecrawl extraction: 3 successes, `$0.0030`.
- Groq structured reasoning: 2 successes plus schema/429 failures, `$0.1200`; successful token pairs included `911/252` and `858/345` prompt/completion tokens.
- Cerebras fallback reasoning: 2 successes plus 2 schema failures, `$0.0800`; successful token pairs included `846/935` and `1050/247`.
- Cohere embeddings: 1 success, 189 prompt/input tokens, `$0.0002`.

This proves genuine itemized usage across search, extraction, structured reasoning, fallback, and embeddings, and proves the live fallback currently implemented is **Groq -> Cerebras**. It does not prove the requested Groq -> OpenRouter path because no OpenRouter provider exists in the current worker. It also does not prove cost-cap rejection under a full completed run: this run failed at $0.2432 before reaching specialists/Final Judge, and no cap boundary was crossed.

## 5. Documentation reconciliation

The required README/backend/frontend and Architecture/Database/Secrets/Troubleshooting/Pipeline documents now agree on direct worker dispatch, canonical statuses, 37 public tables, the global `scoring_weights` exception, Groq -> Cerebras fallback, five provider credentials, four export formats, disabled-by-default local Google OAuth, and the live export/normalization gaps. `docs/Deployment.md` was also corrected to remove the obsolete database-webhook instructions. User-facing copy was corrected from 8 to 12 scoring criteria.

## 6. Regression checks

- `npx tsc --noEmit --incremental false`: PASS.
- Deno scoring/reasoning/export/provider suite: 10 passed, 0 failed.
- `npm run build`: PASS; all routes compiled, including research progress/results/export.

## Gaps and exact closure recommendations

1. Enable and configure Google OAuth in the target live Supabase project, then repeat with a Google identity that has never authenticated to that project. Capture the resulting `auth.users`, `public.users`, team, membership, and dashboard rows.
2. Decide whether the required fallback is OpenRouter or Cerebras. If OpenRouter is mandatory, restore an OpenRouter provider, secret/model settings, attempt logging, and fallback tests; otherwise amend the gate explicitly.
3. Fix compatible-provider normalized artifact generation so all required fields survive three attempts. Add a regression fixture using the exact incomplete response shape observed here, deploy, and complete a fresh run.
4. Normalize object/array PostgREST relation cardinality in the export route. Re-test all four browser controls and hash the browser-downloaded files against `report_exports.sha256`.
5. Decide whether global authenticated reads of `scoring_weights` are acceptable. If the gate literally covers every table, add tenant ownership or remove the public table from that criterion.
6. Execute a completed run close to the cost cap or a controlled cap-exhaustion test to prove the worker stops before the cap and resumes from persisted spend.

Until all six are closed and the same brand-new run completes the entire path, SignalFit does not pass this closure gate.
