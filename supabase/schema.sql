-- Supabase-ready persistence for SignalFit.

-- User profiles (onboarding data, preferences)
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  experience_level text,
  preferred_market text,
  target_customer_type text,
  revenue_goal text,
  business_model text,
  technical_level text,
  region text,
  launch_channels text[],
  onboarding_completed boolean default false,
  tour_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable RLS on user_profiles
alter table user_profiles enable row level security;

create policy "Users can view own profile" on user_profiles for select using (auth.uid() = id);
create policy "Users can insert own profile" on user_profiles for insert with check (auth.uid() = id);
create policy "Users can update own profile" on user_profiles for update using (auth.uid() = id);

-- Research runs
create table if not exists research_runs (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  idea_name text not null,
  idea_description text not null,
  target_customer text not null,
  market_type text not null,
  target_region text not null,
  depth text not null check (depth in ('fast', 'deep')),
  stage text not null,
  progress integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists sources (
  id text primary key,
  research_run_id uuid not null references research_runs(id) on delete cascade,
  title text not null,
  url text not null,
  source text not null,
  source_type text not null,
  text text not null,
  published_at timestamptz
);

create table if not exists evidence_items (
  id text primary key,
  research_run_id uuid not null references research_runs(id) on delete cascade,
  source_id text references sources(id) on delete set null,
  kind text not null,
  confidence numeric not null check (confidence between 0 and 100),
  title text not null,
  snippet text not null,
  url text not null,
  verified boolean not null default false,
  inference text
);

create table if not exists reports (
  id text primary key,
  research_run_id uuid not null references research_runs(id) on delete cascade,
  schema_version text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists competitors (
  id text primary key,
  report_id text not null references reports(id) on delete cascade,
  payload jsonb not null
);

create table if not exists scores (
  id bigserial primary key,
  report_id text not null references reports(id) on delete cascade,
  weights jsonb not null,
  scores jsonb not null,
  notes jsonb not null,
  evidence_refs jsonb not null default '{}',
  total numeric not null,
  confidence numeric not null,
  verdict text not null,
  created_at timestamptz not null default now()
);

create index if not exists evidence_items_run_idx on evidence_items(research_run_id);
create index if not exists reports_run_idx on reports(research_run_id);
