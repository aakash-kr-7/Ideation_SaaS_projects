-- Targeted execution repairs: queue mutations are valid only for active claimed work,
-- and terminal transitions/credit finalization remain exactly-once under retries.

create or replace function public.finalize_research_credit(p_run_id uuid, p_outcome text)
returns text language plpgsql security definer set search_path=public as $$
declare v_reservation public.credit_reservations%rowtype;
begin
  if auth.role()<>'service_role' and not exists (select 1 from public.research_runs rr where rr.id=p_run_id and rr.created_by=auth.uid() and rr.status in ('Failed','Cancelled') and rr.credit_state='reserved') then raise exception 'CREDIT_FINALIZATION_DENIED'; end if;
  if p_outcome not in ('consume','restore') then raise exception 'INVALID_CREDIT_OUTCOME'; end if;
  select * into v_reservation from public.credit_reservations where run_id=p_run_id for update;
  if not found then if exists(select 1 from public.research_runs where id=p_run_id and credit_state='legacy') then return 'legacy'; end if; raise exception 'CREDIT_RESERVATION_NOT_FOUND'; end if;
  if v_reservation.status<>'reserved' then return v_reservation.status; end if;
  if p_outcome='consume' then
    update public.credit_reservations set status='consumed',finalized_at=now() where id=v_reservation.id;
    if v_reservation.credit_source='paid' then update public.team_credit_accounts set reserved_paid_credits=reserved_paid_credits-v_reservation.credit_cost where team_id=v_reservation.team_id; end if;
    update public.research_runs set credit_state='consumed' where id=p_run_id;
    insert into public.credit_ledger(team_id,run_id,reservation_id,event_type,metadata) values(v_reservation.team_id,p_run_id,v_reservation.id,'consume',jsonb_build_object('report_mode',v_reservation.report_mode));
    return 'consumed';
  end if;
  update public.credit_reservations set status='restored',finalized_at=now() where id=v_reservation.id;
  if v_reservation.credit_source='paid' then update public.team_credit_accounts set paid_credits=paid_credits+v_reservation.credit_cost,reserved_paid_credits=reserved_paid_credits-v_reservation.credit_cost where team_id=v_reservation.team_id;
  else update public.team_credit_accounts set free_quick_scans_remaining=least(1,free_quick_scans_remaining+1) where team_id=v_reservation.team_id; end if;
  update public.research_runs set credit_state='restored' where id=p_run_id;
  insert into public.credit_ledger(team_id,run_id,reservation_id,event_type,paid_credit_delta,free_credit_delta,metadata) values(v_reservation.team_id,p_run_id,v_reservation.id,'restore',case when v_reservation.credit_source='paid' then v_reservation.credit_cost else 0 end,case when v_reservation.credit_source='free_monthly' then 1 else 0 end,jsonb_build_object('report_mode',v_reservation.report_mode));
  return 'restored';
end; $$;

create or replace function public.complete_research_job(
  p_job_id uuid, p_output_meta jsonb default '{}'::jsonb, p_next_stage text default null,
  p_next_input_meta jsonb default '{}'::jsonb, p_next_stage_iteration integer default 0,
  p_next_batch_index integer default 0, p_next_batch_size integer default 0,
  p_next_job_purpose text default 'stage', p_metrics jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_job public.research_jobs; v_run_status text; v_next_job_id uuid; v_attempt_id uuid;
begin
  select * into v_job from public.research_jobs where id = p_job_id for update;
  if v_job.id is null then raise exception 'JOB_NOT_FOUND'; end if;
  if v_job.status = 'completed' then return jsonb_build_object('status','already_completed','job_id',v_job.id); end if;
  if v_job.status in ('dead_letter','failed') then return jsonb_build_object('status',v_job.status,'job_id',v_job.id); end if;
  if v_job.status <> 'claimed' then raise exception 'JOB_NOT_CLAIMED: current status is %', v_job.status; end if;
  select status into v_run_status from public.research_runs where id = v_job.run_id for update;
  if v_run_status in ('Cancelled','Failed','Completed') then
    update public.research_jobs set status = 'dead_letter', error_class = 'cancelled', error_message = 'Run is terminal: ' || v_run_status, completed_at = now(), updated_at = now() where id = v_job.id;
    return jsonb_build_object('status','run_terminal','job_id',v_job.id,'run_status',v_run_status);
  end if;
  update public.research_jobs set status='completed', output_meta=p_output_meta, completed_at=now(), updated_at=now() where id=p_job_id;
  select id into v_attempt_id from public.research_job_attempts where job_id=p_job_id and status='started' order by created_at desc limit 1;
  if v_attempt_id is not null then update public.research_job_attempts set status='completed',completed_at=now(),duration_ms=extract(epoch from(now()-started_at))::integer*1000,provider_cost_usd=coalesce((p_metrics->>'provider_cost_usd')::numeric,0),tokens_used=coalesce(p_metrics->'tokens_used','{}'::jsonb) where id=v_attempt_id; end if;
  update public.research_runs set last_progress_at=now(),updated_at=now() where id=v_job.run_id;
  update public.research_pipeline_metrics set updated_at=now(),stage_timings=stage_timings || jsonb_build_object(v_job.stage||'_'||v_job.stage_iteration||'_'||v_job.batch_index,p_metrics) where run_id=v_job.run_id;
  if p_next_stage is not null then select public.enqueue_research_job(v_job.run_id,p_next_stage,p_next_input_meta,p_next_stage_iteration,p_next_batch_index,p_next_batch_size,p_next_job_purpose,p_job_id) into v_next_job_id; end if;
  return jsonb_build_object('status','completed','job_id',v_job.id,'next_job_id',v_next_job_id);
end; $$;

create or replace function public.fail_research_job(p_job_id uuid, p_error_class text, p_error_message text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_job public.research_jobs; v_attempt_id uuid; v_retry boolean := false; v_new_status text; v_run_status text;
begin
  select * into v_job from public.research_jobs where id=p_job_id for update;
  if v_job.id is null then raise exception 'JOB_NOT_FOUND'; end if;
  if v_job.status in ('failed','dead_letter','completed') then return jsonb_build_object('status',v_job.status,'job_id',v_job.id,'retried',false); end if;
  if v_job.status <> 'claimed' then return jsonb_build_object('status','not_claimed','job_id',v_job.id,'retried',false); end if;
  select status into v_run_status from public.research_runs where id=v_job.run_id for update;
  if v_run_status in ('Cancelled','Failed','Completed') then
    update public.research_jobs set status='dead_letter',error_class='cancelled',error_message='Run is terminal: '||v_run_status,completed_at=now(),updated_at=now() where id=v_job.id;
    return jsonb_build_object('status','run_terminal','job_id',v_job.id,'retried',false);
  end if;
  v_retry := p_error_class='transient' and v_job.attempt_count < v_job.max_attempts;
  if v_retry then v_new_status := 'pending'; update public.research_jobs set status='pending',error_class=p_error_class,error_message=p_error_message,visible_after=now()+(power(2,v_job.attempt_count)||' seconds')::interval,updated_at=now() where id=p_job_id;
  else v_new_status := 'dead_letter'; update public.research_jobs set status='dead_letter',error_class=p_error_class,error_message=p_error_message,completed_at=now(),updated_at=now() where id=p_job_id; end if;
  select id into v_attempt_id from public.research_job_attempts where job_id=p_job_id and status='started' order by created_at desc limit 1;
  if v_attempt_id is not null then update public.research_job_attempts set status='failed',completed_at=now(),error_class=p_error_class,error_message=p_error_message,duration_ms=extract(epoch from(now()-started_at))::integer*1000 where id=v_attempt_id; end if;
  update public.research_pipeline_metrics set retry_count=retry_count+(case when v_retry then 1 else 0 end),updated_at=now() where run_id=v_job.run_id;
  if v_new_status='dead_letter' then perform public.terminate_research_run(v_job.run_id,p_error_class,p_error_message,v_job.stage); end if;
  return jsonb_build_object('status',v_new_status,'job_id',v_job.id,'retried',v_retry);
end; $$;

create or replace function public.claim_research_job(p_worker_id text, p_visibility_timeout_ms integer default 60000)
returns setof public.research_jobs language plpgsql security definer set search_path=public as $$
declare v_job public.research_jobs;
begin
  select j.* into v_job from public.research_jobs j join public.research_runs r on r.id=j.run_id
   where j.status='pending' and j.visible_after<=now() and r.status not in ('Completed','Failed','Cancelled') order by j.created_at asc limit 1 for update of j skip locked;
  if v_job.id is null then return; end if;
  update public.research_jobs set status='claimed',claimed_by=p_worker_id,claimed_at=now(),attempt_count=attempt_count+1,visible_after=now()+(p_visibility_timeout_ms||' milliseconds')::interval,updated_at=now() where id=v_job.id;
  insert into public.research_job_attempts(job_id,run_id,stage,attempt_number) values(v_job.id,v_job.run_id,v_job.stage,v_job.attempt_count+1);
  update public.research_runs set current_stage=v_job.stage,current_stage_started_at=now(),last_progress_at=now(),updated_at=now() where id=v_job.run_id;
  return query select * from public.research_jobs where id=v_job.id;
end; $$;

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
  perform public.finalize_research_credit(p_run_id,'restore');
  return 'Cancelled';
end; $$;

revoke all on function public.cancel_research_run(uuid,text) from public, anon;
grant execute on function public.cancel_research_run(uuid,text) to authenticated;
notify pgrst, 'reload schema';
