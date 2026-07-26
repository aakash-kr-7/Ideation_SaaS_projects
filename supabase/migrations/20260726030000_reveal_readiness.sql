-- Reveal-readiness controls: scoped smoke consumers, private owner assets,
-- operational alerts, and a richer customer-safe research activity snapshot.

create or replace function public.claim_research_job_for_run(
  p_worker_id text,
  p_visibility_timeout_ms integer,
  p_run_id uuid
) returns setof public.research_jobs
language plpgsql security definer set search_path=public as $$
declare v_job public.research_jobs;
begin
  select j.* into v_job
  from public.research_jobs j
  join public.research_runs r on r.id=j.run_id
  where j.run_id=p_run_id
    and j.status='pending'
    and j.visible_after<=now()
    and r.status not in ('Completed','Failed','Cancelled')
  order by j.created_at asc
  limit 1 for update of j skip locked;
  if v_job.id is null then return; end if;
  update public.research_jobs
  set status='claimed', claimed_by=p_worker_id, claimed_at=now(),
      attempt_count=attempt_count+1,
      visible_after=now()+(p_visibility_timeout_ms||' milliseconds')::interval,
      updated_at=now()
  where id=v_job.id;
  insert into public.research_job_attempts(job_id,run_id,stage,attempt_number)
  values(v_job.id,v_job.run_id,v_job.stage,v_job.attempt_count+1);
  update public.research_runs
  set current_stage=v_job.stage,current_stage_started_at=now(),
      last_progress_at=now(),updated_at=now()
  where id=v_job.run_id;
  return query select * from public.research_jobs where id=v_job.id;
end; $$;

create or replace function public.count_pending_research_jobs_for_run(p_run_id uuid)
returns integer language sql security definer set search_path=public as $$
  select count(*)::integer from public.research_jobs j
  join public.research_runs r on r.id=j.run_id
  where j.run_id=p_run_id and j.status='pending' and j.visible_after<=now()
    and r.status not in ('Completed','Failed','Cancelled');
$$;

create or replace function public.recover_stale_research_jobs_for_run(
  p_stale_threshold_ms integer,
  p_run_id uuid
) returns integer language plpgsql security definer set search_path=public as $$
declare v_count integer;
begin
  with recovered as (
    update public.research_jobs
    set status='pending',claimed_by=null,claimed_at=null,updated_at=now(),
        visible_after=now(),error_class='stale_claim',
        error_message='Recovered by scoped scheduler health check'
    where run_id=p_run_id and status='claimed'
      and claimed_at < now()-(p_stale_threshold_ms||' milliseconds')::interval
    returning id
  ) select count(*)::integer into v_count from recovered;
  return v_count;
end; $$;

revoke all on function public.claim_research_job_for_run(text,integer,uuid) from public,anon,authenticated;
revoke all on function public.count_pending_research_jobs_for_run(uuid) from public,anon,authenticated;
revoke all on function public.recover_stale_research_jobs_for_run(integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_research_job_for_run(text,integer,uuid) to service_role;
grant execute on function public.count_pending_research_jobs_for_run(uuid) to service_role;
grant execute on function public.recover_stale_research_jobs_for_run(integer,uuid) to service_role;

update storage.buckets set public=false, file_size_limit=5242880
where id='user-assets';
drop policy if exists "Public Access to user-assets" on storage.objects;
drop policy if exists "Authenticated users can upload user-assets" on storage.objects;
drop policy if exists "Owners can read user-assets" on storage.objects;
drop policy if exists "Owners can upload user-assets" on storage.objects;
drop policy if exists "Owners can update user-assets" on storage.objects;
drop policy if exists "Owners can delete user-assets" on storage.objects;
create policy "Owners can read user-assets" on storage.objects for select to authenticated
  using (bucket_id='user-assets' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Owners can upload user-assets" on storage.objects for insert to authenticated
  with check (bucket_id='user-assets' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Owners can update user-assets" on storage.objects for update to authenticated
  using (bucket_id='user-assets' and (storage.foldername(name))[1]=auth.uid()::text)
  with check (bucket_id='user-assets' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "Owners can delete user-assets" on storage.objects for delete to authenticated
  using (bucket_id='user-assets' and (storage.foldername(name))[1]=auth.uid()::text);

create table if not exists public.operational_alerts (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references public.research_runs(id) on delete cascade,
  alert_type text not null,
  severity text not null check (severity in ('warning','critical')),
  fingerprint text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique(fingerprint,status)
);
alter table public.operational_alerts enable row level security;
alter table public.operational_alerts force row level security;
revoke all on public.operational_alerts from public,anon,authenticated;
grant all on public.operational_alerts to service_role;

create table if not exists public.workspace_research_limits (
  team_id uuid primary key references public.teams(id) on delete cascade,
  reports_per_day integer not null default 50 check (reports_per_day between 1 and 500),
  reports_per_user_per_hour integer not null default 12 check (reports_per_user_per_hour between 1 and 100),
  provider_spend_per_day_usd numeric not null default 100 check (provider_spend_per_day_usd > 0),
  updated_at timestamptz not null default now()
);
alter table public.workspace_research_limits enable row level security;
alter table public.workspace_research_limits force row level security;
create policy "Team admins can read workspace research limits"
on public.workspace_research_limits for select to authenticated using (
  exists(select 1 from public.team_members tm
    where tm.team_id=workspace_research_limits.team_id
      and tm.user_id=auth.uid() and tm.role in ('owner','admin'))
);
revoke all on public.workspace_research_limits from public,anon;
grant select on public.workspace_research_limits to authenticated;
grant all on public.workspace_research_limits to service_role;

create or replace function public.enforce_workspace_research_ceiling()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_team_id uuid;
  v_limits public.workspace_research_limits;
  v_team_reports integer;
  v_user_reports integer;
  v_spend numeric;
begin
  select team_id into v_team_id from public.projects where id=new.project_id;
  insert into public.workspace_research_limits(team_id) values(v_team_id) on conflict do nothing;
  select * into v_limits from public.workspace_research_limits where team_id=v_team_id;
  select count(*)::integer into v_team_reports
  from public.research_runs rr join public.projects p on p.id=rr.project_id
  where p.team_id=v_team_id and rr.created_at>=date_trunc('day',now());
  select count(*)::integer into v_user_reports
  from public.research_runs rr
  where rr.created_by=new.created_by and rr.created_at>=now()-interval '1 hour';
  select coalesce(sum(l.cost),0) into v_spend
  from public.api_usage_logs l
  join public.research_runs rr on rr.id=l.run_id
  join public.projects p on p.id=rr.project_id
  where p.team_id=v_team_id and l.created_at>=date_trunc('day',now());
  if v_team_reports>=v_limits.reports_per_day then raise exception 'WORKSPACE_REPORT_FREQUENCY_LIMIT'; end if;
  if v_user_reports>=v_limits.reports_per_user_per_hour then raise exception 'USER_REPORT_FREQUENCY_LIMIT'; end if;
  if v_spend>=v_limits.provider_spend_per_day_usd then raise exception 'WORKSPACE_SPEND_LIMIT'; end if;
  return new;
end; $$;
drop trigger if exists enforce_workspace_research_ceiling on public.research_runs;
create trigger enforce_workspace_research_ceiling before insert on public.research_runs
for each row execute function public.enforce_workspace_research_ceiling();

create or replace function public.collect_research_operational_alerts()
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_failed integer; v_stuck integer; v_quota integer; v_depth integer;
begin
  insert into public.operational_alerts(run_id,alert_type,severity,fingerprint,details)
  select rr.id,'failed_run','critical','failed:'||rr.id,
    jsonb_build_object('status',rr.status,'stage',rr.current_stage,'occurredAt',rr.terminal_at)
  from public.research_runs rr
  where rr.status='Failed' and rr.terminal_at>now()-interval '1 day'
  on conflict(fingerprint,status) do nothing;
  get diagnostics v_failed = row_count;

  insert into public.operational_alerts(run_id,alert_type,severity,fingerprint,details)
  select rr.id,'stuck_run','critical','stuck:'||rr.id,
    jsonb_build_object('stage',rr.current_stage,'lastProgressAt',rr.last_progress_at)
  from public.research_runs rr
  where rr.status not in ('Completed','Failed','Cancelled')
    and rr.last_progress_at<now()-interval '15 minutes'
  on conflict(fingerprint,status) do nothing;
  get diagnostics v_stuck = row_count;

  insert into public.operational_alerts(run_id,alert_type,severity,fingerprint,details)
  select m.run_id,'provider_degraded','warning','provider:'||m.run_id,
    jsonb_build_object('quotaBlocked',m.grounded_calls_quota_blocked,'providers',m.degraded_providers)
  from public.research_pipeline_metrics m
  join public.research_runs rr on rr.id=m.run_id
  where (m.grounded_calls_quota_blocked>0 or m.grounding_degraded)
    and rr.created_at>now()-interval '1 day'
  on conflict(fingerprint,status) do nothing;
  get diagnostics v_quota = row_count;

  select count(*)::integer into v_depth
  from public.research_jobs where status='pending' and visible_after<=now();
  if v_depth>=20 then
    insert into public.operational_alerts(alert_type,severity,fingerprint,details)
    values('queue_depth','warning','queue-depth:'||date_trunc('hour',now()),jsonb_build_object('pending',v_depth))
    on conflict(fingerprint,status) do nothing;
  end if;
  return jsonb_build_object('failedRuns',v_failed,'stuckRuns',v_stuck,'providerAlerts',v_quota,'queueDepth',v_depth,'checkedAt',now());
end; $$;
revoke all on function public.collect_research_operational_alerts() from public,anon,authenticated;
grant execute on function public.collect_research_operational_alerts() to service_role;

create or replace function public.get_research_activity_detail(p_run_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
begin
  if not exists(
    select 1 from public.research_runs rr
    join public.projects p on p.id=rr.project_id
    join public.team_members tm on tm.team_id=p.team_id
    where rr.id=p_run_id and tm.user_id=auth.uid()
  ) then raise exception 'RESEARCH_RUN_NOT_FOUND' using errcode='P0002'; end if;
  return jsonb_build_object(
    'queries',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',q.id,'objective',q.query_family,'family',q.query_family,
        'query',replace(q.query_family,'_',' '),'status','Persisted',
        'resultCount',q.result_count,'createdAt',q.created_at,'completedAt',null
      ) order by q.created_at)
      from (
        select min(a.id::text)::uuid id,a.query_family,count(*)::integer result_count,min(a.created_at) created_at
        from public.source_retrieval_audit a
        where a.run_id=p_run_id and nullif(a.query_family,'') is not null
        group by a.query_family
      ) q
    ),'[]'::jsonb),
    'contradictions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',c.id,'claim',c.tested_claim,'relationship',c.relationship,
        'resolution',c.resolution_status,
        'supportingCount',cardinality(c.supporting_evidence_ids),
        'challengingCount',cardinality(c.challenging_evidence_ids),
        'createdAt',c.created_at
      ) order by c.created_at) from public.evidence_contradictions c where c.run_id=p_run_id
    ),'[]'::jsonb),
    'specialists',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',s.id,'specialist',s.agent_name,'status',s.status,
        'attemptCount',s.attempt_count,'createdAt',s.created_at
      ) order by s.created_at)
      from public.reasoning_agent_outputs s
      where s.run_id=p_run_id and s.agent_name<>'final_judge'
    ),'[]'::jsonb),
    'brief',(
      select jsonb_build_object(
        'product',b.exact_product_proposition,'buyer',b.target_buyer,
        'workflow',b.workflow_changed,'problem',b.problem_solved,
        'outcome',b.expected_outcome
      ) from public.research_briefs b where b.run_id=p_run_id
    ),
    'retrievalDecisions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',a.id,'relevanceClass',a.relevance_class,
        'acceptanceDecision',a.acceptance_decision,
        'mismatchReasons',a.mismatch_reasons,
        'matchedDimensions',a.matched_brief_dimensions
      )) from public.source_retrieval_audit a where a.run_id=p_run_id
    ),'[]'::jsonb),
    'evidenceDecisions',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',e.id,'relevanceClass',e.relevance_class,
        'acceptanceDecision',e.acceptance_decision,'topic',e.evidence_topic,
        'mismatchReasons',e.mismatch_reasons,
        'matchedDimensions',e.matched_brief_dimensions
      )) from public.evidence_items e where e.run_id=p_run_id
    ),'[]'::jsonb)
  );
end; $$;
revoke all on function public.get_research_activity_detail(uuid) from public,anon;
grant execute on function public.get_research_activity_detail(uuid) to authenticated;

-- Immutable reports remain immutable for product paths. This narrowly-scoped,
-- service-only cleanup exists so isolated release tests can remove their own
-- namespace even when cascading through immutable report artifacts.
create or replace function public.reject_report_version_mutation()
returns trigger language plpgsql as $$
begin
  if current_setting('app.isolated_test_cleanup',true)='on' then return old; end if;
  raise exception 'report_versions are immutable after creation';
end; $$;
create or replace function public.reject_chart_dataset_mutation()
returns trigger language plpgsql as $$
begin
  if current_setting('app.isolated_test_cleanup',true)='on' then return old; end if;
  raise exception 'report_chart_datasets are immutable after creation';
end; $$;
create or replace function public.cleanup_isolated_test_team(p_team_id uuid)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_name text;
begin
  if auth.role()<>'service_role' then raise exception 'TEST_CLEANUP_DENIED'; end if;
  select name into v_name from public.teams where id=p_team_id for update;
  if v_name is null then return true; end if;
  if v_name !~ '^(rls-|worker smoke|scheduler smoke|reveal-proof-)' then
    raise exception 'TEST_CLEANUP_NAMESPACE_MISMATCH';
  end if;
  perform set_config('app.isolated_test_cleanup','on',true);
  delete from public.teams where id=p_team_id;
  return true;
end; $$;
revoke all on function public.cleanup_isolated_test_team(uuid) from public,anon,authenticated;
grant execute on function public.cleanup_isolated_test_team(uuid) to service_role;

notify pgrst, 'reload schema';
