# Environment Variables

Every required variable, its scope, and where it belongs.

## Variable Matrix

| Variable | Scope | Required | Where Set | Purpose |
|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + Server | Yes | `.env.local` / Vercel | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + Server | Yes | `.env.local` / Vercel | Supabase anonymous key |
| `NEXT_PUBLIC_SITE_URL` | Browser + Server | Yes | `.env.local` / Vercel | Canonical URL for redirects, metadata, sitemap |
| `SUPABASE_URL` | Server-only / Edge Function-only | Local scripts and Edge Functions | ignored root `.env` / Supabase secrets | Server URL; Edge Functions receive it from Supabase |
| `SUPABASE_ANON_KEY` | Deployment-only | Optional | ignored root `.env` | Local tooling only; the web app uses `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Yes | `.env.local` / Vercel | Privileged queue/admin operations |
| `WEBHOOK_SECRET` | Server-only | Recommended | `.env.local` / Vercel | Worker dispatch auth; defaults to service role key |
| `SHOULDBUILD_DEPLOYMENT_ENV` | Server-only | Production | Vercel | `"production"`, `"staging"`, or omit for local |
| `GEMINI_API_KEY` | Edge Function-only | Yes (worker) | `supabase secrets set` | Gemini API for research pipeline |
| `RESEARCH_ENGINE` | Edge Function-only | No | `supabase secrets set` | Research engine variant (default: `gemini_hybrid`) |
| `GEMINI_RESEARCH_MODEL` | Edge Function-only | No | `supabase secrets set` | Research model (default: `gemini-2.5-flash`) |
| `GEMINI_SYNTHESIS_MODEL` | Edge Function-only | No | `supabase secrets set` | Synthesis model (default: `gemini-3.1-flash-lite`) |
| `GEMINI_LIGHT_MODEL` | Edge Function-only | No | `supabase secrets set` | Light model (default: `gemini-2.5-flash-lite`) |
| `GEMINI_GROUNDING_MODE` | Edge Function-only | No | `supabase secrets set` | `enabled` or `disabled` |
| `GEMINI_MAX_CONCURRENCY` | Edge Function-only | No | `supabase secrets set` | Max concurrent Gemini calls |
| `GEMINI_MAX_RETRIES` | Edge Function-only | No | `supabase secrets set` | Max Gemini retries |
| `GEMINI_REQUEST_TIMEOUT_MS` | Edge Function-only | No | `supabase secrets set` | Gemini request timeout |
| `RESEARCH_RUN_COST_CAP_USD` | Edge Function-only | No | `supabase secrets set` | Override per-run cost cap (can only lower) |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID` | CLI-only | Local OAuth | `.env` (root) | Google OAuth client ID for local Supabase |
| `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET` | CLI-only | Local OAuth | `.env` (root) | Google OAuth client secret for local Supabase |
| `PAYMENTS_PROVIDER` | Server-only | Future / optional | deployment platform | Reserved provider selector; no payment code reads it today |
| `DODO_API_KEY` | Server-only | Future / optional | deployment platform | Reserved Dodo credential; do not set until payment implementation is approved |
| `DODO_WEBHOOK_SECRET` | Server-only | Future / optional | deployment platform | Reserved webhook-verification secret |
| `DODO_ENVIRONMENT` | Server-only | Future / optional | deployment platform | Reserved `live` or `test` selector |

## Security Rules

1. **GEMINI_API_KEY, SUPABASE_SERVICE_ROLE_KEY, WEBHOOK_SECRET, and all payment secrets must NEVER have a `NEXT_PUBLIC_` prefix.** `npm run test:secrets` is the repository gate for accidental browser exposure or hard-coded credentials.

2. **Root `.env` is for the Supabase CLI only.** It configures the local Supabase instance (Google OAuth, service role for local containers). Do not put Next.js runtime variables here.

3. **`.env.local` is for the Next.js dev server.** It holds browser-safe and server-only variables. It is gitignored.

4. **Edge Function secrets** are set separately via `supabase secrets set`. They are not read from `.env.local`.

5. **Never log secret values.** The `check-secret-leaks` script scans for console statements that reference secret variable names.

6. **Rotate immediately** any credential discovered in source control, shared logs, or client output.

## File Layout

```
.env                           # Root — Supabase CLI only (gitignored)
.env.local                     # Next.js dev server (gitignored)
.env.example                   # Template with all variables (committed)
.env.production.example        # Production Vercel template (committed)
.env.staging.example           # Staging template (committed)
supabase/functions/.env.local  # Edge Function local secrets (gitignored)
supabase/functions/.env.production.example  # Edge Function production template (committed)
```

## Environment Profiles

### Local Development
- `SHOULDBUILD_DEPLOYMENT_ENV` is unset or empty
- CSP includes `unsafe-eval` for HMR
- No HSTS
- `connect-src` allows `http://127.0.0.1:*`
- Local Supabase at `http://127.0.0.1:54321`

### Staging
- `SHOULDBUILD_DEPLOYMENT_ENV=staging`
- CSP excludes `unsafe-eval`
- No HSTS (allows domain changes)
- Separate Supabase project
- Reserved payment credentials remain unset

### Production
- `SHOULDBUILD_DEPLOYMENT_ENV=production`
- CSP excludes `unsafe-eval`
- HSTS with 1-year max-age
- `upgrade-insecure-requests`
- Production Supabase project
- Reserved payment credentials remain unset
