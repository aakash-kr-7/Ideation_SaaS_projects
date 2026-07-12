-- Migration 00005_system_billing
-- System operations, analytics, caching, and billing

-- 1. analytics_events: Tracking user actions
create table public.analytics_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete set null,
  event_name text not null,
  event_data jsonb not null default '{}',
  created_at timestamptz default now() not null
);

-- 2. error_logs: Application errors
create table public.error_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references public.users(id) on delete set null,
  context text not null,
  error_message text not null,
  stack_trace text,
  created_at timestamptz default now() not null
);

-- 3. background_jobs: Job queue/status tracking
create table public.background_jobs (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid references public.research_runs(id) on delete cascade,
  job_type text not null,
  status text not null check (status in ('Queued', 'Processing', 'Complete', 'Failed')),
  error_details text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 4. notifications: In-app alerts
create table public.notifications (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null,
  message text not null,
  read boolean default false not null,
  type text not null check (type in ('Info', 'Success', 'Warning', 'Error')),
  created_at timestamptz default now() not null
);

-- 5. cached_research: Results of expensive LLM calls
create table public.cached_research (
  id uuid primary key default uuid_generate_v4(),
  query_hash text not null unique,
  result jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz default now() not null
);

-- 6. search_cache: Web search caching
create table public.search_cache (
  id uuid primary key default uuid_generate_v4(),
  query_string text not null unique,
  results jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz default now() not null
);

-- 7. billing_customers: Stripe customer mapping
create table public.billing_customers (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null unique references public.teams(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz default now() not null
);

-- 8. billing_subscriptions: Subscription state
create table public.billing_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  team_id uuid not null unique references public.teams(id) on delete cascade,
  stripe_subscription_id text not null unique,
  plan_id text not null,
  status text not null,
  current_period_end timestamptz not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS Setup
alter table public.analytics_events enable row level security;
alter table public.error_logs enable row level security;
alter table public.background_jobs enable row level security;
alter table public.notifications enable row level security;
alter table public.cached_research enable row level security;
alter table public.search_cache enable row level security;
alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;

-- Policies
create policy "Users can insert analytics" on public.analytics_events for insert with check (auth.uid() = user_id);
create policy "Users can insert errors" on public.error_logs for insert with check (auth.uid() = user_id);
create policy "Users can view their notifications" on public.notifications for select using (auth.uid() = user_id);
create policy "Users can update their notifications" on public.notifications for update using (auth.uid() = user_id);

-- System tables (cache, background jobs, billing) generally accessed via service role
create policy "Admins can view team billing" on public.billing_customers for select using (
  exists (select 1 from public.team_members tm where tm.team_id = billing_customers.team_id and tm.user_id = auth.uid() and role in ('owner', 'admin'))
);
create policy "Admins can view team subscriptions" on public.billing_subscriptions for select using (
  exists (select 1 from public.team_members tm where tm.team_id = billing_subscriptions.team_id and tm.user_id = auth.uid() and role in ('owner', 'admin'))
);

-- Storage buckets creation (assumes extension is available)
insert into storage.buckets (id, name, public) values ('user-assets', 'user-assets', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('exports', 'exports', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('cached-sources', 'cached-sources', false) on conflict do nothing;

-- Storage Policies
create policy "Public Access to user-assets" on storage.objects for select using (bucket_id = 'user-assets');
create policy "Authenticated users can upload user-assets" on storage.objects for insert with check (bucket_id = 'user-assets' and auth.role() = 'authenticated');
