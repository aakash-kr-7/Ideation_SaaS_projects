# Secrets & Environment Variables

## Next.js Client & Server
Copy `.env.example` to `.env.local` and provide:

```env
NEXT_PUBLIC_SUPABASE_URL=https://[your-project-ref].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=[your-anon-key]
```

## Supabase Edge Functions
Edge Functions require secrets to be securely stored on the Supabase project, separate from Next.js env vars.

Run the following command to set secrets for your Edge Functions:
```bash
supabase secrets set SUPABASE_URL=https://[your-project-ref].supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=[your-service-role-key]
```

These secrets allow the Edge Function to bypass Row Level Security when updating the progress of a `research_run` on behalf of the background worker.
