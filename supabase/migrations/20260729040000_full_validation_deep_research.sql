-- Full Validation evidence-first packs and proposition graph. All structures
-- are mode-gated in the worker; Quick Scan tables and behavior are unchanged.

create table if not exists public.full_validation_research_pack_statuses (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  pack_key text not null,
  status text not null check (status in (
    'completed', 'completed_no_evidence', 'quota_blocked',
    'provider_failed', 'timed_out', 'skipped'
  )),
  accepted_evidence_count integer not null default 0,
  failure_reason text,
  conditional_trigger text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, pack_key)
);

create table if not exists public.research_propositions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  proposition_key text not null,
  statement text not null,
  buyer_segment text not null,
  factor_ids text[] not null default '{}',
  primary_pack_key text not null,
  status text not null default 'untested'
    check (status in ('untested', 'supported', 'challenged', 'mixed', 'insufficient_evidence')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, proposition_key, buyer_segment)
);

create table if not exists public.research_claim_graph_edges (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  proposition_id uuid not null references public.research_propositions(id) on delete cascade,
  evidence_id uuid not null references public.evidence_items(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  buyer_segment text not null,
  factor_id text not null,
  research_pack text not null,
  evidence_role text not null check (evidence_role in ('supporting', 'challenging')),
  source_family text not null,
  independence_key text not null,
  created_at timestamptz not null default now(),
  unique (proposition_id, evidence_id, factor_id)
);

alter table public.evidence_contradictions
  add column if not exists proposition_id uuid references public.research_propositions(id) on delete set null,
  add column if not exists buyer_segment text;

alter table public.research_call_metrics
  add column if not exists calls integer not null default 1,
  add column if not exists pages_fetched integer not null default 0,
  add column if not exists source_families_added integer not null default 0,
  add column if not exists wtp_signals_found integer not null default 0,
  add column if not exists rejection_reasons jsonb not null default '{}'::jsonb,
  add column if not exists provider_failure text;

create index if not exists full_validation_pack_status_run_idx
  on public.full_validation_research_pack_statuses(run_id);
create index if not exists research_propositions_run_idx
  on public.research_propositions(run_id, buyer_segment);
create index if not exists research_claim_graph_run_idx
  on public.research_claim_graph_edges(run_id, proposition_id);

alter table public.full_validation_research_pack_statuses enable row level security;
alter table public.research_propositions enable row level security;
alter table public.research_claim_graph_edges enable row level security;
revoke all on table public.full_validation_research_pack_statuses,
  public.research_propositions, public.research_claim_graph_edges
  from anon, authenticated;
grant all on table public.full_validation_research_pack_statuses,
  public.research_propositions, public.research_claim_graph_edges
  to service_role;

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
  if v_status in ('Completed', 'Failed', 'Cancelled') then return v_status; end if;

  update public.research_runs set
    status = 'Failed',
    research_outcome = case when v_research_unavailable
      then 'research_unavailable' else research_outcome end,
    retry_after = case when v_research_unavailable
      then date_trunc('day', now() at time zone 'UTC') + interval '1 day'
      else null end,
    progress = 100,
    error_message = p_error_message,
    progress_detail = case when v_research_unavailable
      then 'Research unavailable; no market verdict was produced. Credit restored. Retry when research is available.'
      else 'Pipeline failed at stage: ' || coalesce(p_failed_stage, 'unknown') end,
    terminal_at = now(),
    updated_at = now()
  where id = p_run_id;

  insert into public.research_stages (
    run_id, stage_name, status, progress_detail, error_message, started_at, completed_at
  ) values (
    p_run_id, 'Failed', 'Failed',
    case when v_research_unavailable
      then 'Mandatory research could not run. No market conclusion was produced.'
      else p_error_message end,
    p_error_message, now(), now()
  );
  update public.research_pipeline_metrics set
    terminal_failure_reason = p_error_message, updated_at = now()
  where run_id = p_run_id;
  insert into public.error_logs (run_id, context, error_message)
  values (
    p_run_id,
    case when v_research_unavailable
      then 'research_unavailable:' || coalesce(p_failed_stage, 'unknown')
      else 'terminal_failure:' || coalesce(p_failed_stage, 'unknown') end,
    p_error_message
  );
  update public.research_jobs set
    status = 'dead_letter',
    error_class = case when v_research_unavailable then 'research_unavailable' else 'permanent' end,
    error_message = 'Run terminated: ' || p_error_message,
    completed_at = now(), updated_at = now()
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
  select status, mode into v_status, v_mode from public.research_runs
  where id = p_run_id for update;
  if v_status = 'Completed' then return 'Completed'; end if;
  if v_status in ('Failed', 'Cancelled') then
    raise exception 'RUN_ALREADY_TERMINAL: %', v_status;
  end if;
  select rv.id into v_version_id from public.reports r
  join public.report_versions rv on rv.report_id = r.id
  where r.run_id = p_run_id
  order by rv.version_number desc, rv.created_at desc limit 1;
  if v_version_id is null then
    raise exception 'REPORT_NOT_PUBLICATION_READY: immutable version missing';
  end if;
  select count(distinct format) into v_export_count from public.report_exports
  where report_version_id = v_version_id and format in ('pdf','markdown','csv','json');
  select count(*) into v_chart_count from public.report_chart_datasets
  where report_version_id = v_version_id;
  if v_export_count <> 4 or v_chart_count < 4 then
    raise exception 'REPORT_NOT_PUBLICATION_READY: exports %, charts %', v_export_count, v_chart_count;
  end if;
  select count(*) into v_evidence_count from public.evidence_items
  where run_id = p_run_id and excluded = false;
  update public.research_runs set
    status = 'Completed',
    research_outcome = case when v_evidence_count = 0
      then 'insufficient_evidence' else 'research_completed' end,
    progress = 100, progress_detail = 'Research complete',
    terminal_at = now(), updated_at = now()
  where id = p_run_id;
  insert into public.research_stages (
    run_id, stage_name, status, progress_detail, started_at, completed_at
  ) values (p_run_id, 'Completed', 'Completed', 'Research complete', now(), now());
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
