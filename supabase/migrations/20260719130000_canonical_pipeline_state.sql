-- Canonical durable state for staged research.  A retry is an attempt on one
-- logical address, never a new logical address.

alter table public.research_jobs
  add column if not exists research_cycle integer not null default 0 check (research_cycle >= 0),
  add column if not exists shard_key text,
  add column if not exists logical_key text;

update public.research_jobs
set logical_key = concat_ws('|', run_id::text, research_cycle::text, stage, stage_iteration::text, batch_index::text, coalesce(shard_key, ''))
where logical_key is null;
alter table public.research_jobs alter column logical_key set not null;

drop index if exists public.idx_research_jobs_idempotency;
create unique index if not exists idx_research_jobs_stage_address
  on public.research_jobs(run_id, research_cycle, stage, stage_iteration, batch_index, coalesce(shard_key, ''));
create unique index if not exists idx_research_jobs_logical_key on public.research_jobs(logical_key);
create index if not exists idx_research_jobs_run_cycle on public.research_jobs(run_id, research_cycle, created_at);

alter table public.research_runs add column if not exists max_research_cycles integer not null default 3 check (max_research_cycles >= 0);

create table if not exists public.research_pipeline_cursors (
  run_id uuid primary key references public.research_runs(id) on delete cascade,
  research_cycle integer not null default 0 check (research_cycle >= 0),
  current_stage text,
  stage_iteration integer not null default 0,
  next_batch_index integer not null default 0,
  last_completed_job_id uuid references public.research_jobs(id) on delete set null,
  last_progress_at timestamptz not null default now(),
  coverage_requested_cycle boolean not null default false,
  coverage_gaps text[] not null default '{}',
  terminalization_started boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.research_pipeline_cursors enable row level security;
create policy "Team members can view pipeline cursors" on public.research_pipeline_cursors for select using (
  exists (select 1 from public.research_runs rr join public.projects p on p.id=rr.project_id where rr.id=research_pipeline_cursors.run_id and public.is_team_member(p.team_id, auth.uid()))
);

alter table public.research_queries add column if not exists research_cycle integer not null default 0 check (research_cycle >= 0);
drop index if exists public.idx_research_queries_run_pass_query;
create unique index if not exists idx_research_queries_run_cycle_query on public.research_queries(run_id, research_cycle, query);
create index if not exists idx_research_queries_run_cycle_status on public.research_queries(run_id, research_cycle, status);

alter table public.research_passes add column if not exists research_cycle integer not null default 0 check (research_cycle >= 0);
alter table public.research_passes drop constraint if exists research_passes_run_id_pass_number_key;
create unique index if not exists idx_research_passes_run_cycle_pass on public.research_passes(run_id, research_cycle, pass_number);

drop index if exists public.sources_run_canonical_url;
create unique index if not exists idx_sources_run_canonical_url on public.sources(run_id, canonical_url);
drop index if exists public.idx_sources_run_url;
create index if not exists idx_sources_run_extraction on public.sources(run_id, extraction_version, extracted_at);

drop function if exists public.enqueue_research_job(uuid,text,jsonb,integer,integer,integer,text,uuid,integer,timestamptz);
create function public.enqueue_research_job(
  p_run_id uuid, p_stage text, p_input_meta jsonb default '{}'::jsonb,
  p_stage_iteration integer default 0, p_batch_index integer default 0, p_batch_size integer default 0,
  p_job_purpose text default 'stage', p_parent_job_id uuid default null, p_max_attempts integer default 3,
  p_visible_after timestamptz default now(), p_research_cycle integer default 0, p_shard_key text default null,
  p_logical_key text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_job_id uuid; v_status text; v_total integer; v_max integer; v_key text;
begin
  select status, max_jobs_per_run into v_status, v_max from public.research_runs where id=p_run_id for update;
  if v_status is null then raise exception 'RUN_NOT_FOUND'; end if;
  if v_status in ('Completed','Failed','Cancelled') then raise exception 'RUN_ALREADY_TERMINAL: %', v_status; end if;
  v_key := coalesce(p_logical_key, concat_ws('|',p_run_id::text,p_research_cycle::text,p_stage,p_stage_iteration::text,p_batch_index::text,coalesce(p_shard_key,'')));
  insert into public.research_jobs(run_id,research_cycle,stage,stage_iteration,batch_index,batch_size,shard_key,logical_key,job_purpose,parent_job_id,max_attempts,input_meta,visible_after)
  values(p_run_id,p_research_cycle,p_stage,p_stage_iteration,p_batch_index,p_batch_size,p_shard_key,v_key,p_job_purpose,p_parent_job_id,p_max_attempts,p_input_meta,p_visible_after)
  on conflict (run_id,research_cycle,stage,stage_iteration,batch_index,(coalesce(shard_key,''))) do nothing returning id into v_job_id;
  if v_job_id is null then select id into v_job_id from public.research_jobs where logical_key=v_key; return v_job_id; end if;
  select count(*) into v_total from public.research_jobs where run_id=p_run_id;
  if v_total > v_max then raise exception 'MAX_JOBS_PER_RUN_EXCEEDED: % jobs', v_max; end if;
  insert into public.research_pipeline_metrics(run_id,total_jobs_created) values(p_run_id,1) on conflict(run_id) do update set total_jobs_created=research_pipeline_metrics.total_jobs_created+1,updated_at=now();
  insert into public.research_pipeline_cursors(run_id,research_cycle,current_stage,stage_iteration,next_batch_index) values(p_run_id,p_research_cycle,p_stage,p_stage_iteration,p_batch_index)
  on conflict(run_id) do nothing;
  return v_job_id;
end $$;

drop function if exists public.complete_research_job(uuid,jsonb,text,jsonb,integer,integer,integer,text,jsonb);
create function public.complete_research_job(
  p_job_id uuid, p_output_meta jsonb default '{}'::jsonb, p_next_stage text default null,
  p_next_input_meta jsonb default '{}'::jsonb, p_next_stage_iteration integer default 0,
  p_next_batch_index integer default 0, p_next_batch_size integer default 0,
  p_next_job_purpose text default 'stage', p_metrics jsonb default '{}'::jsonb,
  p_next_research_cycle integer default null, p_next_shard_key text default null,
  p_start_new_research_cycle boolean default false, p_coverage_gaps text[] default '{}'
) returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.research_jobs; run_status text; max_cycles integer; next_cycle integer; next_stage text:=p_next_stage; next_id uuid; attempt_id uuid; new_key text;
begin
 select * into j from public.research_jobs where id=p_job_id for update;
 if j.id is null then raise exception 'JOB_NOT_FOUND'; end if;
 if j.status='completed' then return jsonb_build_object('status','already_completed','job_id',j.id,'output_meta',j.output_meta); end if;
 if j.status <> 'claimed' then raise exception 'JOB_NOT_CLAIMED: current status is %',j.status; end if;
 select status,max_research_cycles into run_status,max_cycles from public.research_runs where id=j.run_id for update;
 if run_status in ('Completed','Failed','Cancelled') then update public.research_jobs set status='dead_letter',error_class='permanent',error_message='Run terminal',completed_at=now() where id=j.id; return jsonb_build_object('status','run_terminal','job_id',j.id); end if;
 next_cycle:=coalesce(p_next_research_cycle,j.research_cycle);
 if p_start_new_research_cycle then
   if j.research_cycle >= max_cycles then next_stage:='build_specialist_packs'; next_cycle:=j.research_cycle;
   else next_cycle:=j.research_cycle+1; end if;
 end if;
 update public.research_jobs set status='completed',output_meta=p_output_meta,completed_at=now(),updated_at=now() where id=j.id;
 select id into attempt_id from public.research_job_attempts where job_id=j.id and status='started' order by created_at desc limit 1;
 if attempt_id is not null then update public.research_job_attempts set status='completed',completed_at=now(),duration_ms=extract(epoch from now()-started_at)::integer*1000,provider_cost_usd=coalesce((p_metrics->>'provider_cost_usd')::numeric,0),tokens_used=coalesce(p_metrics->'tokens_used','{}'::jsonb) where id=attempt_id; end if;
 insert into public.research_pipeline_cursors(run_id,research_cycle,current_stage,stage_iteration,next_batch_index,last_completed_job_id,last_progress_at,coverage_requested_cycle,coverage_gaps,terminalization_started)
 values(j.run_id,next_cycle,next_stage,p_next_stage_iteration,p_next_batch_index,j.id,now(),p_start_new_research_cycle,p_coverage_gaps,p_next_stage is null)
 on conflict(run_id) do update set research_cycle=excluded.research_cycle,current_stage=excluded.current_stage,stage_iteration=excluded.stage_iteration,next_batch_index=excluded.next_batch_index,last_completed_job_id=excluded.last_completed_job_id,last_progress_at=excluded.last_progress_at,coverage_requested_cycle=excluded.coverage_requested_cycle,coverage_gaps=excluded.coverage_gaps,terminalization_started=excluded.terminalization_started,updated_at=now();
 update public.research_runs set last_progress_at=now(),updated_at=now() where id=j.run_id;
 update public.research_pipeline_metrics set updated_at=now(),stage_timings=stage_timings || jsonb_build_object(j.logical_key,p_metrics) where run_id=j.run_id;
 if next_stage is not null then
   new_key:=concat_ws('|',j.run_id::text,next_cycle::text,next_stage,p_next_stage_iteration::text,p_next_batch_index::text,coalesce(p_next_shard_key,''));
   select public.enqueue_research_job(j.run_id,next_stage,p_next_input_meta,p_next_stage_iteration,p_next_batch_index,p_next_batch_size,p_next_job_purpose,j.id,3,now(),next_cycle,p_next_shard_key,new_key) into next_id;
 end if;
 return jsonb_build_object('status','completed','job_id',j.id,'next_job_id',next_id,'research_cycle',next_cycle);
end $$;

revoke all on function public.enqueue_research_job(uuid,text,jsonb,integer,integer,integer,text,uuid,integer,timestamptz,integer,text,text) from public,anon,authenticated;
grant execute on function public.enqueue_research_job(uuid,text,jsonb,integer,integer,integer,text,uuid,integer,timestamptz,integer,text,text) to service_role;
revoke all on function public.complete_research_job(uuid,jsonb,text,jsonb,integer,integer,integer,text,jsonb,integer,text,boolean,text[]) from public,anon,authenticated;
grant execute on function public.complete_research_job(uuid,jsonb,text,jsonb,integer,integer,integer,text,jsonb,integer,text,boolean,text[]) to service_role;

-- Failure and cancellation are terminal cursor transitions too; neither path
-- may leave a resumable cursor pointing at work that can no longer run.
create or replace function public.fail_research_job(p_job_id uuid, p_error_class text, p_error_message text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare j public.research_jobs; retrying boolean; attempt_id uuid;
begin
 select * into j from public.research_jobs where id=p_job_id for update;
 if j.id is null then raise exception 'JOB_NOT_FOUND'; end if;
 if j.status in ('completed','dead_letter','failed') then return jsonb_build_object('status',j.status,'job_id',j.id,'retried',false); end if;
 if j.status <> 'claimed' then return jsonb_build_object('status','not_claimed','job_id',j.id,'retried',false); end if;
 retrying:=p_error_class='transient' and j.attempt_count < j.max_attempts;
 if retrying then update public.research_jobs set status='pending',error_class=p_error_class,error_message=p_error_message,visible_after=now()+(power(2,j.attempt_count)||' seconds')::interval,updated_at=now() where id=j.id;
 else
   update public.research_jobs set status='dead_letter',error_class=p_error_class,error_message=p_error_message,completed_at=now(),updated_at=now() where id=j.id;
   update public.research_pipeline_cursors set terminalization_started=true,last_progress_at=now(),updated_at=now() where run_id=j.run_id;
   perform public.terminate_research_run(j.run_id,p_error_class,p_error_message,j.stage);
 end if;
 select id into attempt_id from public.research_job_attempts where job_id=j.id and status='started' order by created_at desc limit 1;
 if attempt_id is not null then update public.research_job_attempts set status='failed',completed_at=now(),error_class=p_error_class,error_message=p_error_message,duration_ms=extract(epoch from now()-started_at)::integer*1000 where id=attempt_id; end if;
 return jsonb_build_object('status',case when retrying then 'pending' else 'dead_letter' end,'job_id',j.id,'retried',retrying);
end $$;

create or replace function public.cancel_research_run(p_run_id uuid, p_reason text default 'Cancelled by user')
returns text language plpgsql security definer set search_path=public as $$
declare v_run public.research_runs%rowtype;
begin
 select * into v_run from public.research_runs where id=p_run_id for update;
 if v_run.id is null or v_run.created_by<>auth.uid() or not public.is_team_member((select team_id from public.projects where id=v_run.project_id),auth.uid()) then raise exception 'RUN_ACCESS_DENIED'; end if;
 if v_run.status='Cancelled' then return 'Cancelled'; end if;
 if v_run.status in ('Completed','Failed') then raise exception 'RUN_ALREADY_TERMINAL: %',v_run.status; end if;
 update public.research_runs set status='Cancelled',progress=100,error_message=p_reason,progress_detail='Research cancelled',terminal_at=now(),updated_at=now() where id=p_run_id;
 insert into public.research_stages(run_id,stage_name,status,progress_detail,error_message,started_at,completed_at) values(p_run_id,'Cancelled','Cancelled','Research cancelled',p_reason,now(),now());
 insert into public.error_logs(run_id,context,error_message) values(p_run_id,'research_cancelled',p_reason);
 update public.research_jobs set status='dead_letter',error_class='cancelled',error_message=p_reason,completed_at=now(),updated_at=now() where run_id=p_run_id and status='pending';
 update public.research_pipeline_cursors set terminalization_started=true,last_progress_at=now(),updated_at=now() where run_id=p_run_id;
 perform public.finalize_research_credit(p_run_id,'restore');
 return 'Cancelled';
end $$;
notify pgrst, 'reload schema';
