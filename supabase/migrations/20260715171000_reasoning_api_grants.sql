-- New relations/columns are already protected by RLS and Supabase's standard
-- API grants. Refresh PostgREST so the deployed worker can address them.
notify pgrst, 'reload schema';
