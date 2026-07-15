# Secrets & Environment Variables

## Next.js Client & Server
Copy `.env.example` to `.env.local` and provide:

```env
NEXT_PUBLIC_SUPABASE_URL=https://[your-project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
SUPABASE_SERVICE_ROLE_KEY=[server-only-service-role-key]
WEBHOOK_SECRET=[dedicated-random-bearer-secret]
```

## Supabase Edge Functions
Edge Functions require secrets to be securely stored on the Supabase project, separate from Next.js env vars.

Run the following command to set secrets for your Edge Functions:
```bash
supabase secrets set SUPABASE_URL=https://[your-project-ref].supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]
supabase secrets set WEBHOOK_SECRET=[same-dedicated-random-secret]
supabase secrets set TAVILY_API_KEY=[key]
supabase secrets set FIRECRAWL_API_KEY=[key]
supabase secrets set GROQ_API_KEY=[key]
supabase secrets set CEREBRAS_API_KEY=[key]
supabase secrets set COHERE_API_KEY=[key]
```

The service-role key lets the worker persist a run on behalf of its owner. `WEBHOOK_SECRET` authenticates direct dispatch from the Next.js server and must never be the service-role key. The production fallback implemented in this repository is Groq -> Cerebras, not OpenRouter. Optional controls include `RESEARCH_RUN_COST_CAP_USD`, `CEREBRAS_MODEL`, `REASONING_MAX_COMPLETION_TOKENS`, and `REASONING_AGENT_PACING_MS`.

Google OAuth credentials are separate Supabase Auth provider settings. The checked-in local configuration leaves Google disabled; enable it and provide the client ID/secret before claiming a Google OAuth user journey has passed.
