-- Evidence-backed reasoning, adjustable deterministic scoring, immutable reports,
-- and tenant-scoped server-generated exports.

alter table public.evidence_items
  add column if not exists cluster_key text,
  add column if not exists supporting_count integer not null default 1 check (supporting_count >= 0),
  add column if not exists contradicting_count integer not null default 0 check (contradicting_count >= 0),
  add column if not exists confidence numeric not null default 0.5 check (confidence between 0 and 1);

alter table public.research_runs add column if not exists progress_detail text;
alter table public.research_stages add column if not exists progress_detail text;

create table if not exists public.scoring_weights (
  criterion text primary key,
  weight numeric not null check (weight >= 0),
  description text not null,
  updated_at timestamptz not null default now()
);

insert into public.scoring_weights (criterion, weight, description) values
  ('painSeverity', 12, 'Strength and consistency of verified pain evidence'),
  ('purchaseUrgency', 10, 'Urgent language and demand evidence'),
  ('willingnessToPay', 11, 'Pricing evidence and existing paid alternatives'),
  ('buyerReachability', 8, 'Independent demand sources and addressable communities'),
  ('mvpSpeed', 8, 'Execution-risk burden and scope signals'),
  ('competitionGap', 8, 'Competitive density and explicit gaps'),
  ('retentionPotential', 9, 'Recurring-workflow evidence'),
  ('platformDependencyRisk', 7, 'Platform-category risk burden; inverted in total'),
  ('regulatoryRisk', 5, 'Regulatory-category risk burden; inverted in total'),
  ('founderFit', 7, 'Evidence access and domain-specific signal coverage'),
  ('distributionClarity', 8, 'Demand-source and launch-channel clarity'),
  ('speedToFirstRevenue', 7, 'Pricing plus purchase-urgency evidence')
on conflict (criterion) do update set
  weight = excluded.weight,
  description = excluded.description;

alter table public.scoring_weights enable row level security;
create policy "Authenticated users can read scoring weights"
  on public.scoring_weights for select to authenticated using (true);

create table if not exists public.reasoning_agent_outputs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  agent_name text not null check (agent_name in ('competition','market','pricing','risk','demand','gtm','final_judge')),
  status text not null check (status in ('Complete','Incomplete')),
  attempt_count integer not null check (attempt_count between 1 and 3),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, agent_name)
);
alter table public.reasoning_agent_outputs enable row level security;
create policy "Users can view reasoning outputs for team runs"
  on public.reasoning_agent_outputs for select using (
    exists (
      select 1 from public.research_runs rr
      join public.projects p on p.id = rr.project_id
      join public.team_members tm on tm.team_id = p.team_id
      where rr.id = reasoning_agent_outputs.run_id and tm.user_id = auth.uid()
    )
  );

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  report_version_id uuid not null references public.report_versions(id) on delete cascade,
  format text not null check (format in ('json','markdown','csv','pdf')),
  storage_path text not null unique,
  byte_size bigint not null check (byte_size > 0),
  sha256 text not null,
  created_at timestamptz not null default now(),
  unique (report_version_id, format)
);
alter table public.report_exports enable row level security;
create policy "Users can view exports for team reports"
  on public.report_exports for select using (
    exists (
      select 1 from public.report_versions rv
      join public.reports r on r.id = rv.report_id
      join public.research_runs rr on rr.id = r.run_id
      join public.projects p on p.id = rr.project_id
      join public.team_members tm on tm.team_id = p.team_id
      where rv.id = report_exports.report_version_id and tm.user_id = auth.uid()
    )
  );

-- Export object names are: <team UUID>/<run UUID>/v<number>/report.<format>.
create policy "Team members can read their export objects"
  on storage.objects for select to authenticated using (
    bucket_id = 'exports'
    and exists (
      select 1 from public.team_members tm
      where tm.team_id::text = (storage.foldername(name))[1]
        and tm.user_id = auth.uid()
    )
  );

create or replace function public.reject_report_version_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'report_versions are immutable';
end;
$$;

drop trigger if exists report_versions_immutable_update on public.report_versions;
create trigger report_versions_immutable_update
before update on public.report_versions for each row
execute function public.reject_report_version_mutation();

drop trigger if exists report_versions_immutable_delete on public.report_versions;
create trigger report_versions_immutable_delete
before delete on public.report_versions for each row
execute function public.reject_report_version_mutation();

create index if not exists idx_reasoning_outputs_run on public.reasoning_agent_outputs(run_id);
create index if not exists idx_report_exports_version on public.report_exports(report_version_id);
