# Authentication setup

ShouldBuild uses Supabase Auth with PKCE. Google OAuth, email/password, verification, recovery, onboarding, session refresh, and sign-out have application routes, but hosted behavior still needs full end-to-end verification.

## Local Google OAuth

1. Create a Google OAuth 2.0 Web application client.
2. Add `http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI.
3. Copy `.env.example` to `.env` and set the Google client ID and secret.
4. Restart local Supabase with `npx.cmd supabase stop` and `npx.cmd supabase start`.
5. Confirm `(Invoke-RestMethod http://127.0.0.1:54321/auth/v1/settings).external.google` is `True`.
6. Test with a Google identity that has never used the local project, including onboarding, refresh, sign-out, and sign-in.

The root `.env` is for the local Supabase CLI. Do not put Google credentials in `.env.local`.

## Hosted configuration

1. Enable Google in Supabase Auth and set its credentials.
2. Add the hosted Supabase callback (`https://PROJECT_REF.supabase.co/auth/v1/callback`) in Google Cloud.
3. Set the Supabase Site URL to the canonical HTTPS origin and allow `https://YOUR_DOMAIN/api/auth/callback`.
4. Allow preview origins only when previews intentionally use real authentication.
5. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, and server-only `WEBHOOK_SECRET` on the application host.
6. Apply all migrations before first sign-in.

The Next.js app does not need `SUPABASE_SERVICE_ROLE_KEY`; it belongs only in the worker environment.

## Production tests

- New/existing Google users and email verification.
- Password recovery and password change.
- Onboarding, refresh persistence, expiration, sign-out, and protected redirects.
- Rejection of external redirect targets.
- Disabled/deleted user behavior.

Configure Supabase Auth rate limits, CAPTCHA where appropriate, and production email delivery before launch.
