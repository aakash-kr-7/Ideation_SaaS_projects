-- Forward-only cleanup: make the Gemini hybrid pipeline the sole research engine.

do $$
declare legacy_run record;
begin
  for legacy_run in
    select distinct run_id from public.research_jobs
    where stage not in ('plan','grounded_research','evidence_boosters','validate_normalize','analyze_score','generate_report','generate_exports','complete')
      and status in ('pending','claimed')
  loop
    update public.research_jobs set status='dead_letter', error_class='permanent',
      error_message='Retired research engine removed during Gemini hybrid migration', completed_at=now(), updated_at=now()
    where run_id=legacy_run.run_id and status in ('pending','claimed');
    perform public.terminate_research_run(legacy_run.run_id, 'permanent', 'Retired research engine removed during Gemini hybrid migration', 'migration');
  end loop;
end $$;

alter table public.research_jobs drop constraint if exists research_jobs_canonical_stage_check;
alter table public.research_jobs add constraint research_jobs_canonical_stage_check check (
  stage in ('plan','grounded_research','evidence_boosters','validate_normalize','analyze_score','generate_report','generate_exports','complete')
) not valid;

drop function if exists public.complete_research_job(uuid,jsonb,text,jsonb,integer,integer,integer,text,jsonb,integer,text,boolean,text[]);
drop function if exists public.complete_research_job(uuid,jsonb,text,jsonb,integer,integer,integer,text,jsonb);
create function public.complete_research_job(
  p_job_id uuid, p_output_meta jsonb default '{}'::jsonb, p_next_stage text default null,
  p_next_input_meta jsonb default '{}'::jsonb, p_next_stage_iteration integer default 0,
  p_next_batch_index integer default 0, p_next_batch_size integer default 0,
  p_next_job_purpose text default 'stage', p_metrics jsonb default '{}'::jsonb,
  p_next_shard_key text default null
) returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.research_jobs; run_status text; next_id uuid; attempt_id uuid; new_key text;
begin
  select * into j from public.research_jobs where id=p_job_id for update;
  if j.id is null then raise exception 'JOB_NOT_FOUND'; end if;
  if j.status='completed' then return jsonb_build_object('status','already_completed','job_id',j.id,'output_meta',j.output_meta); end if;
  if j.status <> 'claimed' then raise exception 'JOB_NOT_CLAIMED: current status is %',j.status; end if;
  select status into run_status from public.research_runs where id=j.run_id for update;
  if run_status in ('Completed','Failed','Cancelled') then
    update public.research_jobs set status='dead_letter',error_class='permanent',error_message='Run terminal',completed_at=now(),updated_at=now() where id=j.id;
    return jsonb_build_object('status','run_terminal','job_id',j.id);
  end if;
  if p_next_stage is not null and p_next_stage not in ('plan','grounded_research','evidence_boosters','validate_normalize','analyze_score','generate_report','generate_exports','complete') then
    raise exception 'INVALID_PIPELINE_STAGE: %',p_next_stage;
  end if;
  update public.research_jobs set status='completed',output_meta=p_output_meta,completed_at=now(),updated_at=now() where id=j.id;
  select id into attempt_id from public.research_job_attempts where job_id=j.id and status='started' order by created_at desc limit 1;
  if attempt_id is not null then
    update public.research_job_attempts set status='completed',completed_at=now(),duration_ms=extract(epoch from now()-started_at)::integer*1000,
      provider_cost_usd=coalesce((p_metrics->>'provider_cost_usd')::numeric,0),tokens_used=coalesce(p_metrics->'tokens_used','{}'::jsonb) where id=attempt_id;
  end if;
  insert into public.research_pipeline_cursors(run_id,research_cycle,current_stage,stage_iteration,next_batch_index,last_completed_job_id,last_progress_at,coverage_requested_cycle,coverage_gaps,terminalization_started)
  values(j.run_id,j.research_cycle,p_next_stage,p_next_stage_iteration,p_next_batch_index,j.id,now(),false,'{}',p_next_stage is null)
  on conflict(run_id) do update set research_cycle=excluded.research_cycle,current_stage=excluded.current_stage,stage_iteration=excluded.stage_iteration,
    next_batch_index=excluded.next_batch_index,last_completed_job_id=excluded.last_completed_job_id,last_progress_at=excluded.last_progress_at,
    coverage_requested_cycle=false,coverage_gaps='{}',terminalization_started=excluded.terminalization_started,updated_at=now();
  update public.research_runs set last_progress_at=now(),updated_at=now() where id=j.run_id;
  update public.research_pipeline_metrics set updated_at=now(),stage_timings=stage_timings || jsonb_build_object(j.logical_key,p_metrics) where run_id=j.run_id;
  if p_next_stage is not null then
    new_key:=concat_ws('|',j.run_id::text,j.research_cycle::text,p_next_stage,p_next_stage_iteration::text,p_next_batch_index::text,coalesce(p_next_shard_key,''));
    select public.enqueue_research_job(j.run_id,p_next_stage,p_next_input_meta,p_next_stage_iteration,p_next_batch_index,p_next_batch_size,p_next_job_purpose,j.id,3,now(),j.research_cycle,p_next_shard_key,new_key) into next_id;
  end if;
  return jsonb_build_object('status','completed','job_id',j.id,'next_job_id',next_id,'research_cycle',j.research_cycle);
end $$;
revoke all on function public.complete_research_job(uuid,jsonb,text,jsonb,integer,integer,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.complete_research_job(uuid,jsonb,text,jsonb,integer,integer,integer,text,jsonb,text) to service_role;

alter table public.evidence_items add column if not exists claim_fingerprint text;
create unique index if not exists evidence_items_run_claim_fingerprint on public.evidence_items(run_id,claim_fingerprint) where claim_fingerprint is not null;
create unique index if not exists competitors_opportunity_name on public.competitors(opportunity_id,name);
create unique index if not exists risks_opportunity_category_description on public.risks(opportunity_id,category,description);
create unique index if not exists score_evidence_refs_unique on public.score_evidence_refs(score_breakdown_id,evidence_id);
alter table public.research_pipeline_metrics add column if not exists cache_hits integer not null default 0;
alter table public.research_pipeline_metrics add column if not exists total_duration_ms bigint not null default 0;

alter table public.sources drop constraint if exists sources_research_query_id_fkey;
drop table if exists public.research_passes cascade;
drop table if exists public.research_queries cascade;
drop table if exists public.source_registry cascade;
drop table if exists public.public_retrieval_cache cascade;
drop table if exists public.cached_research cascade;
drop table if exists public.search_cache cascade;
drop table if exists public.background_jobs cascade;
drop table if exists public.specialist_checks cascade;

alter table public.sources
  drop column if exists research_query_id,
  drop column if exists query_family,
  drop column if exists candidate_score,
  drop column if exists content_hash,
  drop column if exists etag,
  drop column if exists last_modified,
  drop column if exists fetched_at,
  drop column if exists fetch_status,
  drop column if exists extraction_strategy,
  drop column if exists extraction_version,
  drop column if exists extracted_at,
  drop column if exists rejection_reason,
  drop column if exists research_pass,
  drop column if exists tier_reason,
  drop column if exists exclusion_reason,
  drop column if exists author;

revoke all on public.gemini_cache, public.api_usage_logs, public.research_jobs, public.research_job_attempts,
  public.research_pipeline_metrics, public.research_pipeline_cursors from anon, authenticated;
grant all on public.gemini_cache, public.api_usage_logs, public.research_jobs, public.research_job_attempts,
  public.research_pipeline_metrics, public.research_pipeline_cursors to service_role;

notify pgrst, 'reload schema';
