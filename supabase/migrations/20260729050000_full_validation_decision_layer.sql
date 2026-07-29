-- Deterministic Full Validation decision persistence. Quick Scan continues to
-- use its existing score rows and verdict behavior.

alter table public.score_breakdowns
  add column if not exists buyer_segment_applicability text[] not null default '{}',
  add column if not exists unresolved_assumptions jsonb not null default '[]'::jsonb,
  add column if not exists score_sensitivity jsonb not null default '{}'::jsonb;

alter table public.opportunity_scores
  drop constraint if exists opportunity_scores_verdict_check;
alter table public.opportunity_scores
  add constraint opportunity_scores_verdict_check check (verdict in (
    'Build Now', 'Validate First', 'Niche Down', 'Weak Signal', 'Avoid',
    'Build', 'Reposition', 'Do Not Build Yet'
  ));

create table if not exists public.full_validation_decisions (
  run_id uuid primary key references public.research_runs(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  official_score numeric not null,
  honest_score_range jsonb not null,
  evidence_confidence text not null,
  official_verdict text not null check (official_verdict in (
    'Build', 'Validate First', 'Niche Down', 'Reposition', 'Do Not Build Yet'
  )),
  factor_analysis jsonb not null,
  segment_rankings jsonb not null,
  recommended_segment text,
  alternative_map jsonb not null,
  economics_scenarios jsonb not null,
  adversarial_gate jsonb not null,
  verdict_structure jsonb not null,
  founder_action_plan jsonb not null,
  optional_groq_review jsonb,
  deterministic_fingerprint text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists full_validation_decisions_opportunity_idx
  on public.full_validation_decisions(opportunity_id);

alter table public.full_validation_decisions enable row level security;
revoke all on table public.full_validation_decisions from anon, authenticated;
grant all on table public.full_validation_decisions to service_role;

notify pgrst, 'reload schema';
