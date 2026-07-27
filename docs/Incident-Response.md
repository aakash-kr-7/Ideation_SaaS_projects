# Incident Response

Checklists, ownership, and customer communication templates for production incidents.

## Incident Checklist

1. **Acknowledge**: Note the time, symptoms, and affected scope (all users / single user / single run).
2. **Classify severity**:
   - **P0**: Service is down, no users can access the application.
   - **P1**: Core feature broken — research runs fail, reports inaccessible, auth broken.
   - **P2**: Degraded experience — slow research, partial failures, UI bugs.
   - **P3**: Minor issue — cosmetic, documentation, non-blocking.
3. **Contain**: If the issue is caused by a recent deployment, roll back immediately (see Rollback below).
4. **Investigate**: Check logs (Vercel, Supabase Edge Functions, `error_logs` table, `operational_alerts` table).
5. **Fix**: Apply the fix, verify in staging if possible, deploy.
6. **Verify**: Confirm the fix resolves the issue. Run `npm run ops:health`.
7. **Communicate**: Notify affected users if applicable (see templates below).
8. **Post-mortem**: Document what happened, root cause, timeline, and prevention measures.

## Rollback Checklist

### Web Application (Vercel)
1. Open Vercel dashboard → Deployments.
2. Find the last known-good deployment.
3. Click "Promote to Production" on that deployment.
4. Verify `/api/health` returns the expected build identity.

### Edge Functions
```bash
# Revert to a known-good commit
git checkout <known-good-commit> -- supabase/functions/
supabase functions deploy research-worker --no-verify-jwt
supabase functions deploy research-scheduler --no-verify-jwt
```

### Database
Database changes are **forward-only**. If a migration causes issues:
1. Write a new corrective migration.
2. Apply it: `supabase db push`.
3. If the situation is unrecoverable, restore from backup (see `docs/Backup-Recovery.md`).

**Never manually edit production database rows** unless following the documented credit restoration path.

## Escalation Tiers

| Tier | Condition | Owner | Response Time |
|---|---|---|---|
| 1 | Automated alert fires | Primary on-call (TBD) | < 15 minutes |
| 2 | User-reported issue | Primary on-call (TBD) | < 1 hour |
| 3 | Data integrity concern | Primary + Secondary (TBD) | < 30 minutes |
| 4 | Security incident | All team + security contact (TBD) | Immediate |

## Credit Restoration

If a research run fails after credit reservation:

1. The `fail_queued_research_dispatch` RPC automatically restores reserved credits.
2. The `finalize_research_credit` RPC with action `'restore'` handles manual cases.
3. **Both paths are idempotent** — calling them multiple times is safe.
4. Verify restoration: check `credit_reservations` table for `status = 'restored'`.

**Never directly update `team_credit_accounts`**. Always use the idempotent RPC path.

## Customer Communication Templates

### Service Disruption (P0/P1)

> **Subject**: ShouldBuild service disruption — [date]
>
> We're experiencing an issue affecting [describe scope]. Our team is actively working on a fix.
>
> Your data and reports are safe. Any research credits reserved during this period will be automatically restored if your run was interrupted.
>
> We'll update you when the issue is resolved. We apologize for the inconvenience.

### Issue Resolved

> **Subject**: ShouldBuild service restored — [date]
>
> The issue affecting [describe scope] has been resolved as of [time]. All services are operating normally.
>
> If you experienced an interrupted research run, your credits have been restored automatically. You can start a new run at any time.

### Individual Run Failure

> **Subject**: Your research run encountered an issue
>
> Your [Quick Scan / Full Validation] for "[idea name]" was unable to complete. Your reserved credit has been restored to your account.
>
> You can submit a new run at any time. If this issue persists, please contact us at support.shouldbuild@gmail.com.

## Security Incident Response

1. **Immediately rotate** any compromised credentials (see `docs/Backup-Recovery.md` → Secret Rotation).
2. **Revoke** any active sessions if auth credentials are compromised.
3. **Audit** access logs for unauthorized activity.
4. **Notify** affected users if their data may have been exposed.
5. **Document** the incident timeline and remediation steps.

## Ownership

> **Placeholder**: Assign named ownership before production launch.
>
> - **Primary on-call**: TBD
> - **Secondary on-call**: TBD
> - **Security contact**: TBD
> - **Customer communication owner**: TBD
