-- Repair a production drift condition where the original migration was marked
-- applied but public.api_usage_logs was absent.

create table if not exists public.api_usage_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  provider text not null,
  operation text not null,
  prompt_tokens integer,
  completion_tokens integer,
  cost numeric,
  status text not null check (status in ('success', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.api_usage_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'api_usage_logs'
      and policyname = 'Users can view logs of their team runs'
  ) then
    create policy "Users can view logs of their team runs"
      on public.api_usage_logs for select to authenticated
      using (
        exists (
          select 1 from public.research_runs rr
          join public.projects p on rr.project_id = p.id
          join public.team_members tm on p.team_id = tm.team_id
          where rr.id = api_usage_logs.run_id
            and tm.user_id = auth.uid()
        )
      );
  end if;
end
$$;

grant select on public.api_usage_logs to authenticated;
grant all on public.api_usage_logs to service_role;

create index if not exists idx_api_usage_logs_run
  on public.api_usage_logs(run_id);

notify pgrst, 'reload schema';
