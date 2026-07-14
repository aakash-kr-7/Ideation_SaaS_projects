-- Migration 00002_projects_research
-- Projects and Research Runs

-- 1. projects: Folders or overarching initiatives
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 2. research_runs: A single validation or research attempt
create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  idea_name text not null,
  idea_description text not null,
  target_customer text not null,
  market_type text not null,
  target_region text not null,
  mode text not null check (mode in ('Fast Scan', 'Deep Validation', 'Compare Ideas', 'Find Opportunities in Market')),
  status text not null check (status in ('Queued', 'Researching', 'Complete', 'Failed')),
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  error_message text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 3. research_stages: Tracks the individual steps of a research run
create table public.research_stages (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  stage_name text not null,
  status text not null check (status in ('Pending', 'Active', 'Complete', 'Failed')),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 4. saved_comparisons: Saved views of multiple research runs being compared
create table public.saved_comparisons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  run_ids uuid[] not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now() not null
);

-- RLS Setup
alter table public.projects enable row level security;
alter table public.research_runs enable row level security;
alter table public.research_stages enable row level security;
alter table public.saved_comparisons enable row level security;

-- Policies for projects
create policy "Users can view projects of their teams" on public.projects for select using (
  exists (select 1 from public.team_members where team_id = projects.team_id and user_id = auth.uid())
);
create policy "Users can insert projects for their teams" on public.projects for insert with check (
  exists (select 1 from public.team_members where team_id = projects.team_id and user_id = auth.uid())
);
create policy "Users can update projects of their teams" on public.projects for update using (
  exists (select 1 from public.team_members where team_id = projects.team_id and user_id = auth.uid())
);
create policy "Users can delete projects of their teams" on public.projects for delete using (
  exists (select 1 from public.team_members where team_id = projects.team_id and user_id = auth.uid())
);

-- Policies for research_runs
create policy "Users can view runs of their team projects" on public.research_runs for select using (
  exists (
    select 1 from public.projects p
    join public.team_members tm on p.team_id = tm.team_id
    where p.id = research_runs.project_id and tm.user_id = auth.uid()
  )
);
create policy "Users can insert runs for their team projects" on public.research_runs for insert with check (
  exists (
    select 1 from public.projects p
    join public.team_members tm on p.team_id = tm.team_id
    where p.id = research_runs.project_id and tm.user_id = auth.uid()
  )
);
create policy "Users can update runs of their team projects" on public.research_runs for update using (
  exists (
    select 1 from public.projects p
    join public.team_members tm on p.team_id = tm.team_id
    where p.id = research_runs.project_id and tm.user_id = auth.uid()
  )
);

-- Policies for research_stages
create policy "Users can view stages of their team runs" on public.research_stages for select using (
  exists (
    select 1 from public.research_runs rr
    join public.projects p on rr.project_id = p.id
    join public.team_members tm on p.team_id = tm.team_id
    where rr.id = research_stages.run_id and tm.user_id = auth.uid()
  )
);

-- Indexes
create index idx_projects_team on public.projects(team_id);
create index idx_research_runs_project on public.research_runs(project_id);
create index idx_research_stages_run on public.research_stages(run_id);
