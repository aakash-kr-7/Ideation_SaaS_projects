-- Keep release-test cleanup compatible with immutable report refresh history.
-- Production report paths remain immutable; this function is service-only and
-- still refuses to operate outside the isolated test-team namespace.
create or replace function public.cleanup_isolated_test_team(p_team_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if auth.role() <> 'service_role' then
    raise exception 'TEST_CLEANUP_DENIED';
  end if;

  select name into v_name
  from public.teams
  where id = p_team_id
  for update;

  if v_name is null then return true; end if;
  if v_name !~ '^(rls-|worker smoke|scheduler smoke|reveal-proof-|trust-cert-)' then
    raise exception 'TEST_CLEANUP_NAMESPACE_MISMATCH';
  end if;

  perform set_config('app.isolated_test_cleanup', 'on', true);

  -- Refresh rows use restrictive immutable-version references, so remove the
  -- isolated namespace in dependency order before deleting the owning team.
  delete from public.report_version_deltas delta
  using public.report_versions version,
        public.reports report,
        public.research_runs run,
        public.projects project
  where delta.report_version_id = version.id
    and version.report_id = report.id
    and report.run_id = run.id
    and run.project_id = project.id
    and project.team_id = p_team_id;

  delete from public.report_refresh_runs refresh
  using public.reports report,
        public.research_runs run,
        public.projects project
  where refresh.report_id = report.id
    and report.run_id = run.id
    and run.project_id = project.id
    and project.team_id = p_team_id;

  -- Delete refreshed children before the immutable base version so the
  -- self-reference never blocks the final team cascade.
  delete from public.report_versions version
  using public.reports report,
        public.research_runs run,
        public.projects project
  where version.report_id = report.id
    and report.run_id = run.id
    and run.project_id = project.id
    and project.team_id = p_team_id
    and version.previous_version_id is not null;

  delete from public.report_versions version
  using public.reports report,
        public.research_runs run,
        public.projects project
  where version.report_id = report.id
    and report.run_id = run.id
    and run.project_id = project.id
    and project.team_id = p_team_id;

  delete from public.teams where id = p_team_id;
  return true;
end;
$$;

revoke all on function public.cleanup_isolated_test_team(uuid)
  from public, anon, authenticated;
grant execute on function public.cleanup_isolated_test_team(uuid)
  to service_role;

notify pgrst, 'reload schema';
