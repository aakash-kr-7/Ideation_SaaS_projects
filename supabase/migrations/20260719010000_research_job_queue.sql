-- Durable, resumable, queue-driven research state machine.
-- Job queue, attempt tracking, pipeline metrics, chart datasets, and run progress.

-- ============================================================================
-- 1. research_jobs — the durable job queue
-- ============================================================================
-- One run will have MANY jobs: one per stage, per batch, per iteration, per retry.
-- run_id is NOT unique. Idempotency is enforced by a composite key.

create table if not exists public.research_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  stage text not null,
  status text not null default 'pending'
    check (status in ('pending', 'claimed', 'completed', 'failed', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  -- Composite idempotency identity
  stage_iteration integer not null default 0,
  batch_index integer not null default 0,
  batch_size integer not null default 0,
  job_purpose text not null default 'stage',
  parent_job_id uuid references public.research_jobs(id) on delete set null,
  -- Claim & visibility
  claimed_by text,
  claimed_at timestamptz,
  visible_after timestamptz not null default now(),
  -- Stage I/O
  input_meta jsonb not null default '{}'::jsonb,
  output_meta jsonb not null default '{}'::jsonb,
  -- Error state
  error_class text check (error_class in ('transient', 'permanent', 'budget', 'timeout')),
  error_message text,
  -- Timestamps
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Composite idempotency: prevent the same logical job from being inserted twice
create unique index if not exists idx_research_jobs_idempotency
  on public.research_jobs(run_id, stage, stage_iteration, batch_index, job_purpose);

-- Queue polling: find visible pending jobs efficiently
create index if not exists idx_research_jobs_queue
  on public.research_jobs(status, visible_after)
  where status = 'pending';

-- Run-level job listing
create index if not exists idx_research_jobs_run
  on public.research_jobs(run_id, created_at);

-- Stale claim detection
create index if not exists idx_research_jobs_claimed
  on public.research_jobs(status, visible_after)
  where status = 'claimed';

-- ============================================================================
-- 2. research_job_attempts — audit log per attempt
-- ============================================================================
create table if not exists public.research_job_attempts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.research_jobs(id) on delete cascade,
  run_id uuid not null references public.research_runs(id) on delete cascade,
  stage text not null,
  attempt_number integer not null check (attempt_number > 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null default 'started'
    check (status in ('started', 'completed', 'failed')),
  error_class text check (error_class in ('transient', 'permanent', 'budget', 'timeout')),
  error_message text,
  duration_ms integer,
  provider_cost_usd numeric not null default 0,
  tokens_used jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_job_attempts_job on public.research_job_attempts(job_id);
create index if not exists idx_job_attempts_run on public.research_job_attempts(run_id, stage);

-- ============================================================================
-- 3. research_pipeline_metrics — per-run observability
-- ============================================================================
create table if not exists public.research_pipeline_metrics (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.research_runs(id) on delete cascade,
  candidates_discovered integer not null default 0,
  pages_attempted integer not null default 0,
  pages_fetched integer not null default 0,
  sources_accepted integer not null default 0,
  sources_rejected_by_reason jsonb not null default '{}'::jsonb,
  independent_domains integer not null default 0,
  evidence_items_extracted integer not null default 0,
  cost_per_stage jsonb not null default '{}'::jsonb,
  cost_per_accepted_source numeric,
  cost_per_accepted_evidence numeric,
  retry_count integer not null default 0,
  cache_hit_rate numeric,
  provider_fallback_count integer not null default 0,
  terminal_failure_reason text,
  stage_timings jsonb not null default '{}'::jsonb,
  total_provider_cost_usd numeric not null default 0,
  total_jobs_created integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ============================================================================
-- 4. report_chart_datasets — immutable chart data per report version
-- ============================================================================
create table if not exists public.report_chart_datasets (
  id uuid primary key default gen_random_uuid(),
  report_version_id uuid not null references public.report_versions(id) on delete cascade,
  run_id uuid not null references public.research_runs(id) on delete cascade,
  chart_key text not null,
  chart_type text not null,
  schema_version integer not null default 1,
  source_data jsonb not null,
  chart_config jsonb not null default '{}'::jsonb,
  supporting_evidence_ids uuid[] not null default '{}',
  svg_storage_path text,
  sha256 text not null,
  created_at timestamptz not null default now(),
  unique (report_version_id, chart_key)
);

-- Immutability triggers for chart datasets
create or replace function public.reject_chart_dataset_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'report_chart_datasets are immutable after creation';
end;
$$;

create trigger chart_datasets_immutable_update
before update on public.report_chart_datasets for each row
execute function public.reject_chart_dataset_mutation();

create trigger chart_datasets_immutable_delete
before delete on public.report_chart_datasets for each row
execute function public.reject_chart_dataset_mutation();

-- ============================================================================
-- 5. Alterations to research_runs — progress tracking fields
-- ============================================================================
alter table public.research_runs
  add column if not exists current_stage text,
  add column if not exists current_stage_started_at timestamptz,
  add column if not exists last_progress_at timestamptz,
  add column if not exists terminal_at timestamptz,
  add column if not exists total_provider_cost_usd numeric not null default 0,
  add column if not exists total_tokens_used jsonb not null default '{}'::jsonb,
  add column if not exists time_budget_exhausted boolean not null default false,
  add column if not exists cost_budget_exhausted boolean not null default false,
  add column if not exists pipeline_version text not null default 'staged',
  add column if not exists max_jobs_per_run integer not null default 200;

-- ============================================================================
-- 6. Alterations to research_passes — batch-level metrics
-- ============================================================================
alter table public.research_passes
  add column if not exists pages_attempted integer not null default 0,
  add column if not exists pages_fetched integer not null default 0,
  add column if not exists sources_accepted integer not null default 0,
  add column if not exists sources_rejected integer not null default 0,
  add column if not exists independent_domains integer not null default 0,
  add column if not exists provider_cost_usd numeric not null default 0,
  add column if not exists duration_ms integer;

-- ============================================================================
-- 7. RLS on new tables
-- ============================================================================
alter table public.research_jobs enable row level security;
alter table public.research_job_attempts enable row level security;
alter table public.research_pipeline_metrics enable row level security;
alter table public.report_chart_datasets enable row level security;

-- User-visible read policies scoped via is_team_member
create policy "Team members can view research jobs"
  on public.research_jobs for select using (
    exists (
      select 1 from public.research_runs rr
      join public.projects p on p.id = rr.project_id
      where rr.id = research_jobs.run_id
        and public.is_team_member(p.team_id, auth.uid())
    )
  );

create policy "Team members can view job attempts"
  on public.research_job_attempts for select using (
    exists (
      select 1 from public.research_runs rr
      join public.projects p on p.id = rr.project_id
      where rr.id = research_job_attempts.run_id
        and public.is_team_member(p.team_id, auth.uid())
    )
  );

create policy "Team members can view pipeline metrics"
  on public.research_pipeline_metrics for select using (
    exists (
      select 1 from public.research_runs rr
      join public.projects p on p.id = rr.project_id
      where rr.id = research_pipeline_metrics.run_id
        and public.is_team_member(p.team_id, auth.uid())
    )
  );

create policy "Team members can view chart datasets"
  on public.report_chart_datasets for select using (
    exists (
      select 1 from public.research_runs rr
      join public.projects p on p.id = rr.project_id
      where rr.id = report_chart_datasets.run_id
        and public.is_team_member(p.team_id, auth.uid())
    )
  );

-- ============================================================================
-- 8. Queue management RPCs — service_role only
-- ============================================================================

-- Enqueue a new research job (idempotent via composite unique index)
create or replace function public.enqueue_research_job(
  p_run_id uuid,
  p_stage text,
  p_input_meta jsonb default '{}'::jsonb,
  p_stage_iteration integer default 0,
  p_batch_index integer default 0,
  p_batch_size integer default 0,
  p_job_purpose text default 'stage',
  p_parent_job_id uuid default null,
  p_max_attempts integer default 3,
  p_visible_after timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job_id uuid;
  v_run_status text;
  v_total_jobs integer;
  v_max_jobs integer;
begin
  -- Verify the run is not terminal
  select status, max_jobs_per_run into v_run_status, v_max_jobs
  from public.research_runs where id = p_run_id;

  if v_run_status is null then
    raise exception 'RUN_NOT_FOUND';
  end if;
  if v_run_status in ('Completed', 'Failed', 'Cancelled') then
    raise exception 'RUN_ALREADY_TERMINAL: %', v_run_status;
  end if;

  -- Check max jobs per run
  select count(*) into v_total_jobs
  from public.research_jobs where run_id = p_run_id;
  if v_total_jobs >= v_max_jobs then
    raise exception 'MAX_JOBS_PER_RUN_EXCEEDED: % jobs', v_max_jobs;
  end if;

  insert into public.research_jobs (
    run_id, stage, status, max_attempts, stage_iteration, batch_index,
    batch_size, job_purpose, parent_job_id, input_meta, visible_after
  ) values (
    p_run_id, p_stage, 'pending', p_max_attempts, p_stage_iteration,
    p_batch_index, p_batch_size, p_job_purpose, p_parent_job_id,
    p_input_meta, p_visible_after
  )
  on conflict (run_id, stage, stage_iteration, batch_index, job_purpose)
  do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select id into v_job_id
    from public.research_jobs
    where run_id = p_run_id
      and stage = p_stage
      and stage_iteration = p_stage_iteration
      and batch_index = p_batch_index
      and job_purpose = p_job_purpose;
  else
    insert into public.research_pipeline_metrics (run_id, total_jobs_created)
    values (p_run_id, 1)
    on conflict (run_id) do update
    set total_jobs_created = research_pipeline_metrics.total_jobs_created + 1,
        updated_at = now();
  end if;

  return v_job_id;
end;
$$;

-- Claim the next visible pending job with FOR UPDATE SKIP LOCKED
create or replace function public.claim_research_job(
  p_worker_id text,
  p_visibility_timeout_ms integer default 60000
)
returns setof public.research_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.research_jobs;
begin
  -- Claim the oldest visible pending job
  select * into v_job
  from public.research_jobs
  where status = 'pending'
    and visible_after <= now()
  order by created_at asc
  limit 1
  for update skip locked;

  if v_job.id is null then
    return; -- nothing to claim
  end if;

  -- Mark as claimed
  update public.research_jobs set
    status = 'claimed',
    claimed_by = p_worker_id,
    claimed_at = now(),
    attempt_count = attempt_count + 1,
    visible_after = now() + (p_visibility_timeout_ms || ' milliseconds')::interval,
    updated_at = now()
  where id = v_job.id;

  -- Create attempt record
  insert into public.research_job_attempts (
    job_id, run_id, stage, attempt_number
  ) values (
    v_job.id, v_job.run_id, v_job.stage, v_job.attempt_count + 1
  );

  -- Update run progress
  update public.research_runs set
    current_stage = v_job.stage,
    current_stage_started_at = now(),
    last_progress_at = now(),
    updated_at = now()
  where id = v_job.run_id;

  -- Return the updated row
  return query select * from public.research_jobs where id = v_job.id;
end;
$$;

-- Complete a job and optionally enqueue the next stage — atomically
create or replace function public.complete_research_job(
  p_job_id uuid,
  p_output_meta jsonb default '{}'::jsonb,
  p_next_stage text default null,
  p_next_input_meta jsonb default '{}'::jsonb,
  p_next_stage_iteration integer default 0,
  p_next_batch_index integer default 0,
  p_next_batch_size integer default 0,
  p_next_job_purpose text default 'stage',
  p_metrics jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.research_jobs;
  v_next_job_id uuid;
  v_attempt_id uuid;
begin
  -- Lock the job row
  select * into v_job from public.research_jobs
  where id = p_job_id for update;

  if v_job.id is null then
    raise exception 'JOB_NOT_FOUND';
  end if;

  -- Duplicate completion is harmless
  if v_job.status = 'completed' then
    return jsonb_build_object('status', 'already_completed', 'job_id', v_job.id);
  end if;

  if v_job.status not in ('claimed') then
    raise exception 'JOB_NOT_CLAIMABLE: current status is %', v_job.status;
  end if;

  -- Mark job completed
  update public.research_jobs set
    status = 'completed',
    output_meta = p_output_meta,
    completed_at = now(),
    updated_at = now()
  where id = p_job_id;

  -- Complete the attempt record
  select id into v_attempt_id from public.research_job_attempts
  where job_id = p_job_id and status = 'started'
  order by created_at desc limit 1;

  if v_attempt_id is not null then
    update public.research_job_attempts set
      status = 'completed',
      completed_at = now(),
      duration_ms = extract(epoch from (now() - started_at))::integer * 1000,
      provider_cost_usd = coalesce((p_metrics->>'provider_cost_usd')::numeric, 0),
      tokens_used = coalesce(p_metrics->'tokens_used', '{}'::jsonb)
    where id = v_attempt_id;
  end if;

  -- Update run progress
  update public.research_runs set
    last_progress_at = now(),
    updated_at = now()
  where id = v_job.run_id;

  -- Update pipeline metrics
  update public.research_pipeline_metrics set
    updated_at = now(),
    stage_timings = stage_timings || jsonb_build_object(
      v_job.stage || '_' || v_job.stage_iteration || '_' || v_job.batch_index,
      p_metrics
    )
  where run_id = v_job.run_id;

  -- Enqueue next stage if specified
  if p_next_stage is not null then
    select public.enqueue_research_job(
      v_job.run_id, p_next_stage, p_next_input_meta,
      p_next_stage_iteration, p_next_batch_index, p_next_batch_size,
      p_next_job_purpose, p_job_id
    ) into v_next_job_id;
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'job_id', v_job.id,
    'next_job_id', v_next_job_id
  );
end;
$$;

-- Fail a job with error classification and bounded retry
create or replace function public.fail_research_job(
  p_job_id uuid,
  p_error_class text,
  p_error_message text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_job public.research_jobs;
  v_attempt_id uuid;
  v_retry boolean := false;
  v_new_status text;
begin
  select * into v_job from public.research_jobs
  where id = p_job_id for update;

  if v_job.id is null then
    raise exception 'JOB_NOT_FOUND';
  end if;

  -- Duplicate failure is harmless
  if v_job.status in ('failed', 'dead_letter') then
    return jsonb_build_object('status', v_job.status, 'job_id', v_job.id);
  end if;

  -- Determine if retryable
  v_retry := p_error_class = 'transient' and v_job.attempt_count < v_job.max_attempts;

  if v_retry then
    v_new_status := 'pending';
    update public.research_jobs set
      status = 'pending',
      error_class = p_error_class,
      error_message = p_error_message,
      visible_after = now() + (power(2, v_job.attempt_count) || ' seconds')::interval,
      updated_at = now()
    where id = p_job_id;
  else
    v_new_status := 'dead_letter';

    update public.research_jobs set
      status = v_new_status,
      error_class = p_error_class,
      error_message = p_error_message,
      completed_at = now(),
      updated_at = now()
    where id = p_job_id;
  end if;

  -- Update attempt record
  select id into v_attempt_id from public.research_job_attempts
  where job_id = p_job_id and status = 'started'
  order by created_at desc limit 1;

  if v_attempt_id is not null then
    update public.research_job_attempts set
      status = 'failed',
      completed_at = now(),
      error_class = p_error_class,
      error_message = p_error_message,
      duration_ms = extract(epoch from (now() - started_at))::integer * 1000
    where id = v_attempt_id;
  end if;

  -- Update metrics
  update public.research_pipeline_metrics set
    retry_count = retry_count + (case when v_retry then 1 else 0 end),
    updated_at = now()
  where run_id = v_job.run_id;

  -- If dead-letter or permanent failure, terminate the run
  if v_new_status = 'dead_letter' then
    perform public.terminate_research_run(
      v_job.run_id, p_error_class, p_error_message, v_job.stage
    );
  end if;

  return jsonb_build_object(
    'status', v_new_status,
    'job_id', v_job.id,
    'retried', v_retry
  );
end;
$$;

-- Terminal run failure: idempotent, restores credits exactly once
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
begin
  select status into v_status from public.research_runs
  where id = p_run_id for update;

  -- Already terminal: idempotent
  if v_status in ('Completed', 'Failed', 'Cancelled') then
    return v_status;
  end if;

  -- Mark run as failed
  update public.research_runs set
    status = 'Failed',
    progress = 100,
    error_message = p_error_message,
    progress_detail = 'Pipeline failed at stage: ' || coalesce(p_failed_stage, 'unknown'),
    terminal_at = now(),
    updated_at = now()
  where id = p_run_id;

  -- Record the stage transition
  insert into public.research_stages (
    run_id, stage_name, status, progress_detail, error_message, started_at, completed_at
  ) values (
    p_run_id, 'Failed', 'Failed', p_error_message, p_error_message, now(), now()
  );

  -- Store terminal reason in metrics
  update public.research_pipeline_metrics set
    terminal_failure_reason = p_error_message,
    updated_at = now()
  where run_id = p_run_id;

  -- Record error
  insert into public.error_logs (run_id, context, error_message)
  values (p_run_id, 'terminal_failure:' || coalesce(p_failed_stage, 'unknown'), p_error_message);

  -- Cancel all pending/claimed jobs for this run
  update public.research_jobs set
    status = 'dead_letter',
    error_class = 'permanent',
    error_message = 'Run terminated: ' || p_error_message,
    completed_at = now(),
    updated_at = now()
  where run_id = p_run_id and status in ('pending', 'claimed');

  -- Restore credits exactly once (finalize_research_credit is idempotent)
  perform public.finalize_research_credit(p_run_id, 'restore');

  return 'Failed';
end;
$$;

-- Finalize a successful run: idempotent, consumes credits exactly once
create or replace function public.finalize_research_run(p_run_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.research_runs
  where id = p_run_id for update;

  -- Already terminal: idempotent
  if v_status = 'Completed' then
    return 'Completed';
  end if;
  if v_status in ('Failed', 'Cancelled') then
    raise exception 'RUN_ALREADY_TERMINAL: %', v_status;
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

  -- Consume credits exactly once
  perform public.finalize_research_credit(p_run_id, 'consume');

  return 'Completed';
end;
$$;

-- Recover stale claimed jobs (claimed but past visibility timeout)
create or replace function public.recover_stale_research_jobs(
  p_stale_threshold_ms integer default 120000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recovered integer := 0;
  v_job record;
begin
  for v_job in
    select id, run_id, stage, attempt_count, max_attempts
    from public.research_jobs
    where status = 'claimed'
      and visible_after < now()
    for update skip locked
  loop
    if v_job.attempt_count >= v_job.max_attempts then
      -- Dead-letter
      update public.research_jobs set
        status = 'dead_letter',
        error_class = 'timeout',
        error_message = 'Stale job exceeded max attempts after visibility timeout',
        completed_at = now(),
        updated_at = now()
      where id = v_job.id;

      perform public.terminate_research_run(
        v_job.run_id, 'timeout',
        'Stage ' || v_job.stage || ' exceeded max attempts after stale recovery'
      );
    else
      -- Reset to pending for retry
      update public.research_jobs set
        status = 'pending',
        claimed_by = null,
        claimed_at = null,
        visible_after = now(),
        updated_at = now()
      where id = v_job.id;
    end if;

    v_recovered := v_recovered + 1;
  end loop;

  return v_recovered;
end;
$$;

-- Process next pending job (for polling fallback)
create or replace function public.process_pending_research_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pending integer;
begin
  select count(*) into v_pending
  from public.research_jobs
  where status = 'pending' and visible_after <= now();

  return v_pending;
end;
$$;

-- ============================================================================
-- 9. Permission grants — service_role only for queue management
-- ============================================================================
revoke all on function public.enqueue_research_job(uuid,text,jsonb,integer,integer,integer,text,uuid,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.enqueue_research_job(uuid,text,jsonb,integer,integer,integer,text,uuid,integer,timestamptz) to service_role;

revoke all on function public.claim_research_job(text,integer) from public, anon, authenticated;
grant execute on function public.claim_research_job(text,integer) to service_role;

revoke all on function public.complete_research_job(uuid,jsonb,text,jsonb,integer,integer,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.complete_research_job(uuid,jsonb,text,jsonb,integer,integer,integer,text,jsonb) to service_role;

revoke all on function public.fail_research_job(uuid,text,text) from public, anon, authenticated;
grant execute on function public.fail_research_job(uuid,text,text) to service_role;

revoke all on function public.terminate_research_run(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.terminate_research_run(uuid,text,text,text) to service_role;

revoke all on function public.finalize_research_run(uuid) from public, anon, authenticated;
grant execute on function public.finalize_research_run(uuid) to service_role;

revoke all on function public.recover_stale_research_jobs(integer) from public, anon, authenticated;
grant execute on function public.recover_stale_research_jobs(integer) to service_role;

revoke all on function public.process_pending_research_jobs() from public, anon, authenticated;
grant execute on function public.process_pending_research_jobs() to service_role;

-- ============================================================================
-- 10. Modtime triggers
-- ============================================================================
drop trigger if exists update_research_jobs_modtime on public.research_jobs;
create trigger update_research_jobs_modtime
before update on public.research_jobs for each row
execute function public.update_modified_column();

drop trigger if exists update_pipeline_metrics_modtime on public.research_pipeline_metrics;
create trigger update_pipeline_metrics_modtime
before update on public.research_pipeline_metrics for each row
execute function public.update_modified_column();

-- ============================================================================
-- 11. Realtime for job status changes (optional, for UI polling)
-- ============================================================================
alter publication supabase_realtime add table public.research_jobs;

notify pgrst, 'reload schema';
