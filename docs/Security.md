# Security review

Last reviewed: 2026-07-17. This is an engineering review, not an independent penetration test or compliance certification.

## Existing controls

- Supabase PKCE auth and server-side user checks on sensitive writes.
- RLS on public tables and a private report-export bucket.
- Dedicated worker secret separate from service role.
- Worker state claim, Zod input/provider validation, citation integrity checks, cost cap, and usage/error records.
- Real environment files are ignored and were not found in Git tracking.

## Open findings

### High — no server-side plan or quota enforcement

Any authenticated user can start Fast or Deep research regardless of advertised plan. Billing and `feature_limits` are unused. Implement webhook-backed entitlements and atomically reserve quota with run creation in every start path.

### High — `user-assets` upload is not owner-scoped

The public bucket allows authenticated inserts without constraining paths to a user. Before uploads, enforce owner paths, MIME/size limits, safe overwrite/deletion, and moderation; consider private signed delivery.

### High — launch authorization verification is incomplete

There is no repeatable CI matrix across every table, RPC, route, Server Action, Realtime subscription, and Storage path. Add two-tenant anonymous/authenticated tests plus an independent penetration test.

### Medium — missing rate limits and abuse controls

Add per-IP/user limits, request-size limits, idempotency, auth CAPTCHA/settings, bot controls, account/team spend ceilings, and alerts for expensive operations.

### Medium — wildcard worker CORS

Browsers should not call the worker. Remove CORS or restrict trusted origins; retain secret validation before body processing and use timing-safe comparison where available.

### Medium — inconsistent API auth and validation

Middleware allows `/api/*`; some handlers authenticate explicitly while others rely on RLS. Require a shared auth helper for private endpoints. Add maximum input/body sizes, safe error envelopes, request IDs, redaction, and retention rules.

### Medium — missing dependency/CI security gates

ESLint, dependency auditing, secret scanning, static analysis, and automated updates are absent. An npm audit was not completed because external registry access would export dependency metadata and was not approved. Add approved scans and resolve the Supabase Edge warning.

### Medium — incomplete account/data lifecycle

Add user export/deletion, billing cancellation, team lifecycle, retention, backups/restore drill, incident response, privacy/terms, and security/support contacts.

### Low — no explicit browser security headers

Add and test CSP, HSTS, frame, referrer, permissions, MIME-sniffing, and cross-origin policies. Begin CSP in report-only mode and account for Supabase, OAuth, fonts, images, and downloads.

## Pre-launch gate

- Resolve all High findings.
- Threat-model auth, billing, worker dispatch, reports, exports, and uploads.
- Pass two-tenant RLS/API/Realtime/Storage tests.
- Complete approved dependency, secret, static-analysis, and penetration tests.
- Test payment signatures, replay, event ordering, and idempotency.
- Configure rate limits, budgets, alerts, backups, retention, and incident response.

Track acceptance in [../REMAINING_WORK.md](../REMAINING_WORK.md).
