-- Make auth -> profile/team provisioning idempotent and repairable.

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
  new_team_id uuid;
  team_name text;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  insert into public.users (id, display_name, email, avatar_url)
  values (
    p_user_id,
    p_metadata->>'full_name',
    p_email,
    p_metadata->>'avatar_url'
  )
  on conflict (id) do update set
    email = coalesce(excluded.email, public.users.email),
    display_name = coalesce(public.users.display_name, excluded.display_name),
    avatar_url = coalesce(public.users.avatar_url, excluded.avatar_url);

  if not exists (
    select 1 from public.team_members where user_id = p_user_id
  ) then
    team_name := coalesce(
      nullif(p_metadata->>'full_name', ''),
      nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
      'My Team'
    );

    insert into public.teams (name, slug, created_by)
    values (team_name, 'team-' || substring(gen_random_uuid()::text from 1 for 8), p_user_id)
    returning id into new_team_id;

    insert into public.team_members (team_id, user_id, role)
    values (new_team_id, p_user_id, 'owner');

    insert into public.feature_limits (team_id)
    values (new_team_id)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.bootstrap_user(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.bootstrap_user(uuid, text, jsonb) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.bootstrap_user(new.id, new.email, coalesce(new.raw_user_meta_data, '{}'::jsonb));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.ensure_user_bootstrap()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  claims jsonb := auth.jwt();
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform public.bootstrap_user(
    current_user_id,
    claims->>'email',
    coalesce(claims->'user_metadata', '{}'::jsonb)
  );
end;
$$;

revoke all on function public.ensure_user_bootstrap() from public, anon;
grant execute on function public.ensure_user_bootstrap() to authenticated, service_role;

-- PostgREST upsert evaluates the INSERT policy even when the row already
-- exists and the statement resolves to UPDATE.
drop policy if exists "Users can insert own profile" on public.users;
create policy "Users can insert own profile"
  on public.users for insert
  with check (auth.uid() = id);
