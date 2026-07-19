-- Prevent historical pre-queue runs from remaining non-terminal forever.
create or replace function public.recover_orphaned_research_runs(
  p_stale_after interval default interval '15 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run record;
  v_count integer := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  for v_run in
    select rr.id
    from public.research_runs rr
    where rr.status not in ('Completed', 'Failed', 'Cancelled')
      and rr.updated_at < now() - p_stale_after
      and not exists (select 1 from public.research_jobs job where job.run_id = rr.id and job.status in ('pending', 'claimed'))
  loop
    perform public.terminate_research_run(v_run.id, 'permanent', 'No durable queued job exists for this stale run.', 'orphan_recovery');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.recover_orphaned_research_runs(interval) from public, anon, authenticated;
grant execute on function public.recover_orphaned_research_runs(interval) to service_role;
