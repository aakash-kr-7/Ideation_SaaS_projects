-- Forward-only observability and audit support for optional Gemini grounding.

alter table public.api_usage_logs
  add column if not exists quota_metric text,
  add column if not exists quota_limit numeric,
  add column if not exists retry_delay_ms integer,
  add column if not exists pipeline_stage text,
  add column if not exists grounding_degraded boolean not null default false,
  add column if not exists external_search boolean not null default false,
  add column if not exists page_fetch boolean not null default false;

alter table public.research_pipeline_metrics
  add column if not exists grounded_calls_attempted integer not null default 0,
  add column if not exists grounded_calls_completed integer not null default 0,
  add column if not exists grounded_calls_quota_blocked integer not null default 0,
  add column if not exists external_search_calls integer not null default 0,
  add column if not exists synthesis_calls integer not null default 0,
  add column if not exists degraded_providers jsonb not null default '[]'::jsonb,
  add column if not exists grounding_mode text not null default 'optional'
    check (grounding_mode in ('required', 'optional', 'disabled')),
  add column if not exists grounding_degraded boolean not null default false;

alter table public.competitors
  add column if not exists evidence_ids uuid[] not null default '{}';
alter table public.risks
  add column if not exists evidence_ids uuid[] not null default '{}';
alter table public.pricing_models
  add column if not exists evidence_ids uuid[] not null default '{}';

create table if not exists public.source_retrieval_audit (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  query_family text not null,
  provider text not null,
  candidate_url text,
  canonical_url text,
  disposition text not null check (disposition in ('discovered', 'accepted', 'rejected')),
  rejection_reason text,
  relevance_score numeric,
  source_domain text,
  created_at timestamptz not null default now()
);

create index if not exists source_retrieval_audit_run_idx
  on public.source_retrieval_audit(run_id, disposition);

alter table public.source_retrieval_audit enable row level security;
alter table public.source_retrieval_audit force row level security;

drop policy if exists "Service role manages source retrieval audit" on public.source_retrieval_audit;
create policy "Service role manages source retrieval audit"
  on public.source_retrieval_audit for all to service_role
  using (true) with check (true);

revoke all on public.source_retrieval_audit from public, anon, authenticated;
grant select, insert, update, delete on public.source_retrieval_audit to service_role;

notify pgrst, 'reload schema';
