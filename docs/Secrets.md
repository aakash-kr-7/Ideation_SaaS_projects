# Secrets

Copy `.env.example` to an ignored local environment file and populate it outside source control. Required application and worker values are:

- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` for browser-safe Supabase access.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` for trusted scripts and Edge Functions.
- `WEBHOOK_SECRET` for application-to-worker dispatch.
- `GEMINI_API_KEY` for the server-only Gemini client.
- `NEXT_PUBLIC_SITE_URL` for redirects and canonical URLs.
- Google OAuth client ID and secret when local Google sign-in is enabled.

`RESEARCH_RUN_COST_CAP_USD` may lower, but never raise, the mode-specific cost cap. Never expose the Gemini key through a browser-public environment variable. Do not log secret values. Rotate any credential discovered in source or shared logs.
