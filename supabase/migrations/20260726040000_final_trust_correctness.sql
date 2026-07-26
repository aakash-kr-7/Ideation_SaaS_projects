-- Final trust/correctness controls. Customer report reads are resolved in one
-- database snapshot, after tenant ownership has been proved inside PostgreSQL.

create or replace function public.get_owned_latest_report(p_run_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.research_runs;
  v_report public.reports;
  v_version public.report_versions;
begin
  if auth.role() <> 'service_role' or p_user_id is null then
    return jsonb_build_object('state', 'access_denied');
  end if;

  select rr.* into v_run
  from public.research_runs rr
  join public.projects p on p.id = rr.project_id
  join public.team_members tm on tm.team_id = p.team_id
  where rr.id = p_run_id and tm.user_id = p_user_id;

  if v_run.id is null then
    return jsonb_build_object('state', 'access_denied');
  end if;

  select r.* into v_report
  from public.reports r
  where r.run_id = p_run_id;

  if v_report.id is null then
    return jsonb_build_object(
      'state', 'pending',
      'runStatus', v_run.status,
      'reason', 'report_transaction_not_visible'
    );
  end if;

  select rv.* into v_version
  from public.report_versions rv
  where rv.report_id = v_report.id
  order by rv.version_number desc, rv.created_at desc
  limit 1;

  if v_version.id is null then
    return jsonb_build_object(
      'state', 'pending',
      'runStatus', v_run.status,
      'reason', 'immutable_version_transaction_not_visible'
    );
  end if;

  return jsonb_build_object(
    'state', 'ready',
    'runId', p_run_id,
    'runStatus', v_run.status,
    'reportId', v_report.id,
    'reportVersionId', v_version.id,
    'versionNumber', v_version.version_number,
    'payload', v_version.payload,
    'exports', coalesce((
      select jsonb_agg(jsonb_build_object(
        'format', e.format,
        'storage_path', e.storage_path,
        'byte_size', e.byte_size
      ) order by e.format)
      from public.report_exports e
      where e.report_version_id = v_version.id
    ), '[]'::jsonb),
    'charts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'chart_key', c.chart_key,
        'chart_type', c.chart_type,
        'source_data', c.source_data,
        'chart_config', c.chart_config,
        'supporting_evidence_ids', c.supporting_evidence_ids
      ) order by c.chart_key)
      from public.report_chart_datasets c
      where c.report_version_id = v_version.id
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_owned_latest_report(uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_owned_latest_report(uuid, uuid) to service_role;

alter table public.competitors
  add column if not exists classification text not null default 'adjacent'
    check (classification in ('direct', 'adjacent', 'substitute', 'workflow_workaround')),
  add column if not exists comparability jsonb not null default '{}'::jsonb;

alter table public.evidence_contradictions
  add column if not exists proposition text,
  add column if not exists segment_applicability text,
  add column if not exists geography_applicability text,
  add column if not exists contradiction_status text,
  add column if not exists unresolved_implication text;

update public.evidence_contradictions
set proposition = coalesce(proposition, tested_claim),
    contradiction_status = coalesce(contradiction_status, resolution_status),
    unresolved_implication = coalesce(unresolved_implication, resolution_note)
where proposition is null
   or contradiction_status is null
   or unresolved_implication is null;

create table if not exists public.numeric_claim_validations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  evidence_item_id uuid references public.evidence_items(id) on delete cascade,
  claim_type text not null check (claim_type in (
    'price', 'price_range', 'plan_name', 'percentage', 'date', 'count', 'market_metric'
  )),
  narrative_value text not null,
  extracted_source_value text not null,
  normalized_value jsonb,
  source_url text not null,
  status text not null check (status in ('verified', 'flagged', 'rejected')),
  reason text,
  methodology_status text not null default 'not_applicable'
    check (methodology_status in ('attributable', 'vendor_reported', 'unverified', 'not_applicable')),
  created_at timestamptz not null default now()
);

alter table public.numeric_claim_validations enable row level security;
alter table public.numeric_claim_validations force row level security;
revoke all on public.numeric_claim_validations from public, anon, authenticated;
grant all on public.numeric_claim_validations to service_role;
create index if not exists numeric_claim_validations_run_idx
  on public.numeric_claim_validations(run_id, status, claim_type);

-- Completion is the customer-facing availability boundary. The terminal queue
-- transaction may not mark a run Completed until its canonical immutable
-- version, all four exports, and supported chart set are committed.
create or replace function public.finalize_research_run(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_version_id uuid;
  v_export_count integer;
  v_chart_count integer;
begin
  select status into v_status
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
    raise exception 'REPORT_NOT_PUBLICATION_READY: exports %, charts %', v_export_count, v_chart_count;
  end if;

  update public.research_runs set
    status = 'Completed',
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

revoke all on function public.finalize_research_run(uuid) from public, anon, authenticated;
grant execute on function public.finalize_research_run(uuid) to service_role;

notify pgrst, 'reload schema';
