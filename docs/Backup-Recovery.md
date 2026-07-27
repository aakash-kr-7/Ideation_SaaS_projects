# Backup and Recovery

Complete backup, restore, rollback, and secret rotation procedures for ShouldBuild.

## Database Backup

### Supabase-managed backups
Supabase Pro and Team plans include automatic daily backups with point-in-time recovery (PITR). These are managed by Supabase and require no manual setup.

### Manual backup
For explicit backup before major changes:

```bash
# Dump schema and data (requires Supabase CLI linked to the project)
supabase db dump --linked -f backup-$(date +%Y%m%d-%H%M%S).sql

# Schema only
supabase db dump --linked --schema-only -f schema-$(date +%Y%m%d-%H%M%S).sql

# Data only (for specific tables)
supabase db dump --linked --data-only -f data-$(date +%Y%m%d-%H%M%S).sql
```

### What to back up
- **Database**: All tables, functions, triggers, RLS policies, and seed data.
- **Storage buckets**: `exports` (report PDFs, markdown, CSV, JSON), `cached-sources` (raw source cache), `user-assets` (user uploads).
- **Edge Function secrets**: Document current secrets (names only, never values) so they can be re-set.
- **Vercel environment variables**: Document current variable names.

### Storage bucket inventory
Storage objects cannot be dumped via `supabase db dump`. Back up critical storage:

```bash
# List all objects in a bucket (requires service-role access)
# Use the Supabase dashboard or the storage API to download critical exports.
```

For disaster recovery, report exports can be regenerated from the immutable `report_versions.payload` column, so storage backup is a convenience, not a hard requirement.

## Restore Procedure

### Into a fresh Supabase project

1. Create a new Supabase project.
2. Link: `supabase link --project-ref <NEW_REF>`.
3. Apply the backup:
   ```bash
   psql <DATABASE_URL> < backup-YYYYMMDD-HHMMSS.sql
   ```
4. Re-set Edge Function secrets: `supabase secrets set --env-file supabase/functions/.env.production.example`.
5. Deploy Edge Functions:
   ```bash
   supabase functions deploy research-worker --no-verify-jwt
   supabase functions deploy research-scheduler --no-verify-jwt
   ```
6. Update Vercel environment variables with the new project's URL, anon key, and service role key.
7. Verify with `npm run verify:db` and `npm run ops:health`.

### From Supabase PITR (Pro/Team plans)
1. Open Supabase dashboard → Database → Backups.
2. Select a point-in-time to restore to.
3. Confirm the restore.
4. Note: PITR restores the database but not storage objects.

## Restore Rehearsal

Run a disposable local restore rehearsal:

```bash
node scripts/restore-rehearsal.mjs
```

This script:
1. Dumps the current local database.
2. Drops and recreates it.
3. Restores from the dump.
4. Verifies row counts for key tables.
5. Verifies one owner can read their report.
6. Verifies no queued job is auto-executed.
7. Records results to the ignored local `artifacts/restore-rehearsal/` directory. Copy any result needed for audit retention to an approved evidence store.

## Migration Rollback Strategy

**Migrations are forward-only.** Supabase migrations are append-only SQL files. There is no automatic rollback mechanism.

If a migration causes issues:
1. **Write a corrective migration** that undoes the problematic change.
2. Apply it: `supabase db push`.
3. If the situation is unrecoverable, restore from backup (see above).

**Never delete or modify applied migration files.** This breaks the migration history.

## Rollback — Application

### Web Application (Vercel)
1. Open Vercel dashboard → Deployments.
2. Find the last known-good deployment.
3. Click "Promote to Production".
4. Verify `/api/health` and `/api/health/release`.

### Edge Functions
```bash
git checkout <known-good-commit> -- supabase/functions/
supabase functions deploy research-worker --no-verify-jwt
supabase functions deploy research-scheduler --no-verify-jwt
```

### Combined Rollback
If both the application and database need rollback:
1. Roll back Vercel first (fastest, lowest risk).
2. Apply a corrective database migration if needed.
3. Roll back Edge Functions if needed.
4. Verify all health endpoints.

## Secret Rotation

### When to rotate
- Any credential discovered in source control, logs, or client output.
- Any credential shared with a person who no longer needs access.
- Regularly (recommended: every 90 days for production).

### Rotation checklist

| Secret | Where to rotate | What to update |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase dashboard → Settings → API | Vercel env, Edge Function secrets, `.env.local` |
| `SUPABASE_ANON_KEY` | Supabase dashboard → Settings → API | Vercel env, `.env.local` |
| `GEMINI_API_KEY` | Google AI Studio | Edge Function secrets via `supabase secrets set` |
| `WEBHOOK_SECRET` | Generate new UUID | Vercel env, Edge Function secrets |
| Google OAuth client secret | Google Cloud Console | Supabase dashboard → Authentication → Providers |
| `DODO_API_KEY` (future) | Dodo dashboard | Vercel env |
| `DODO_WEBHOOK_SECRET` (future) | Dodo dashboard | Vercel env |

### Post-rotation verification
```bash
npm run smoke:worker
npm run smoke:scheduler
npm run verify:auth
npm run ops:health
```

## Compromised-Key Response

1. **Immediately rotate** the compromised credential (see table above).
2. **Check for unauthorized activity** in Vercel logs and Supabase logs.
3. **Revoke any active sessions** if auth credentials are compromised:
   ```sql
   -- In Supabase SQL Editor
   delete from auth.sessions where user_id = '<affected_user_id>';
   ```
4. **Review** `error_logs` and `operational_alerts` for suspicious patterns.
5. **Notify** affected users if their data may have been accessed.
6. **Document** the incident (see `docs/Incident-Response.md`).
