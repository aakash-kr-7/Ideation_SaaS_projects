-- Forward-only repair for Gemini hybrid registry, cache isolation, and usage accounting.

create table if not exists public.source_registry (
  domain text primary key,
  evidence_families text[] not null default '{}',
  industries text[] not null default '{}',
  geographies text[] not null default '{}',
  access_method text not null default 'http',
  adapter text,
  quality_tier integer,
  source_class text not null default 'secondary',
  commercial_restrictions text,
  auth_required boolean not null default false,
  rate_limit_per_minute integer,
  cache_ttl_seconds integer not null default 86400,
  extraction_strategy text not null default 'direct_html',
  robots_restricted boolean not null default false,
  historical_success_rate numeric,
  average_relevance numeric,
  average_extraction_cost numeric,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.public_retrieval_cache (
  canonical_url text primary key,
  content_hash text not null,
  text_content text not null,
  content_type text,
  etag text,
  last_modified text,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  extraction_version text not null default 'v1',
  structured_parser_version text,
  fetch_status integer not null default 200
);

create index if not exists public_retrieval_cache_expiry
  on public.public_retrieval_cache(expires_at);

alter table public.source_registry enable row level security;
alter table public.source_registry force row level security;
alter table public.public_retrieval_cache enable row level security;
alter table public.public_retrieval_cache force row level security;
alter table public.gemini_cache enable row level security;
alter table public.gemini_cache force row level security;

drop policy if exists "Service role manages source registry" on public.source_registry;
create policy "Service role manages source registry"
  on public.source_registry for all to service_role
  using (true) with check (true);

drop policy if exists "Service role manages public retrieval cache" on public.public_retrieval_cache;
create policy "Service role manages public retrieval cache"
  on public.public_retrieval_cache for all to service_role
  using (true) with check (true);

drop policy if exists "Service role manages gemini cache" on public.gemini_cache;
create policy "Service role manages gemini cache"
  on public.gemini_cache for all to service_role
  using (true) with check (true);

revoke all on public.source_registry, public.public_retrieval_cache, public.gemini_cache
  from public, anon, authenticated;
grant select, insert, update, delete on
  public.source_registry, public.public_retrieval_cache, public.gemini_cache
  to service_role;

alter table public.api_usage_logs
  add column if not exists estimated_cost_usd numeric not null default 0,
  add column if not exists pricing_version text,
  add column if not exists duration_ms bigint not null default 0,
  add column if not exists grounded_search_requested boolean not null default false,
  add column if not exists grounding_metadata_present boolean not null default false,
  add column if not exists cache_status text not null default 'miss'
    check (cache_status in ('hit', 'miss'));

alter table public.research_pipeline_metrics
  add column if not exists input_tokens bigint not null default 0,
  add column if not exists output_tokens bigint not null default 0,
  add column if not exists cache_misses integer not null default 0,
  add column if not exists model_call_counts jsonb not null default '{}'::jsonb,
  add column if not exists pricing_version text;

-- Run-scoped provider data is server-only. gemini_cache.run_id is mandatory
-- and its foreign key cascade prevents orphaned cross-run records.
revoke all on public.api_usage_logs, public.research_pipeline_metrics
  from public, anon, authenticated;
grant select, insert, update, delete on public.api_usage_logs, public.research_pipeline_metrics
  to service_role;

notify pgrst, 'reload schema';
