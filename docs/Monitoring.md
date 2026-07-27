# Monitoring

Lean monitoring foundation using existing infrastructure: Vercel logs, Supabase function logs, and PostgreSQL operational tables.

## Log Architecture

### Where logs appear

| Source | Destination | Access |
|---|---|---|
| Next.js server (API routes, server actions) | Vercel Runtime Logs | Vercel dashboard → Logs |
| Next.js `console.log/error` | Vercel Runtime Logs | Same |
| `research-worker` Edge Function | Supabase Edge Function Logs | Supabase dashboard → Edge Functions → Logs |
| `research-scheduler` Edge Function | Supabase Edge Function Logs | Same |
| Database-level alerts | `operational_alerts` table | Query via `collect_research_operational_alerts` RPC |
| Application errors | `error_logs` table | Service-role query |

### Log events

Runtime logs use explicit, structured event payloads in the code paths that need them, while durable research, queue, error, and alert state lives in PostgreSQL. Operators should use a run ID, job ID, request ID, or alert ID to correlate a Vercel/Supabase log line with the associated durable record.

### Security

- Never put secret values, authorization headers, or full customer input into log calls.
- Server errors are returned to customers through the public-error layer, not raw provider or database messages.
- `npm run test:secrets` prevents hard-coded credentials and obvious secret logging patterns from entering the repository.

## Alert Thresholds

| Category | Threshold | Action |
|---|---|---|
| Queue depth | > 10 pending jobs | Investigate scheduler health |
| Stuck runs | Any run in Queued/Running for > 30 minutes | Check worker logs, consider manual recovery |
| Failed runs (24h) | > 3 failed runs | Review error patterns, check Gemini quota |
| High retry rate | > 20% of jobs have attempt_count > 1 | Check provider reliability |
| Worker silence | No completed job in > 15 minutes during active hours | Verify scheduler is running |
| Open alerts | Any unresolved operational alert | Triage and resolve |
| Credit anomaly | Reservation without matching consumption for > 2 hours | Check for stuck run, consider manual finalization |
| Export failures | Completed run with < 4 exports | Re-trigger export generation |

## Monitoring Endpoints

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health` | Public | Application liveness check |
| `GET /api/health/release` | Public | Build identity verification |
| `GET /api/health/worker` | Service-role | Queue depth, stuck runs, last worker activity |
| `GET /api/health/scheduler` | Service-role | Orphaned runs, pending jobs, open alerts |
| `GET /api/health/ops` | Service-role | Full operational dashboard (24h aggregates) |

## Operational Health Script

Run locally or in CI:

```bash
npm run ops:health
```

Reports: queue depth, stuck runs, failure rate, provider degradation, alert state.

## Ownership

> **Placeholder**: Assign named operational ownership before production launch.
>
> - **Primary on-call**: TBD
> - **Secondary on-call**: TBD
> - **Escalation contact**: TBD

## No External Platforms Required

This monitoring foundation uses:
- Vercel's built-in log viewer (included with all plans)
- Supabase's Edge Function log viewer (included with all plans)
- PostgreSQL tables for persistent alerts and error logs

External monitoring platforms (Datadog, Sentry, etc.) can be added later through the existing health endpoints and alert webhooks.
