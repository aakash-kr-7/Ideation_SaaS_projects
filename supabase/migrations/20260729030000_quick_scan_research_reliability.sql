-- Quick Scan technical availability, pack execution, adapter yield, and
-- exactly-once credit behavior. Full Validation remains unchanged.

alter table public.research_runs
  add column if not exists research_outcome text,
  add column if not exists retry_after timestamptz;

alter table public.research_jobs
  drop constraint if exists research_jobs_error_class_check;
alter table public.research_jobs
  add constraint research_jobs_error_class_check
  check (error_class is null or error_class in (
    'transient', 'permanent', 'budget', 'timeout', 'cancelled',
    'research_unavailable'
  ));

alter table public.research_job_attempts
  drop constraint if exists research_job_attempts_error_class_check;
alter table public.research_job_attempts
  add constraint research_job_attempts_error_class_check
  check (error_class is null or error_class in (
    'transient', 'permanent', 'budget', 'timeout', 'cancelled',
    'research_unavailable'
  ));

alter table public.research_runs
  add constraint research_runs_research_outcome_check
  check (
    research_outcome is null or research_outcome in (
      'research_completed',
      'insufficient_evidence',
      'research_unavailable'
    )
  );

create table if not exists public.quick_scan_research_pack_statuses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  pack_key text not null check (pack_key in (
    'quick_primary_problem_buyer_demand',
    'quick_adversarial',
    'quick_pricing_wtp_reachability',
    'quick_coverage_repair'
  )),
  status text not null check (status in (
    'completed',
    'completed_no_evidence',
    'quota_blocked',
    'provider_failed',
    'timed_out',
    'skipped'
  )),
  accepted_evidence_count integer not null default 0,
  failure_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, pack_key)
);

create table if not exists public.research_adapter_metrics (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  adapter text not null,
  query_family text not null,
  calls integer not null default 0,
  pages_found integer not null default 0,
  pages_fetched integer not null default 0,
  evidence_accepted integer not null default 0,
  independent_evidence_groups_added integer not null default 0,
  failure_reason text,
  stopped_early boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, adapter, query_family)
);

create table if not exists public.evidence_rejection_diagnostics (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  pipeline_stage text not null,
  reason text not null check (reason in (
    'semantic_mismatch',
    'missing_excerpt',
    'duplicate_source',
    'weak_authority',
    'pricing_mismatch',
    'parsing_failure',
    'inaccessible_page'
  )),
  count integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, pipeline_stage, reason)
);

create index if not exists quick_scan_pack_status_run_idx
  on public.quick_scan_research_pack_statuses(run_id);
create index if not exists research_adapter_metrics_run_idx
  on public.research_adapter_metrics(run_id);

alter table public.quick_scan_research_pack_statuses enable row level security;
alter table public.research_adapter_metrics enable row level security;
alter table public.evidence_rejection_diagnostics enable row level security;
revoke all on table public.quick_scan_research_pack_statuses from anon, authenticated;
revoke all on table public.research_adapter_metrics from anon, authenticated;
revoke all on table public.evidence_rejection_diagnostics from anon, authenticated;
grant all on table public.quick_scan_research_pack_statuses to service_role;
grant all on table public.research_adapter_metrics to service_role;
grant all on table public.evidence_rejection_diagnostics to service_role;

create or replace function public.terminate_research_run(
  p_run_id uuid,
  p_error_class text,
  p_error_message text,
  p_failed_stage text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_research_unavailable boolean := p_error_class = 'research_unavailable'
    or p_error_message like 'RESEARCH_UNAVAILABLE:%';
begin
  select status into v_status from public.research_runs
  where id = p_run_id for update;

  if v_status in ('Completed', 'Failed', 'Cancelled') then
    return v_status;
  end if;

  update public.research_runs set
    status = 'Failed',
    research_outcome = case
      when mode = 'quick_scan' and v_research_unavailable
        then 'research_unavailable'
      else research_outcome
    end,
    retry_after = case
      when mode = 'quick_scan' and v_research_unavailable
        then date_trunc('day', now() at time zone 'UTC') + interval '1 day'
      else null
    end,
    progress = 100,
    error_message = p_error_message,
    progress_detail = case
      when mode = 'quick_scan' and v_research_unavailable
        then 'Research unavailable; no market verdict was produced. Credit restored. Retry when research is available.'
      else 'Pipeline failed at stage: ' || coalesce(p_failed_stage, 'unknown')
    end,
    terminal_at = now(),
    updated_at = now()
  where id = p_run_id;

  insert into public.research_stages (
    run_id, stage_name, status, progress_detail, error_message, started_at, completed_at
  ) values (
    p_run_id,
    'Failed',
    'Failed',
    case when v_research_unavailable
      then 'Mandatory research could not run. No market conclusion was produced.'
      else p_error_message
    end,
    p_error_message,
    now(),
    now()
  );

  update public.research_pipeline_metrics set
    terminal_failure_reason = p_error_message,
    updated_at = now()
  where run_id = p_run_id;

  insert into public.error_logs (run_id, context, error_message)
  values (
    p_run_id,
    case when v_research_unavailable
      then 'research_unavailable:' || coalesce(p_failed_stage, 'unknown')
      else 'terminal_failure:' || coalesce(p_failed_stage, 'unknown')
    end,
    p_error_message
  );

  update public.research_jobs set
    status = 'dead_letter',
    error_class = case when v_research_unavailable then 'research_unavailable' else 'permanent' end,
    error_message = 'Run terminated: ' || p_error_message,
    completed_at = now(),
    updated_at = now()
  where run_id = p_run_id and status in ('pending', 'claimed');

  perform public.finalize_research_credit(p_run_id, 'restore');
  return 'Failed';
end;
$$;

create or replace function public.finalize_research_run(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_mode public.report_mode;
  v_version_id uuid;
  v_export_count integer;
  v_chart_count integer;
  v_evidence_count integer;
begin
  select status, mode into v_status, v_mode
  from public.research_runs
  where id = p_run_id
  for update;

  if v_status = 'Completed' then return 'Completed'; end if;
  if v_status in ('Failed', 'Cancelled') then
    raise exception 'RUN_ALREADY_TERMINAL: %', v_status;
  end if;

  select rv.id into v_version_id
  from public.reports r
  join public.report_versions rv on rv.report_id = r.id
  where r.run_id = p_run_id
  order by rv.version_number desc, rv.created_at desc
  limit 1;
  if v_version_id is null then
    raise exception 'REPORT_NOT_PUBLICATION_READY: immutable version missing';
  end if;

  select count(distinct format) into v_export_count
  from public.report_exports
  where report_version_id = v_version_id
    and format in ('pdf', 'markdown', 'csv', 'json');
  select count(*) into v_chart_count
  from public.report_chart_datasets
  where report_version_id = v_version_id;
  if v_export_count <> 4 or v_chart_count < 4 then
    raise exception 'REPORT_NOT_PUBLICATION_READY: exports %, charts %',
      v_export_count, v_chart_count;
  end if;

  select count(*) into v_evidence_count
  from public.evidence_items
  where run_id = p_run_id and excluded = false;

  update public.research_runs set
    status = 'Completed',
    research_outcome = case
      when v_mode = 'quick_scan' and v_evidence_count = 0 then 'insufficient_evidence'
      when v_mode = 'quick_scan' then 'research_completed'
      else research_outcome
    end,
    progress = 100,
    progress_detail = 'Research complete',
    terminal_at = now(),
    updated_at = now()
  where id = p_run_id;

  insert into public.research_stages (
    run_id, stage_name, status, progress_detail, started_at, completed_at
  ) values (
    p_run_id, 'Completed', 'Completed', 'Research complete', now(), now()
  );

  perform public.finalize_research_credit(p_run_id, 'consume');
  return 'Completed';
end;
$$;

revoke all on function public.terminate_research_run(uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.terminate_research_run(uuid,text,text,text)
  to service_role;
revoke all on function public.finalize_research_run(uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_research_run(uuid)
  to service_role;

notify pgrst, 'reload schema';
