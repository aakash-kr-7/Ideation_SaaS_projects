-- Bounded independent checking, adversarial verdict gating, and narrative integrity.

create table public.specialist_checks (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  specialist_name text not null check (specialist_name in ('competition','market','pricing','risk','demand','gtm')),
  status text not null check (status in ('Complete','Incomplete')),
  attempt_count integer not null check (attempt_count between 1 and 3),
  specialist_direction text not null check (specialist_direction in ('SupportsOpportunity','Mixed','ChallengesOpportunity','Insufficient','Unavailable')),
  checker_direction text not null check (checker_direction in ('SupportsOpportunity','Mixed','ChallengesOpportunity','Insufficient','Unavailable')),
  disputed boolean not null,
  dispute_reason text not null,
  checker_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, specialist_name)
);

create table public.adversarial_verdict_gates (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.research_runs(id) on delete cascade,
  emerging_verdict text not null check (emerging_verdict in ('Build Now','Validate First','Niche Down','Weak Signal','Avoid')),
  outcome text not null check (outcome in ('StrongObjection','NoStrongDisproof','InsufficientEvidence')),
  severity text not null check (severity in ('High','Medium','Low','None')),
  objection text not null,
  evidence_ids uuid[] not null default '{}',
  unresolved boolean not null default false,
  status text not null check (status in ('Complete','Incomplete')),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table public.citation_integrity_validations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.research_runs(id) on delete cascade,
  valid boolean not null,
  claims_checked integer not null check (claims_checked >= 0),
  claims_removed integer not null check (claims_removed >= 0),
  invalid_claims jsonb not null default '[]'::jsonb,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.report_versions
  add column if not exists specialist_disputes jsonb,
  add column if not exists adversarial_gate jsonb,
  add column if not exists citation_validation jsonb,
  add column if not exists reasoning_flags jsonb,
  add column if not exists verdict_score_mismatch boolean not null default false;

alter table public.specialist_checks enable row level security;
alter table public.adversarial_verdict_gates enable row level security;
alter table public.citation_integrity_validations enable row level security;

create policy "Users can view specialist checks for team runs"
  on public.specialist_checks for select using (
    exists (
      select 1 from public.research_runs rr
      join public.projects p on p.id = rr.project_id
      join public.team_members tm on tm.team_id = p.team_id
      where rr.id = specialist_checks.run_id and tm.user_id = auth.uid()
    )
  );

create policy "Users can view adversarial gates for team runs"
  on public.adversarial_verdict_gates for select using (
    exists (
      select 1 from public.research_runs rr
      join public.projects p on p.id = rr.project_id
      join public.team_members tm on tm.team_id = p.team_id
      where rr.id = adversarial_verdict_gates.run_id and tm.user_id = auth.uid()
    )
  );

create policy "Users can view citation validations for team runs"
  on public.citation_integrity_validations for select using (
    exists (
      select 1 from public.research_runs rr
      join public.projects p on p.id = rr.project_id
      join public.team_members tm on tm.team_id = p.team_id
      where rr.id = citation_integrity_validations.run_id and tm.user_id = auth.uid()
    )
  );

create index idx_specialist_checks_run on public.specialist_checks(run_id);
create index idx_adversarial_gates_run on public.adversarial_verdict_gates(run_id);
create index idx_citation_validations_run on public.citation_integrity_validations(run_id);
