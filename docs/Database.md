# Database

Last reconciled with migrations on 2026-07-17.

## Rules

- All schema changes are migration-first in `supabase/migrations/`.
- RLS is mandatory for public tables and private Storage buckets.
- Browser/Next.js access uses user JWTs; only the worker uses service role.
- Test migrations in a disposable or staging project before production.

## Data groups

- Identity/tenancy: users, teams, memberships, preferences, feature limits.
- Research: projects, runs, stages, queries, and passes.
- Findings: opportunities, sources, evidence, competitors, risks, pricing, MVP, and launch records.
- Scoring/reasoning: scores, evidence references, weights, specialists, and integrity gates.
- Reports: reports, immutable versions, and export metadata.
- Operations: usage, errors, audit, jobs, notifications, analytics, and caches.
- Billing foundations: customer and subscription tables. These are not a working billing system.

Tenant ownership normally resolves through run/project/team. `scoring_weights` is global authenticated reference data, not tenant data; re-review its policy before launch.

## Storage

- `exports`: private, tenant-path-scoped report artifacts.
- `cached-sources`: private raw-source cache.
- `user-assets`: public; its current upload policy is not owner-path-scoped. Do not enable user uploads until fixed.

## Workflow

```bash
supabase link --project-ref PROJECT_REF
supabase migration list
supabase db push --dry-run
supabase db push
supabase gen types typescript --linked > lib/database.types.ts
```

Required release checks include fresh/upgrade migrations, auth bootstrap, two-tenant CRUD/Realtime/Storage tests, grants review, immutable-version tests, backups, retention, and a restore drill. See [Security.md](./Security.md).
