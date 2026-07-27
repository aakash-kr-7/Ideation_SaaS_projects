# Authentication Setup

ShouldBuild uses Supabase Auth with PKCE for flow security. This document details local development and production deployment settings for Google OAuth and email/password authentication.

## Local Google OAuth

1. Create a Google OAuth 2.0 Web application client in Google Cloud Console.
2. Add `http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI.
3. Set credentials in the root `.env` file (for local Supabase CLI):
   ```env
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=your-google-client-id
   SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=your-google-client-secret
   ```
4. Restart local Supabase: `npx supabase stop && npx supabase start`.
5. Verify status: `curl http://127.0.0.1:54321/auth/v1/settings`.

The root `.env` is read by the local Supabase CLI containers. Do not put Google OAuth secrets in `.env.local`.

## Hosted Production Configuration

### 1. Google Cloud Console
- **Authorized JavaScript origins**:
  - `https://shouldbuild.app` (or your production domain)
  - `https://<PROJECT_REF>.supabase.co`
- **Authorized redirect URIs**:
  - `https://<PROJECT_REF>.supabase.co/auth/v1/callback`

### 2. Supabase Dashboard (Auth → URL Configuration)
- **Site URL**: `https://shouldbuild.app`
- **Redirect URLs**:
  - `https://shouldbuild.app/api/auth/callback`
  - `https://shouldbuild.app/*`
  - `https://*.shouldbuild.app/api/auth/callback` (if using staging/preview subdomains)

### 3. Supabase Dashboard (Auth → Providers → Google)
- Enable Google provider.
- Set Client ID and Client Secret from Google Cloud Console.

### 4. Supabase Dashboard (Auth → Security & Email)
- **Minimum password length**: 8 characters (or higher)
- **Enable email confirmations**: `true`
- **Double confirm password changes**: `true`
- **Configure Custom SMTP**: Configure Resend, SendGrid, or AWS SES for reliable transactional email delivery (verification & password resets).

### 5. Application Host (Vercel)
- `NEXT_PUBLIC_SUPABASE_URL=https://<PROJECT_REF>.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY>`
- `NEXT_PUBLIC_SITE_URL=https://shouldbuild.app`
- `SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY>` (server-only)

## Verification Script

Verify all auth flows programmatically against the active environment:

```bash
npm run verify:auth
```

This verifies user creation, idempotent team/credit bootstrapping, password sign-in, session state, password reset, sign-out, duplicate prevention, and wrong password rejection.
