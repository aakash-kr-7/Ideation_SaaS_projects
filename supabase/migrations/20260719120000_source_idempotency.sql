create unique index if not exists idx_sources_run_url
  on public.sources (run_id, url);
notify pgrst, 'reload schema';
