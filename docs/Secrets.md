# Secrets and environment variables

Never commit credentials. `.env`, `.env.local`, and `supabase/functions/research-worker/.env` are ignored. Rotate anything ever exposed in a commit, log, screenshot, ticket, or chat.

## Next.js

```env
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=public-anon-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
WEBHOOK_SECRET=long-random-dedicated-worker-secret
```

Only `NEXT_PUBLIC_` values are browser-visible. `WEBHOOK_SECRET` is server-only. Next.js does not need the service-role key.

## Supabase worker

```env
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-only-service-role-key
WEBHOOK_SECRET=the-same-dedicated-worker-secret
TAVILY_API_KEY=...
FIRECRAWL_API_KEY=...
GROQ_API_KEY=...
CEREBRAS_API_KEY=...
COHERE_API_KEY=...
```

Optional controls: `RESEARCH_RUN_COST_CAP_USD` (default `1.00`), `RESEARCH_REASONING_COST_RESERVE_USD` (`.36`), `RESEARCH_RETRIEVAL_BUDGET_MS` (`85000`), `CEREBRAS_MODEL` (`gpt-oss-120b`), `REASONING_MAX_COMPLETION_TOKENS` (`2048`), and `REASONING_AGENT_PACING_MS` (`8000`). `FORCE_SPECIALIST_AGENT_FAILURE` is test-only.

## Local Google OAuth

The root `.env`, read by the local Supabase CLI, contains:

```env
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=...
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=...
```

Hosted OAuth credentials belong in Supabase Auth settings.

Billing, email, monitoring, and error-reporting variables are not defined because those integrations do not exist yet. When added, document owner, scope, rotation, and least privilege here without values. Use distinct secrets per environment and rotate all production keys before launch.
