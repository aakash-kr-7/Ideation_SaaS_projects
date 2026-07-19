-- Planned and gap queries use this key for durable idempotency.
create unique index if not exists idx_research_queries_run_pass_query
  on public.research_queries (run_id, pass_number, query);
create unique index if not exists idx_sources_run_url
  on public.sources (run_id, url);
notify pgrst, 'reload schema';
