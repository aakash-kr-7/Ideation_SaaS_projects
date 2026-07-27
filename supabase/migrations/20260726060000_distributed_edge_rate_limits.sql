-- Atomic, shared rate limits for public-edge mutation routes.
-- Only the service role used by Next.js middleware may consume a window.

create table if not exists public.edge_rate_limit_windows (
  scope_hash text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  expires_at timestamptz not null,
  primary key (scope_hash, window_started_at)
);

alter table public.edge_rate_limit_windows enable row level security;
alter table public.edge_rate_limit_windows force row level security;
revoke all on public.edge_rate_limit_windows from public, anon, authenticated;
grant all on public.edge_rate_limit_windows to service_role;

create or replace function public.consume_edge_rate_limit(
  p_scope_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window timestamptz;
  v_count integer;
begin
  if length(coalesce(p_scope_hash, '')) < 32
    or p_limit < 1
    or p_limit > 10000
    or p_window_seconds < 1
    or p_window_seconds > 86400 then
    raise exception 'INVALID_RATE_LIMIT_ARGUMENTS';
  end if;

  v_window := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  perform pg_advisory_xact_lock(hashtext(p_scope_hash));

  insert into public.edge_rate_limit_windows (
    scope_hash,
    window_started_at,
    request_count,
    expires_at
  )
  values (
    p_scope_hash,
    v_window,
    1,
    v_window + make_interval(secs => p_window_seconds * 2)
  )
  on conflict (scope_hash, window_started_at)
  do update set request_count = public.edge_rate_limit_windows.request_count + 1
  returning request_count into v_count;

  delete from public.edge_rate_limit_windows
  where expires_at < v_now
    and random() < 0.02;

  return query
  select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    greatest(
      1,
      ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - v_now)))::integer
    );
end;
$$;

revoke all on function public.consume_edge_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_edge_rate_limit(text, integer, integer) to service_role;

comment on table public.edge_rate_limit_windows is
  'Service-only shared rate-limit windows used by public-edge mutation routes.';

notify pgrst, 'reload schema';
