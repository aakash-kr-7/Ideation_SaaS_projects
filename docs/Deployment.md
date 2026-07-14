# Deployment Guide

## Prerequisites
- Supabase CLI installed
- Docker Desktop running (required for local Edge Functions and Supabase local development)

## Deploying Database Migrations
1. Link your Supabase project (if not already linked):
   ```bash
   supabase link --project-ref your-project-ref
   ```
2. Push your migrations to the production database:
   ```bash
   supabase db push
   ```
   *Note: If you run into timeouts due to connection poolers on IPv4, ensure your network supports IPv6 or use the direct connection string via `--db-url`.*

## Deploying Edge Functions
1. Deploy the background worker stub to Supabase:
   ```bash
   supabase functions deploy research-worker --no-verify-jwt
   ```
2. Configure Webhooks in the Supabase Dashboard:
   - Go to **Database** -> **Webhooks**.
   - Create a new Webhook on the `research_runs` table for `INSERT` events.
   - Point the Webhook URL to the Edge Function endpoint (e.g. `https://your-project-ref.supabase.co/functions/v1/research-worker`).

## Updating Types
If you modify your migrations, run the following command to update TypeScript types in the Next.js app:
```bash
supabase gen types typescript --linked > lib/types.ts
```
