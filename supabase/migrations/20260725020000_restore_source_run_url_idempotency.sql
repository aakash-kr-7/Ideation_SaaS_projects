-- Forward-only repair: the canonical Gemini normalizer upserts sources by
-- (run_id, url). A previous canonical-state migration removed that unique index.
create unique index if not exists idx_sources_run_url
  on public.sources (run_id, url);

notify pgrst, 'reload schema';
