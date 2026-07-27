# ShouldBuild reveal operations

## Release owner checklist

1. Name one incident owner and one backup before the reveal.
2. Run `npm run release:check` against a clean local Supabase reset.
3. Run `npm run release:live` with live Gemini credentials. Copy the resulting run IDs, screenshots, traces, audit bundles, and checksums to the release ticket or approved evidence store; `artifacts/` is local, generated, and not committed.
4. Run `npm run ops:health`. Resolve critical failed-run or stuck-run alerts before release. Record acknowledged provider degradation.
5. Confirm queue depth, last-24-hour provider cost, available Gemini quota, scheduler response, and workspace credit limits.
6. Confirm the rollback build and database backup identifiers.

## Alerts and triage

The scheduler persists failed-run, 15-minute stuck-run, Gemini quota/degraded-provider, and high queue-depth alerts in `operational_alerts`. `npm run ops:health` also prints queue depth and 24-hour provider calls, tokens, and cost. A critical open alert exits with status 2.

- Failed run: inspect the run-safe error log, job attempts, and provider metrics. Never paste provider payloads or secrets into customer-visible fields.
- Stuck run: verify scheduler health, recover the run-scoped stale claim, and invoke the worker for that run only.
- Provider degradation: verify Gemini quota and the configured external retrieval provider. Reports may finish only if their persisted confidence accurately reflects degraded grounding.
- Queue depth: stop new reveal submissions if the backlog continues increasing and identify the oldest visible job.

## Backup

Before a release, use the managed database backup or `supabase db dump --linked` for schema and data, and separately inventory the private `exports` and `user-assets` buckets. Encrypt backups, restrict them to the incident owner, and record database timestamp, storage inventory timestamp, project reference, and checksum. Do not put dumps in the repository.

## Restore rehearsal

At least once before reveal, restore the latest backup into a non-production Supabase project. Verify row counts for teams, projects, runs, evidence, reports, exports, credit reservations, and ledger entries. Verify one owner can read their restored report, a second team cannot, export checksums match, and no queued job is automatically executed. Record the rehearsal date and backup identifier.

## Rollback

1. Stop scheduler invocation and research launches.
2. Redeploy the last known-good immutable web and Edge Function artifacts.
3. Roll back only backward-compatible migrations. For destructive schema changes, restore into a new project and switch after validation.
4. Re-run the two-team security matrix and one scoped worker smoke.
5. Re-enable scheduler, then launches; monitor queue depth and failed/stuck alerts for 30 minutes.

## Incident ownership

The incident owner records start time, customer impact, affected run IDs, credit state, provider state, mitigation, and next update time. Restore credits only through the idempotent credit-finalization path. Notify affected customers without exposing prompts, stack traces, API credentials, or other tenants’ identifiers. Close the incident only after queued work is reconciled and a prevention item has an owner.
