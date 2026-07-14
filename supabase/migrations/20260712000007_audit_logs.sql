-- Migration 00007_audit_logs
-- Audit logging for system operations

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  team_id uuid references public.teams(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb default '{}'::jsonb not null,
  created_at timestamptz default now() not null
);

-- RLS Setup
alter table public.audit_logs enable row level security;

-- Policies
create policy "Team admins can view audit logs" on public.audit_logs for select using (
  exists (
    select 1 from public.team_members tm 
    where tm.team_id = audit_logs.team_id 
    and tm.user_id = auth.uid() 
    and tm.role in ('owner', 'admin')
  )
);

create policy "System can insert audit logs" on public.audit_logs for insert with check (
  -- In a real scenario, inserts might be done via service_role bypassing RLS,
  -- but we allow users to log actions for their own teams.
  exists (
    select 1 from public.team_members tm 
    where tm.team_id = audit_logs.team_id 
    and tm.user_id = auth.uid()
  )
);

-- Indexes
create index idx_audit_logs_team on public.audit_logs(team_id);
create index idx_audit_logs_user on public.audit_logs(user_id);
