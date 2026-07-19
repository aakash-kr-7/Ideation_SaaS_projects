-- Fix error_class check constraints to include 'cancelled' which is used by
-- cancel_research_run and terminal-run guards in complete_research_job.
-- Also add missing 'cancelled' to research_job_attempts.

-- Drop old check constraints and recreate with 'cancelled' included
alter table public.research_jobs drop constraint if exists research_jobs_error_class_check;
alter table public.research_jobs add constraint research_jobs_error_class_check
  check (error_class in ('transient', 'permanent', 'budget', 'timeout', 'cancelled'));

alter table public.research_job_attempts drop constraint if exists research_job_attempts_error_class_check;
alter table public.research_job_attempts add constraint research_job_attempts_error_class_check
  check (error_class in ('transient', 'permanent', 'budget', 'timeout', 'cancelled'));

-- Guard: cursor terminalization in cancel_research_run was already added in
-- 20260719130000, but confirm the cursor update covers claimed jobs too.
-- Re-create cancel_research_run with claimed → dead_letter coverage.
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
  -- Dead-letter both pending AND claimed jobs (claimed jobs may be in-flight but run is now terminal)
  update public.research_jobs set status='dead_letter',error_class='cancelled',error_message=p_reason,completed_at=now(),updated_at=now() where run_id=p_run_id and status in ('pending','claimed');
  -- Update cursor to terminal state
  update public.research_pipeline_cursors set terminalization_started=true,current_stage=null,last_progress_at=now(),updated_at=now() where run_id=p_run_id;
  perform public.finalize_research_credit(p_run_id,'restore');
  return 'Cancelled';
end; $$;

revoke all on function public.cancel_research_run(uuid,text) from public, anon;
grant execute on function public.cancel_research_run(uuid,text) to authenticated;

notify pgrst, 'reload schema';
