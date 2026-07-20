-- Make stale-job recovery honor both the visibility lease and configured threshold.
create or replace function public.recover_stale_research_jobs(
  p_stale_threshold_ms integer default 180000
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
  if p_stale_threshold_ms < 1000 then
    raise exception 'STALE_THRESHOLD_TOO_LOW';
  end if;

  for v_job in
    select id, run_id, stage, attempt_count, max_attempts
    from public.research_jobs
    where status = 'claimed'
      and visible_after < now()
      and claimed_at < now() - (p_stale_threshold_ms * interval '1 millisecond')
    for update skip locked
  loop
    if v_job.attempt_count >= v_job.max_attempts then
      update public.research_jobs set
        status = 'dead_letter', error_class = 'timeout',
        error_message = 'Stale job exceeded max attempts after visibility timeout',
        completed_at = now(), updated_at = now()
      where id = v_job.id;
      perform public.terminate_research_run(
        v_job.run_id, 'timeout',
        'Stage ' || v_job.stage || ' exceeded max attempts after stale recovery',
        'scheduler'
      );
    else
      update public.research_jobs set
        status = 'pending', claimed_by = null, claimed_at = null,
        visible_after = now(), updated_at = now()
      where id = v_job.id;
    end if;
    v_recovered := v_recovered + 1;
  end loop;
  return v_recovered;
end;
$$;

revoke all on function public.recover_stale_research_jobs(integer) from public, anon, authenticated;
grant execute on function public.recover_stale_research_jobs(integer) to service_role;
