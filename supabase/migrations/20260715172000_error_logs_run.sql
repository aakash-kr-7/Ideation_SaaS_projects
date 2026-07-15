alter table public.error_logs
  add column if not exists run_id uuid references public.research_runs(id) on delete cascade;

create index if not exists idx_error_logs_run on public.error_logs(run_id);
notify pgrst, 'reload schema';
