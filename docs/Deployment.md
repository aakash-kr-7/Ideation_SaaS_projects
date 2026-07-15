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
1. Deploy the background worker to Supabase:
   ```bash
   supabase functions deploy research-worker --no-verify-jwt
   ```
2. Configure the same dedicated `WEBHOOK_SECRET` in the Next.js server and Edge Function. The authenticated start route and Server Action directly POST to `functions/v1/research-worker`; do not add a database webhook, which would dispatch each run twice.
3. Set Tavily, Firecrawl, Groq, Cerebras, and Cohere provider keys as described in [Secrets.md](Secrets.md).

## Updating Types
If you modify your migrations, run the following command to update TypeScript types in the Next.js app:
```bash
supabase gen types typescript --linked > lib/types.ts
```
