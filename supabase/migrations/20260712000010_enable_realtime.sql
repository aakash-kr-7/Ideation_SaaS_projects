-- Migration 20260712000010_enable_realtime
-- Add research_runs and research_stages to the supabase_realtime publication to enable Realtime updates.

-- Check if supabase_realtime publication exists, if not, create it.
-- (Usually exists by default in Supabase, but we can do a check or just alter it)
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Add tables to the publication
alter publication supabase_realtime add table public.research_runs;
alter publication supabase_realtime add table public.research_stages;
