-- Complete account bootstrap after all product tables exist.
-- The advisory lock and existence checks make retries safe.

create or replace function public.bootstrap_user(
  p_user_id uuid,
  p_email text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_team_id uuid;
  v_team_name text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  insert into public.users (id, display_name, email, avatar_url)
  values (
    p_user_id,
    nullif(p_metadata->>'full_name', ''),
    p_email,
    nullif(p_metadata->>'avatar_url', '')
  )
  on conflict (id) do update set
    email = coalesce(excluded.email, public.users.email),
    display_name = coalesce(public.users.display_name, excluded.display_name),
    avatar_url = coalesce(public.users.avatar_url, excluded.avatar_url);

  select tm.team_id into v_team_id
  from public.team_members tm
  where tm.user_id = p_user_id
  order by tm.created_at
  limit 1;

  if v_team_id is null then
    v_team_name := coalesce(
      nullif(p_metadata->>'full_name', ''),
      nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
      'My Workspace'
    );

    insert into public.teams (name, slug, created_by)
    values (v_team_name, 'team-' || substring(gen_random_uuid()::text from 1 for 8), p_user_id)
    returning id into v_team_id;

    insert into public.team_members (team_id, user_id, role)
    values (v_team_id, p_user_id, 'owner');
  end if;

  insert into public.feature_limits (team_id) values (v_team_id)
  on conflict do nothing;

  insert into public.team_credit_accounts (team_id) values (v_team_id)
  on conflict do nothing;

  if not exists (
    select 1 from public.projects
    where team_id = v_team_id and created_by = p_user_id
  ) then
    insert into public.projects (team_id, name, description, created_by)
    values (v_team_id, 'My first project', 'Your first ShouldBuild validation workspace.', p_user_id);
  end if;
end;
$$;

revoke all on function public.bootstrap_user(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.bootstrap_user(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
