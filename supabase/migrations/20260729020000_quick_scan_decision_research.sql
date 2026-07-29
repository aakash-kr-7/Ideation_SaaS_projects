-- Quick Scan decision-changing research budget and provenance.

alter table public.competitors
  add column if not exists category_id text,
  add column if not exists canonical_homepage text,
  add column if not exists category_rationale text,
  add column if not exists candidate_type text,
  add column if not exists seed_last_reviewed_at date;

alter table public.competitors
  add constraint competitors_candidate_type_check
  check (candidate_type is null or candidate_type in ('direct', 'adjacent'));

create table if not exists public.research_call_metrics (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  call_purpose text not null,
  query_family text not null,
  grounded boolean not null default false,
  conditional_call_trigger text[] not null default '{}',
  provider text not null,
  model text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  sources_discovered integer not null default 0,
  sources_accepted integer not null default 0,
  independent_evidence_groups_added integer not null default 0,
  evidence_families_added text[] not null default '{}',
  contradictions_added integer not null default 0,
  pricing_claims_validated integer not null default 0,
  cache_hits integer not null default 0,
  duration_ms integer not null default 0,
  quota_failure boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, provider, query_family, call_purpose)
);

create index if not exists research_call_metrics_run_id_idx
  on public.research_call_metrics(run_id);

create table if not exists public.validated_pricing_observations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  source_id uuid references public.sources(id) on delete cascade,
  source_url text not null,
  source_domain text not null,
  query_family text not null,
  exact_excerpt text not null,
  plan_name text,
  price_point text not null,
  pricing_model text not null
    check (pricing_model in ('subscription', 'usage', 'one_time', 'custom', 'unknown')),
  validation_state text not null check (validation_state = 'verified'),
  created_at timestamptz not null default now(),
  unique (run_id, source_url, price_point, plan_name)
);

alter table public.research_call_metrics enable row level security;
alter table public.validated_pricing_observations enable row level security;

notify pgrst, 'reload schema';
