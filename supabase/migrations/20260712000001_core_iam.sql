-- Migration 00001_core_iam
-- Core Identity & Access Management (IAM) and Team structures.

-- Enable required extensions
create extension if not exists "uuid-ossp";

-- 1. users: Extends Supabase auth.users
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  avatar_url text,
  onboarding_completed boolean default false not null,
  tour_completed boolean default false not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 2. teams: Supports future team/organization features
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 3. team_members: Maps users to teams
create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz default now() not null,
  unique(team_id, user_id)
);

-- 4. user_preferences: Settings specific to a user
create table public.user_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  experience_level text,
  preferred_market text,
  target_customer_type text,
  revenue_goal text,
  business_model text,
  technical_level text,
  region text,
  launch_channels text[],
  theme_preference text default 'system',
  email_notifications boolean default true,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- 5. feature_limits: Tracks usage limits for a team/tenant
create table public.feature_limits (
  team_id uuid primary key references public.teams(id) on delete cascade,
  max_projects int default 1 not null,
  used_projects int default 0 not null,
  max_research_runs int default 5 not null,
  used_research_runs int default 0 not null,
  max_team_members int default 1 not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- RLS Setup
alter table public.users enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.user_preferences enable row level security;
alter table public.feature_limits enable row level security;

-- Policies for users
create policy "Users can view own profile" on public.users for select using (auth.uid() = id);
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);

-- Policies for teams
create policy "Users can view their teams" on public.teams for select using (
  exists (select 1 from public.team_members where team_id = teams.id and user_id = auth.uid())
);
create policy "Team admins can update team" on public.teams for update using (
  exists (select 1 from public.team_members where team_id = teams.id and user_id = auth.uid() and role in ('owner', 'admin'))
);

-- Policies for team_members
create policy "Users can view members of their teams" on public.team_members for select using (
  exists (select 1 from public.team_members tm where tm.team_id = team_members.team_id and tm.user_id = auth.uid())
);

-- Policies for preferences
create policy "Users can view own preferences" on public.user_preferences for select using (auth.uid() = user_id);
create policy "Users can update own preferences" on public.user_preferences for update using (auth.uid() = user_id);
create policy "Users can insert own preferences" on public.user_preferences for insert with check (auth.uid() = user_id);

-- Policies for feature_limits
create policy "Users can view feature limits of their teams" on public.feature_limits for select using (
  exists (select 1 from public.team_members where team_id = feature_limits.team_id and user_id = auth.uid())
);

-- Indexes
create index idx_team_members_user on public.team_members(user_id);
create index idx_team_members_team on public.team_members(team_id);
