-- Migration 00003_normalized_data
-- Normalized data structures for research outputs (Opportunities, Evidence, Competitors, etc.)

-- 1. opportunities: The core output of a research run
create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  name text not null,
  one_liner text not null,
  target_customer text not null,
  core_pain text not null,
  market text not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 2. sources: Raw input materials
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  title text not null,
  url text not null,
  source_type text not null,
  text_content text not null,
  published_at timestamptz,
  created_at timestamptz default now() not null
);

-- 3. evidence_items: Extracted facts linked to sources
create table public.evidence_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  signal_type text not null check (signal_type in ('Pain', 'Demand', 'Pricing', 'Risk')),
  strength text not null check (strength in ('High', 'Medium', 'Low')),
  title text not null,
  snippet text not null,
  verified boolean default false not null,
  created_at timestamptz default now() not null
);

-- 4. competitors
create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  name text not null,
  positioning text not null,
  pricing text not null,
  target text not null,
  strength text not null,
  gap text not null,
  created_at timestamptz default now() not null
);

-- 5. risks
create table public.risks (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  category text not null check (category in ('Market', 'Execution', 'Platform', 'Regulatory')),
  severity text not null check (severity in ('High', 'Medium', 'Low')),
  description text not null,
  mitigation text not null,
  created_at timestamptz default now() not null
);

-- 6. pricing_models
create table public.pricing_models (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  model text not null,
  price_point text not null,
  rationale text not null,
  first_offer text not null,
  target_customers integer not null,
  created_at timestamptz default now() not null
);

-- 7. mvp_plans
create table public.mvp_plans (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  outcome text not null,
  build_estimate text not null,
  build_complexity text not null check (build_complexity in ('Low', 'Medium', 'High')),
  created_at timestamptz default now() not null
);

-- 8. mvp_scope_items (array items for MVP plan)
create table public.mvp_scope_items (
  id uuid primary key default gen_random_uuid(),
  mvp_plan_id uuid not null references public.mvp_plans(id) on delete cascade,
  item_type text not null check (item_type in ('Scope', 'Exclusion')),
  description text not null,
  created_at timestamptz default now() not null
);

-- 9. launch_plans
create table public.launch_plans (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null unique references public.opportunities(id) on delete cascade,
  first_customer_channel text not null,
  outreach_message text not null,
  success_metric text not null,
  created_at timestamptz default now() not null
);

-- 10. launch_strategies (array items for Launch plan)
create table public.launch_strategies (
  id uuid primary key default gen_random_uuid(),
  launch_plan_id uuid not null references public.launch_plans(id) on delete cascade,
  strategy_type text not null check (strategy_type in ('WeekOne', 'FirstTen')),
  description text not null,
  created_at timestamptz default now() not null
);

-- RLS Setup
alter table public.opportunities enable row level security;
alter table public.sources enable row level security;
alter table public.evidence_items enable row level security;
alter table public.competitors enable row level security;
alter table public.risks enable row level security;
alter table public.pricing_models enable row level security;
alter table public.mvp_plans enable row level security;
alter table public.mvp_scope_items enable row level security;
alter table public.launch_plans enable row level security;
alter table public.launch_strategies enable row level security;

-- Policies
create policy "Users can view run data" on public.opportunities for select using (
  exists (select 1 from public.research_runs rr where rr.id = opportunities.run_id)
);
create policy "Users can view run data" on public.sources for select using (
  exists (select 1 from public.research_runs rr where rr.id = sources.run_id)
);
create policy "Users can view run data" on public.evidence_items for select using (
  exists (select 1 from public.research_runs rr where rr.id = evidence_items.run_id)
);
create policy "Users can view opportunity data" on public.competitors for select using (
  exists (select 1 from public.opportunities o where o.id = competitors.opportunity_id)
);
create policy "Users can view opportunity data" on public.risks for select using (
  exists (select 1 from public.opportunities o where o.id = risks.opportunity_id)
);
create policy "Users can view opportunity data" on public.pricing_models for select using (
  exists (select 1 from public.opportunities o where o.id = pricing_models.opportunity_id)
);
create policy "Users can view opportunity data" on public.mvp_plans for select using (
  exists (select 1 from public.opportunities o where o.id = mvp_plans.opportunity_id)
);
create policy "Users can view opportunity data" on public.mvp_scope_items for select using (
  exists (select 1 from public.mvp_plans mp where mp.id = mvp_scope_items.mvp_plan_id)
);
create policy "Users can view opportunity data" on public.launch_plans for select using (
  exists (select 1 from public.opportunities o where o.id = launch_plans.opportunity_id)
);
create policy "Users can view opportunity data" on public.launch_strategies for select using (
  exists (select 1 from public.launch_plans lp where lp.id = launch_strategies.launch_plan_id)
);

-- Indexes
create index idx_opportunities_run on public.opportunities(run_id);
create index idx_sources_run on public.sources(run_id);
create index idx_evidence_items_run on public.evidence_items(run_id);
create index idx_evidence_items_opportunity on public.evidence_items(opportunity_id);
create index idx_competitors_opportunity on public.competitors(opportunity_id);
create index idx_risks_opportunity on public.risks(opportunity_id);
