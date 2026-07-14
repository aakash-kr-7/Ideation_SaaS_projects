-- Migration 20260712000008_grants_and_fixes
-- Fix permissions for service_role/anon/authenticated and update trigger slug generation.

-- 1. Enable pgcrypto extension if not present (in case gen_random_bytes is needed elsewhere)
create extension if not exists "pgcrypto";

-- 2. Grant permissions on schema public to standard roles
grant usage on schema public to anon, authenticated, service_role;

-- Grant all privileges on all existing tables to API roles
grant all privileges on all tables in schema public to postgres, service_role, authenticated, anon;
grant all privileges on all sequences in schema public to postgres, service_role, authenticated, anon;
grant all privileges on all functions in schema public to postgres, service_role, authenticated, anon;

-- Ensure future tables/sequences/functions get default privileges
alter default privileges in schema public grant all on tables to postgres, service_role, authenticated, anon;
alter default privileges in schema public grant all on sequences to postgres, service_role, authenticated, anon;
alter default privileges in schema public grant all on functions to postgres, service_role, authenticated, anon;

-- 3. Rewrite handle_new_user to use gen_random_uuid slug to avoid dependency on encode/gen_random_bytes
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_team_id uuid;
begin
  -- Insert into public.users
  insert into public.users (id, display_name, email, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  );

  -- Create default team with a random slug using uuid
  insert into public.teams (name, slug, created_by)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', 'My Team'),
    'team-' || substring(gen_random_uuid()::text from 1 for 8),
    new.id
  ) returning id into new_team_id;

  -- Add user as owner of default team
  insert into public.team_members (team_id, user_id, role)
  values (new_team_id, new.id, 'owner');

  -- Setup default feature limits
  insert into public.feature_limits (team_id) values (new_team_id);

  return new;
end;
$$;

-- 4. Helper security definer functions to bypass RLS recursion
create or replace function public.is_team_member(team_id uuid, user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return exists (
    select 1 from public.team_members 
    where team_members.team_id = $1 
    and team_members.user_id = $2
  );
end;
$$;

create or replace function public.is_team_admin(team_id uuid, user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return exists (
    select 1 from public.team_members 
    where team_members.team_id = $1 
    and team_members.user_id = $2
    and team_members.role in ('owner', 'admin')
  );
end;
$$;

-- 5. Drop old recursive policies and recreate them using helper functions
drop policy if exists "Users can view members of their teams" on public.team_members;
create policy "Users can view members of their teams" on public.team_members
  for select using (public.is_team_member(team_id, auth.uid()));

drop policy if exists "Users can view their teams" on public.teams;
create policy "Users can view their teams" on public.teams
  for select using (created_by = auth.uid() or public.is_team_member(id, auth.uid()));

drop policy if exists "Team admins can update team" on public.teams;
create policy "Team admins can update team" on public.teams
  for update using (public.is_team_admin(id, auth.uid()));

