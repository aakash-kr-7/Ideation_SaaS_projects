-- Migration 20260712000009_fix_rls_recursion
-- Helper security definer functions to bypass RLS recursion and drop/recreate teams and team_members select and update policies.

-- 1. Helper security definer functions to bypass RLS recursion
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

-- 2. Drop old recursive policies and recreate them using helper functions
drop policy if exists "Users can view members of their teams" on public.team_members;
create policy "Users can view members of their teams" on public.team_members
  for select using (public.is_team_member(team_id, auth.uid()));

drop policy if exists "Users can view their teams" on public.teams;
create policy "Users can view their teams" on public.teams
  for select using (created_by = auth.uid() or public.is_team_member(id, auth.uid()));

drop policy if exists "Team admins can update team" on public.teams;
create policy "Team admins can update team" on public.teams
  for update using (public.is_team_admin(id, auth.uid()));
