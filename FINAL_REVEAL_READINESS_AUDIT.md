# ShouldBuild Final Reveal-Readiness Audit

**Audit date:** 2026-07-26  
**Audit posture:** Independent, evidence-first, no fixture reports or inserted report records accepted  
**Audited production build:** `reveal-20260726063400-90e60f9f` on isolated port `4317`  
**Release-gate result:** **FAIL**

## Executive verdict

ShouldBuild is **not reveal-ready**.

The remediation materially improved the product. Two fresh customer journeys were submitted through Chromium against an identified production build, both ran the canonical eight-stage pipeline, both consumed the correct credit reservation, and both persisted reports, evidence, charts, and four exports. Research is now substantially better aligned to the submitted approval/sign-off product than in the prior audit. Scoring is deterministic, queue isolation is fixed, queue cleanup is clean, tenant controls are strong, and the Quick Scan UI is polished.

The final bar still fails for four decisive reasons:

1. **The Full Validation browser journey is not usable end to end.** The run completed, but its results page returned a 404 for the full 15-second consistency barrier. The browser suite therefore passed only 1 of 2 tests, `release:check` failed, and its final build step was skipped.
2. **Research authority and integrity remain below the reveal standard.** Full Validation had only one Tier 1 evidence item, no proposition-specific contradiction, one weak directory result treated as negative evidence, and “High” evidence confidence despite only 6 of 11 required evidence families being covered.
3. **Important customer-facing claims are not reliably supported.** A market metric reports “Starter plan pricing: $29 - $79/month” and cites Blink Approval, whose inspected pricing page lists Starter at $79/month and Agency at $299/month. The Full executive readout also names DocuSign and Dropbox Sign as major incumbents even though the canonical brief explicitly treats general e-signature as adjacent and out of scope.
4. **The final founder action is incomplete.** The Quick Scan renders “Reduction in revision cycles” as the recommendation and repeats it as both “Next action” and “Prove before scaling.” Full Validation’s first-customer strategy is a list of fragments rather than an owned, sequenced founder action.

The product is suitable for a tightly controlled private demo using a pre-reviewed Quick Scan. It is not ready for private beta or public beta.

## Scores

| # | Category | Score / 10 | Basis |
|---|---|---:|---|
| 1 | Working product | 7.2 | Both real runs completed, but Full Validation results returned 404 and the release browser gate failed. |
| 2 | Quick Scan quality | 6.2 | On-topic, concise, attributable, and honest about gaps; only four accepted evidence items, no negative evidence, no pricing proof, and an unusable final recommendation. |
| 3 | Full Validation quality | 6.1 | Much deeper research footprint and six specialist desks, but only 11 evidence items, one Tier 1 item, one comparable competitor, no real contradiction, and overconfident conclusions. |
| 4 | Semantic relevance | 7.5 | Canonical proposition stayed aligned and CI/CD drift was eliminated; the executive summary reintroduced adjacent e-signature products as incumbents. |
| 5 | Source authority | 5.3 | Full had 1 Tier 1, 8 Tier 2, and 2 Tier 3 evidence items. Several important claims come from vendor marketing or unattributed/self-published statistics. |
| 6 | Evidence integrity | 5.7 | Claims, charts, and score refs are persisted, but pricing is misrepresented, the negative item is not a proposition-specific contradiction, and specialist prose exposes raw source IDs. |
| 7 | Deterministic scoring | 8.8 | All 12 factors persisted; independent recomputation with inverted risk factors exactly reproduced 40.7 and 51.8 and their `Weak Signal` verdicts. |
| 8 | Charts and exports | 7.2 | Four formats per report opened and checksum-matched; JSON matched the report payload and chart datasets matched persistence. Full PDF pages 3-4 have visible card overflow/clipping. |
| 9 | Research UI | 7.3 | Quick Scan report and charts are polished and usable. Full progress ran, but the completed results page failed closed as 404. |
| 10 | General UX | 7.4 | Strong visual system and navigation; visible recommendation copy is confusing, and a completed paid report can be inaccessible. |
| 11 | Security | 8.1 | RLS, storage, Realtime, internal-table controls, secret scan, request-size controls, owner paths, and rate limiting passed locally. Deployed HSTS/CSP posture was not exercised. |
| 12 | Operational reliability | 7.2 | Scoped worker/scheduler smokes passed and queue depth is zero; the Full report read-after-write failure and failed release gate remain operational blockers. |
| 13 | Product differentiation | 6.1 | Deterministic scoring, traceability, and exports exceed generic chat research structurally; source selection and decision quality do not yet clearly exceed a careful Gemini response. |
| 14 | Presentation readiness | 6.7 | Visual design is strong, but Full report 404, PDF overflow, raw metric-style recommendations, and internal source-ID text are reveal-visible defects. |
| 15 | **Overall** | **6.7** | Strong remediation, but the browser, evidence, confidence, recommendation, and release-gate failures prevent reveal readiness. |

## Real run IDs

| Mode | Run ID | Browser submitted | Pipeline | Persisted result | Browser result page |
|---|---|---|---|---|---|
| Quick Scan | `1c321d4d-dfb3-487c-a019-522e3c76ac37` | Yes | 8/8 stages completed, one attempt each | `Completed`, credit `consumed` | **PASS** |
| Full Validation | `6d0e168a-e6a3-47df-9f53-c206df3ff05a` | Yes | 8/8 stages completed, one attempt each | `Completed`, credit `consumed` | **FAIL — 404** |

Both were submitted for the same idea:

> A lightweight approval and audit-trail workspace for service teams that need to collect customer sign-off, preserve attributable approval history and reduce disputes.

These are not fixture reports. Each was created by a real authenticated browser form submission, dispatched through `/api/research/start`, reserved credits, progressed through persisted source retrieval and eight queue stages, and created its own immutable report version.

## Report comparison

| Measure | Quick Scan | Full Validation | Assessment |
|---|---:|---:|---|
| Accepted sources | 6 | 34 | Full is 5.7x deeper |
| Independent source domains | 6 | 32 | Full is 5.3x deeper |
| Pages fetched | 6 | 34 | Full is materially deeper |
| Accepted evidence items | 4 | 11 | Full is 2.75x deeper; fails the repository’s 3x evidence-depth gate |
| Evidence families | 2 | 6 | Full adds four families but covers only 6/11 required families |
| Tier 1 evidence | 0 | 1 | Fails Full authority-depth gate |
| Negative evidence | 0 | 1 | Numerically deeper, but the item is not meaningful proposition-specific negative evidence |
| Persisted contradictions | 0 | 0 | Fail |
| Provider calls | 24 | 76 | Full is 3.2x deeper |
| Tokens | 10,323 | 55,575 | Full is 5.4x deeper |
| Charts | 4 | 7 | Full adds evidence coverage, pricing, and score contribution |
| PDF pages | 14 | 21 | Full is visibly broader |
| Deterministic score | 40.7 | 51.8 | Both `Weak Signal` |
| Evidence confidence | Moderate, 0.62 | High, 0.81 | Full confidence is not justified by its authority and coverage gaps |

**Depth verdict:** Full Validation performs substantially more retrieval and synthesis, but it is not yet worth substantially more as a founder decision product. It adds volume and sections more reliably than it adds decisive primary evidence, comparable competitors, verified pricing, negative evidence, or a better founder action.

## Manual founder quality review

| Question | Verdict | Finding |
|---|---|---|
| Did it research the exact product? | **Qualified yes** | Evidence is centered on client approval, sign-off, audit trails, agency workflows, and no-login review. The Full executive readout weakens alignment by treating general e-signature products as direct incumbents. |
| Did it identify credible buyers and workflows? | **Mostly yes** | Client-service agencies and service operations leaders are credible; deliverable review, explicit approval, version history, and dispute prevention are recognizable workflows. Buyer evidence is mostly vendor-authored rather than direct buyer research. |
| Are competitors genuinely comparable? | **Weak** | Aligno is genuinely comparable. Quick names Ziflow. Full deep-dives only Aligno, while its executive narrative uses DocuSign and Dropbox Sign, which are adjacent general e-signature tools. |
| Is pricing verified? | **Partial / fail** | ApproveWell’s $29 Agency price is verified on its official pricing page. The Blink-derived `$29-$79 Starter` metric is inaccurate; Blink lists Starter at $79 and Agency at $299. |
| Is the negative evidence meaningful? | **No** | The lone disconfirming item is a directory ranking DocuSign, Dropbox Sign, and Adobe Sign. It does not challenge a precise proposition about the submitted product. |
| Is Full Validation worth substantially more than Quick Scan? | **Not yet** | It is materially larger, but not proportionally stronger in primary, buyer, pricing, competitive, contradiction, or recommendation evidence. |
| Are the next experiments executable? | **Mostly yes** | The three experiments include target participants, sample sizes, durations, methods, success/failure thresholds, recruitment, and decisions unlocked. Some generated hypotheses are awkward, but the procedures are executable. |
| Would a founder trust the verdict? | **No** | Confidence is overstated, one pricing metric is wrong, the negative evidence is not meaningful, and the final recommendation is incomplete. |
| More decision value than generic Gemini research? | **Not proven** | Traceability, deterministic scoring, charts, and exports add clear structural value. The underlying authority and judgment are not yet reliably better than a careful Gemini research response. |

## Evidence-quality review

### What passed

- Both reports persisted the exact same canonical product proposition.
- The independent semantic gate found no accepted CI/CD, DevOps, deployment-automation, or YAML drift.
- Full Validation retrieved relevant client-approval sources and included a genuinely comparable product, Aligno.
- ApproveWell pricing was traced to its official pricing page.
- Customer-facing willingness-to-pay remained at the unsupported baseline of 10 and explicitly stated that competitor list price is not buyer payment evidence.
- Six Full specialist outputs persisted evidence IDs, opposing IDs, relevant brief dimensions, unresolved gaps, and low confidence.
- Five sampled Full claims mapped to persisted evidence and source URLs.

### What failed

- Full evidence depth was 11 versus Quick’s 4, below the required 3x threshold.
- Full had only one Tier 1 item; its own gate requires at least two and more than Quick.
- No proposition-specific contradiction record exists.
- “High” Full confidence conflicts with only 6/11 required evidence families, one Tier 1 item, no buyer-payment evidence, and no real contradiction.
- The `73% / 89%` scope-dispute statistic is presented by an Agency OS marketing article without visible survey methodology or an attributable primary study.
- Compliance claims are drawn from ApprovalWhisper’s own product marketing, not an independent standard, regulator, auditor, or customer dataset.
- Specialist key findings contain raw `SOURCE_ID` tokens, which are not useful customer citations.
- Some specialist claims cite source IDs not represented in the desk’s accepted evidence list.
- The Full executive summary uses DocuSign and Dropbox Sign as competitive anchors despite the research brief’s explicit exclusion of general e-signature products.
- The Blink pricing range is misreported.

## Recommendations review

The three validation experiments are the strongest founder-action component. They are scoped and measurable:

1. Eight problem-frequency interviews over seven days.
2. A three-team concierge workflow pilot over 14 days.
3. Five paid offers over 10 days with a two-commitment threshold.

The final recommendations are not complete actions:

- Quick Scan: `Reduction in revision cycles`.
- Quick UI repeats the same phrase as both `Next action` and `Prove before scaling`.
- Full first-customer strategy: `Collect feedback on UI Refine audit trail export Measure time-to-approval reduction`.

A reveal-ready recommendation must name the founder action, owner, target segment, channel, artifact/offer, timing, success threshold, failure threshold, and decision unlocked. The experiment objects largely do this; the prominent final recommendation does not.

## Charts and exports

### Export proof

Both reports produced and independently downloaded:

- PDF
- Markdown
- CSV
- JSON

All eight downloaded files opened and matched their persisted SHA-256 checksum. JSON matched the latest immutable payload; every format contained the stored score and verdict. This is a **content-integrity pass**.

### Chart proof

- Quick: 4 persisted chart datasets.
- Full: 7 persisted chart datasets.
- Stored `source_data` and `supporting_evidence_ids` matched the report payload.
- Factor charts use the persisted deterministic factors.
- Evidence-balance and source-quality charts use persisted evidence rows.
- Full pricing chart links to the persisted pricing evidence.

This is a **provenance pass**, but the charts faithfully visualize some weak evidence. Provenance does not make an inaccurate source interpretation accurate.

### Visual export defects

- Quick PDF: 14 pages; polished cover and appendix.
- Full PDF: 21 pages; polished cover, scorecard, and appendix.
- Full PDF page 3 visibly clips/overflows the `Buyer Reachability` score row at a card boundary.
- Full PDF page 4 visibly clips/overflows content between `Jobs to be done` and `Problem severity and frequency`.
- Poppler also reported missing display fonts for `Symbol` and `ArialUnicode`, although the inspected pages remained legible.

## Browser proof

### Passed

- Browser harness built an optimized Next.js production build.
- `/api/health/release` returned:
  - `mode: production`
  - `buildId: reveal-20260726063400-90e60f9f`
- Chromium ran on isolated port `4317`.
- Quick Scan was submitted through the authenticated form, showed persisted research activity, completed, rendered its result, displayed four charts and four export controls, and downloaded an export.
- Full Validation was submitted through the authenticated form and progressed to a persisted `Completed` run with eight completed jobs.

### Failed

- Full Validation navigation to `/research/6d0e168a-e6a3-47df-9f53-c206df3ff05a/results` rendered a 404.
- Server log: `report_access_denied`, reason `report_not_found_after_consistency_barrier`.
- The report row and immutable version existed in PostgreSQL, so this is an application consistency/read-path failure, not absence of generation.
- Browser suite result: **1 passed, 1 failed**.
- `npm run release:check` stopped at `test:browser`; the final chained `npm run build` did not run.

Therefore, real browser submission is proven, but real browser usability is proven only for Quick Scan.

## Security proof

### Passed locally

- Secret scan: no hard-coded or browser-exposed credentials.
- Tenant owner reads allowed; cross-tenant reads and writes denied.
- 13-table tenant matrix passed.
- Private export storage isolation passed.
- `user-assets` owner-path read/upload/update/delete isolation passed.
- Customer research RPC authorization passed.
- Realtime owner received the event; cross-tenant subscriber received zero.
- 13 internal tables remained service-role only.
- Anonymous and authenticated CRUD against internal caches was denied.
- Security headers present: CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict referrer policy, permissions policy, COOP, and CORP.
- Registration rate limit returned `400, 400, 400, 400, 400, 429`.
- Worker and scheduler rejected unauthenticated requests.

### Not proven

- The local production-proof profile intentionally included CSP `unsafe-eval` and did not emit HSTS.
- The deployed-production branch of CSP/HSTS configuration was not exercised on a real HTTPS deployment.
- No independent penetration test or managed edge-rate-limit proof was supplied.

Local high-priority tenant/security controls pass. Deployed production security remains a beta gate.

## Operational proof

### Isolated smoke tests

- Worker namespace: `068f263c-bc48-494d-a8d5-a0c4701ced15`
  - Claimed only its own `plan` job.
  - One attempt.
  - Completed.
  - Unauthenticated call rejected.
- Scheduler namespace: `c3261546-8b75-424a-bb9d-318edc3a4c34`
  - Observed only its own pending job.
  - Triggered its worker.
  - Worker completed its own job.
  - Unauthenticated call rejected.
- Both smoke namespaces were removed after the tests.

### Queue state after audit

- `completed`: 16 jobs.
- `pending` or `claimed`: 0.
- Smoke runs remaining: 0.
- Customer runs remaining: exactly the two fresh audited runs.
- Operational health: queue depth 0, stuck runs 0, failed runs 0, provider alerts 0, open alerts 0.

Queue isolation and cleanup are a **pass**. The Full report read-path failure remains an operational reliability blocker.

## Release gates

| Gate | Result |
|---|---|
| TypeScript | Pass |
| ESLint, zero warnings | Pass |
| Product text / UTF-8 audit | Pass |
| Secret scan | Pass |
| Unit tests | Pass — 52/52 |
| Deno checks | Pass |
| Clean local database reset and migrations | Pass |
| RLS/storage/Realtime/internal-table audit | Pass |
| Isolated worker smoke | Pass |
| Isolated scheduler smoke | Pass |
| Production build identity | Pass |
| Real browser Quick Scan | Pass |
| Real browser Full Validation | **Fail — completed report rendered 404** |
| Independent semantic-quality gate | **Fail — 5 checks failed** |
| Final chained build in `release:check` | Not reached |
| Overall release gate | **FAIL** |

Semantic gate failures:

1. Full evidence depth.
2. Full authority depth.
3. Proposition-specific contradiction.
4. Two official pricing evidence items.
5. Confidence reflecting evidence quality.

## Remaining blockers

### Critical

1. Fix and prove the Full Validation report read path so a completed paid report never returns 404.
2. Make the full `release:check` pass in one uninterrupted run.
3. Correct the Blink pricing metric and add a claim/source consistency check for numeric ranges.
4. Require Full Validation to meet its own evidence and authority depth thresholds before publication.
5. Create real proposition-specific contradiction analysis or explicitly report that none was found without treating adjacent directories as negative evidence.
6. Cap evidence confidence when primary evidence, required families, contradictions, or buyer/payment evidence are missing.
7. Replace raw outcome labels and fragments with complete founder actions.

### High

1. Keep general e-signature products out of the direct-competitor conclusion unless comparability is explicitly justified.
2. Require primary methodology for high-impact survey statistics.
3. Replace raw specialist `SOURCE_ID` text with resolvable evidence citations.
4. Fix Full PDF card pagination and overflow.
5. Exercise the deployed HTTPS CSP/HSTS configuration and repeat the tenant matrix against the release environment.

## Readiness

| Stage | Verdict | Conditions |
|---|---|---|
| Reveal readiness | **No** | Browser Full Validation, semantic gate, source authority, confidence, recommendation, and release gate fail. |
| Private-demo readiness | **Conditional yes** | Use only a pre-reviewed Quick Scan, avoid promising live Full Validation, preflight the isolated production build, and disclose that results are evidence-supported hypotheses. |
| Private-beta readiness | **No** | Requires reliable Full report access, passing release and semantic gates, corrected pricing, stronger authority/negative evidence, complete founder actions, and deployed security proof. |
| Public-beta readiness | **No** | Requires all private-beta gates plus production monitoring/incident ownership, deployed HTTPS/header proof, backup/restore rehearsal, and independent security review. |

## Final decision

**Do not reveal ShouldBuild publicly.**

The product has crossed from “promising prototype” to “credible private-demo system,” but it has not crossed the final trust boundary. The remaining failures affect the paid report path and the truthfulness of the decision product, not merely polish. Fix those, then rerun the same two real browser journeys and require the complete release and semantic gates to pass without exceptions.
