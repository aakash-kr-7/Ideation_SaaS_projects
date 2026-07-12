-- Migration 00004_scoring_reports
-- Scoring frameworks and generated reports

-- 1. opportunity_scores: The aggregate score
create table public.opportunity_scores (
  id uuid primary key default uuid_generate_v4(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  total numeric not null,
  confidence numeric not null,
  verdict text not null check (verdict in ('Build Now', 'Validate First', 'Niche Down', 'Weak Signal', 'Avoid')),
  created_at timestamptz default now() not null
);

-- 2. score_breakdowns: The individual criteria scores
create table public.score_breakdowns (
  id uuid primary key default uuid_generate_v4(),
  score_id uuid not null references public.opportunity_scores(id) on delete cascade,
  criterion text not null,
  score numeric not null,
  notes text not null,
  weight numeric not null,
  created_at timestamptz default now() not null,
  unique(score_id, criterion)
);

-- 3. score_evidence_refs: Links evidence to specific score criteria
create table public.score_evidence_refs (
  id uuid primary key default uuid_generate_v4(),
  score_breakdown_id uuid not null references public.score_breakdowns(id) on delete cascade,
  evidence_id uuid not null references public.evidence_items(id) on delete cascade,
  created_at timestamptz default now() not null,
  unique(score_breakdown_id, evidence_id)
);

-- 4. reports: The final generated output
create table public.reports (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null unique references public.research_runs(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  status text not null check (status in ('Draft', 'Published')),
  executive_summary text not null,
  methodology text not null,
  generated_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 5. report_versions: History/snapshots of the report
create table public.report_versions (
  id uuid primary key default uuid_generate_v4(),
  report_id uuid not null references public.reports(id) on delete cascade,
  version_number integer not null,
  payload jsonb not null, -- snapshot of the data at generation time
  created_at timestamptz default now() not null,
  unique(report_id, version_number)
);

-- RLS Setup
alter table public.opportunity_scores enable row level security;
alter table public.score_breakdowns enable row level security;
alter table public.score_evidence_refs enable row level security;
alter table public.reports enable row level security;
alter table public.report_versions enable row level security;

-- Policies
create policy "Users can view scores" on public.opportunity_scores for select using (
  exists (select 1 from public.opportunities o where o.id = opportunity_scores.opportunity_id)
);
create policy "Users can view score breakdowns" on public.score_breakdowns for select using (
  exists (select 1 from public.opportunity_scores s where s.id = score_breakdowns.score_id)
);
create policy "Users can view score evidence" on public.score_evidence_refs for select using (
  exists (select 1 from public.score_breakdowns sb where sb.id = score_evidence_refs.score_breakdown_id)
);
create policy "Users can view reports" on public.reports for select using (
  exists (select 1 from public.research_runs rr where rr.id = reports.run_id)
);
create policy "Users can view report versions" on public.report_versions for select using (
  exists (select 1 from public.reports r where r.id = report_versions.report_id)
);

-- Indexes
create index idx_opportunity_scores_opp on public.opportunity_scores(opportunity_id);
create index idx_reports_run on public.reports(run_id);
create index idx_report_versions_report on public.report_versions(report_id);
