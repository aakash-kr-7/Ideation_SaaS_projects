# Authentication setup and verification

SignalFit uses Supabase Auth with PKCE. Every Google entry point returns to
`/api/auth/callback`; the server exchanges the code, middleware checks the
profile, and a first-time user is sent through onboarding before the dashboard.

## Local Google OAuth

1. In Google Cloud Console, create or open an **OAuth 2.0 Client ID** of type
   **Web application**.
2. Add this exact **Authorized redirect URI**:

   ```text
   http://127.0.0.1:54321/auth/v1/callback
   ```

3. Copy `.env.example` to `.env` and set the Google Web Client ID and Client
   Secret. `.env` is ignored by Git and is loaded by the Supabase CLI.
4. Restart local Supabase so `supabase/config.toml` is reapplied:

   ```powershell
   npx.cmd supabase stop
   npx.cmd supabase start
   ```

5. Confirm the running provider is enabled:

   ```powershell
   (Invoke-RestMethod http://127.0.0.1:54321/auth/v1/settings).external.google
   ```

   The result must be `True`.

6. Start the app at `http://localhost:3000`, use a Google identity that has
   never signed in to this local project, complete onboarding, and confirm the
   dashboard loads.

Do not put Google credentials in `.env.local`: that file configures Next.js,
while the local Supabase CLI reads the root `.env` for provider secrets.

## Hosted Supabase and production

1. In **Supabase Dashboard → Authentication → Providers → Google**, enable
   Google and enter the same Google Web Client ID and Client Secret.
2. Copy the hosted Supabase callback URL shown there and add it in Google Cloud
   as an Authorized redirect URI. It normally has this form:

   ```text
   https://PROJECT_REF.supabase.co/auth/v1/callback
   ```

3. In **Supabase Dashboard → Authentication → URL Configuration**:

   - Set **Site URL** to the canonical HTTPS production origin.
   - Add `https://YOUR_DOMAIN/api/auth/callback**` to Redirect URLs.
   - Add the equivalent preview URL only if preview deployments must support
     real sign-in.

4. Set these application environment variables in the deployment platform:

   ```text
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   SUPABASE_SERVICE_ROLE_KEY
   NEXT_PUBLIC_SITE_URL
   ```

5. Apply database migrations, including
   `20260716040000_auth_onboarding_bootstrap.sql`, before testing a new user.
6. Test sign-in, first-time onboarding, dashboard access, refresh persistence,
   sign-out, and a second sign-in. Test with a brand-new Google identity or
   remove the prior test identity from Supabase Auth first.

No Google API key or webhook is used for login. The only Google-specific inputs
are the OAuth Web Client ID and Client Secret. Research-provider API keys and
the worker bearer secret are separate from authentication.
