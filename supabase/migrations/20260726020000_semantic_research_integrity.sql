-- Canonical semantic anchor, per-page relevance/authority, precise
-- contradictions, and separated confidence/completeness audit fields.

create table if not exists public.research_briefs (
  run_id uuid primary key references public.research_runs(id) on delete cascade,
  exact_product_proposition text not null,
  target_buyer text not null,
  end_user text not null,
  workflow_changed text not null,
  problem_solved text not null,
  expected_outcome text not null,
  industry text not null,
  geography text not null,
  business_model text not null,
  direct_competitor_category text not null,
  adjacent_out_of_scope_categories text[] not null default '{}',
  terminology text[] not null default '{}',
  dimension_keywords jsonb not null,
  brief jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sources
  add column if not exists relevance_score numeric,
  add column if not exists relevance_class text,
  add column if not exists matched_brief_dimensions text[] not null default '{}',
  add column if not exists mismatch_reasons text[] not null default '{}',
  add column if not exists acceptance_decision text,
  add column if not exists page_type text,
  add column if not exists authority_score numeric,
  add column if not exists directness_score numeric,
  add column if not exists promotional_bias text,
  add column if not exists source_tier_reason text,
  add column if not exists query_family text;

alter table public.evidence_items
  add column if not exists relevance_score numeric,
  add column if not exists relevance_class text,
  add column if not exists matched_brief_dimensions text[] not null default '{}',
  add column if not exists mismatch_reasons text[] not null default '{}',
  add column if not exists acceptance_decision text,
  add column if not exists evidence_topic text,
  add column if not exists gemini_relevance_score numeric;

alter table public.source_retrieval_audit
  add column if not exists deterministic_relevance_score numeric,
  add column if not exists relevance_class text,
  add column if not exists matched_brief_dimensions text[] not null default '{}',
  add column if not exists mismatch_reasons text[] not null default '{}',
  add column if not exists acceptance_decision text,
  add column if not exists page_type text,
  add column if not exists source_tier integer,
  add column if not exists source_tier_reason text;

alter table public.evidence_confidence_results
  add column if not exists deductions jsonb not null default '[]'::jsonb,
  add column if not exists scoring_confidence numeric,
  add column if not exists report_completeness numeric,
  add column if not exists completeness_reasons jsonb not null default '[]'::jsonb;

create table if not exists public.evidence_contradictions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  tested_claim text not null,
  supporting_evidence_ids uuid[] not null default '{}',
  challenging_evidence_ids uuid[] not null default '{}',
  relationship text not null,
  resolution_status text not null check (resolution_status in ('resolved','unresolved','segment_specific')),
  resolution_note text,
  created_at timestamptz not null default now(),
  unique(run_id, tested_claim)
);

alter table public.research_briefs enable row level security;
alter table public.research_briefs force row level security;
alter table public.evidence_contradictions enable row level security;
alter table public.evidence_contradictions force row level security;

create policy "Service role manages research briefs"
  on public.research_briefs for all to service_role using (true) with check (true);
create policy "Service role manages evidence contradictions"
  on public.evidence_contradictions for all to service_role using (true) with check (true);

revoke all on public.research_briefs, public.evidence_contradictions from public, anon, authenticated;
grant select, insert, update, delete on public.research_briefs, public.evidence_contradictions to service_role;

create index if not exists sources_run_relevance_idx on public.sources(run_id, acceptance_decision, relevance_score desc);
create index if not exists evidence_items_run_topic_idx on public.evidence_items(run_id, evidence_topic, relevance_score desc);
create index if not exists evidence_contradictions_run_idx on public.evidence_contradictions(run_id);

notify pgrst, 'reload schema';
