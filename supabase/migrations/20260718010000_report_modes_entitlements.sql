-- Canonical report products, atomic credit reservations, and tenant-safe access.

do $$ begin
  create type public.report_mode as enum ('quick_scan', 'full_validation');
exception when duplicate_object then null;
end $$;

alter table public.research_runs drop constraint if exists research_runs_mode_check;
alter table public.research_runs
  alter column mode type public.report_mode using (
    case mode::text
      when 'Fast Scan' then 'quick_scan'
      when 'Deep Validation' then 'full_validation'
      when 'quick_scan' then 'quick_scan'
      when 'full_validation' then 'full_validation'
      else 'full_validation'
    end
  )::public.report_mode;

alter table public.research_runs
  add column if not exists idempotency_key uuid,
  add column if not exists request_id uuid,
  add column if not exists assumptions jsonb not null default '{}'::jsonb,
  add column if not exists credit_cost integer not null default 0 check (credit_cost in (0, 1, 3)),
  add column if not exists credit_state text not null default 'legacy'
    check (credit_state in ('legacy', 'reserved', 'consumed', 'restored'));

create unique index if not exists idx_research_runs_creator_idempotency
  on public.research_runs(created_by, idempotency_key)
  where idempotency_key is not null;
create index if not exists idx_research_runs_mode_created
  on public.research_runs(mode, created_at desc);
create index if not exists idx_research_runs_mode_status
  on public.research_runs(mode, status);

alter table public.report_versions
  add column if not exists report_mode public.report_mode;

alter table public.report_versions disable trigger report_versions_immutable_update;
update public.report_versions rv
set report_mode = rr.mode
from public.reports r
join public.research_runs rr on rr.id = r.run_id
where r.id = rv.report_id and rv.report_mode is null;
alter table public.report_versions enable trigger report_versions_immutable_update;

alter table public.report_versions alter column report_mode set not null;
create index if not exists idx_report_versions_mode_created
  on public.report_versions(report_mode, created_at desc);

create table if not exists public.team_credit_accounts (
  team_id uuid primary key references public.teams(id) on delete cascade,
  paid_credits integer not null default 0 check (paid_credits >= 0),
  reserved_paid_credits integer not null default 0 check (reserved_paid_credits >= 0),
  free_quick_scans_remaining integer not null default 1
    check (free_quick_scans_remaining between 0 and 1),
  free_cycle_started_at date not null default date_trunc('month', now())::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_reservations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  run_id uuid not null unique references public.research_runs(id) on delete cascade,
  report_mode public.report_mode not null,
  credit_cost integer not null check (credit_cost in (1, 3)),
  credit_source text not null check (credit_source in ('free_monthly', 'paid')),
  status text not null default 'reserved'
    check (status in ('reserved', 'consumed', 'restored')),
  idempotency_key uuid not null,
  reserved_at timestamptz not null default now(),
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, idempotency_key)
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  run_id uuid references public.research_runs(id) on delete set null,
  reservation_id uuid references public.credit_reservations(id) on delete set null,
  event_type text not null check (event_type in ('grant', 'reserve', 'consume', 'restore')),
  paid_credit_delta integer not null default 0,
  free_credit_delta integer not null default 0,
  external_reference text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_credit_ledger_external_reference
  on public.credit_ledger(team_id, external_reference)
  where external_reference is not null;
create index if not exists idx_credit_reservations_team_status
  on public.credit_reservations(team_id, status);
create index if not exists idx_credit_ledger_team_created
  on public.credit_ledger(team_id, created_at desc);

alter table public.team_credit_accounts enable row level security;
alter table public.credit_reservations enable row level security;
alter table public.credit_ledger enable row level security;

create policy "Team members can view credit accounts"
  on public.team_credit_accounts for select
  using (public.is_team_member(team_id, auth.uid()));
create policy "Team members can view credit reservations"
  on public.credit_reservations for select
  using (public.is_team_member(team_id, auth.uid()));
create policy "Team members can view credit ledger"
  on public.credit_ledger for select
  using (public.is_team_member(team_id, auth.uid()));

drop trigger if exists update_team_credit_accounts_modtime on public.team_credit_accounts;
create trigger update_team_credit_accounts_modtime
before update on public.team_credit_accounts for each row
execute function public.update_modified_column();
drop trigger if exists update_credit_reservations_modtime on public.credit_reservations;
create trigger update_credit_reservations_modtime
before update on public.credit_reservations for each row
execute function public.update_modified_column();

create or replace function public.refresh_monthly_quick_scan(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.team_credit_accounts (team_id)
  values (p_team_id)
  on conflict (team_id) do nothing;

  update public.team_credit_accounts
  set free_quick_scans_remaining = 1,
      free_cycle_started_at = date_trunc('month', now())::date
  where team_id = p_team_id
    and free_cycle_started_at < date_trunc('month', now())::date;
end;
$$;

create or replace function public.create_research_run_with_reservation(
  p_project_id uuid,
  p_idea_name text,
  p_idea_description text,
  p_target_customer text,
  p_market_type text,
  p_target_region text,
  p_assumptions jsonb,
  p_mode public.report_mode,
  p_idempotency_key uuid,
  p_request_id uuid
)
returns table (
  run_id uuid,
  run_status text,
  report_mode public.report_mode,
  credit_cost integer,
  credit_source text,
  available_paid_credits integer,
  free_quick_scans_remaining integer,
  duplicate boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid;
  v_run_id uuid;
  v_existing public.research_runs%rowtype;
  v_account public.team_credit_accounts%rowtype;
  v_cost integer := case when p_mode = 'quick_scan' then 1 else 3 end;
  v_source text;
  v_reservation_id uuid;
begin
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or p_request_id is null then
    raise exception 'IDEMPOTENCY_AND_REQUEST_ID_REQUIRED';
  end if;
  if length(trim(p_idea_name)) < 1 or length(trim(p_idea_description)) < 10
    or length(trim(p_target_customer)) < 1 or length(trim(p_target_region)) < 1 then
    raise exception 'INVALID_RESEARCH_INPUT';
  end if;

  select p.team_id into v_team_id
  from public.projects p
  where p.id = p_project_id
    and public.is_team_member(p.team_id, v_user_id);
  if v_team_id is null then raise exception 'PROJECT_ACCESS_DENIED'; end if;

  select * into v_existing
  from public.research_runs
  where created_by = v_user_id and idempotency_key = p_idempotency_key;
  if found then
    return query
    select v_existing.id, v_existing.status::text, v_existing.mode,
      v_existing.credit_cost, coalesce(cr.credit_source, 'paid'),
      a.paid_credits, a.free_quick_scans_remaining, true
    from public.team_credit_accounts a
    left join public.credit_reservations cr on cr.run_id = v_existing.id
    where a.team_id = v_team_id;
    return;
  end if;

  perform public.refresh_monthly_quick_scan(v_team_id);
  select * into v_account from public.team_credit_accounts
  where team_id = v_team_id for update;

  if p_mode = 'quick_scan' and v_account.free_quick_scans_remaining > 0 then
    v_source := 'free_monthly';
    update public.team_credit_accounts
      set free_quick_scans_remaining = free_quick_scans_remaining - 1
      where team_id = v_team_id;
  elsif v_account.paid_credits >= v_cost then
    v_source := 'paid';
    update public.team_credit_accounts
      set paid_credits = paid_credits - v_cost,
          reserved_paid_credits = reserved_paid_credits + v_cost
      where team_id = v_team_id;
  else
    raise exception 'INSUFFICIENT_CREDITS:%:%', v_cost,
      v_account.paid_credits + case when p_mode = 'quick_scan' then v_account.free_quick_scans_remaining else 0 end;
  end if;

  insert into public.research_runs (
    project_id, created_by, idea_name, idea_description, target_customer,
    market_type, target_region, assumptions, mode, status, progress, progress_detail,
    idempotency_key, request_id, credit_cost, credit_state
  ) values (
    p_project_id, v_user_id, trim(p_idea_name), trim(p_idea_description),
    trim(p_target_customer), p_market_type, trim(p_target_region), coalesce(p_assumptions, '{}'::jsonb), p_mode,
    'Queued', 0, 'Preparing research', p_idempotency_key, p_request_id,
    v_cost, 'reserved'
  ) returning id into v_run_id;

  insert into public.credit_reservations (
    team_id, run_id, report_mode, credit_cost, credit_source, idempotency_key
  ) values (
    v_team_id, v_run_id, p_mode, v_cost, v_source, p_idempotency_key
  ) returning id into v_reservation_id;

  insert into public.credit_ledger (
    team_id, run_id, reservation_id, event_type, paid_credit_delta,
    free_credit_delta, metadata
  ) values (
    v_team_id, v_run_id, v_reservation_id, 'reserve',
    case when v_source = 'paid' then -v_cost else 0 end,
    case when v_source = 'free_monthly' then -1 else 0 end,
    jsonb_build_object('report_mode', p_mode, 'request_id', p_request_id)
  );

  insert into public.research_stages (
    run_id, stage_name, status, progress_detail, started_at, completed_at
  ) values (
    v_run_id, 'Queued', 'Queued', 'Preparing research', now(), now()
  );

  insert into public.analytics_events (user_id, event_name, event_data)
  values (v_user_id, 'research_run_reserved', jsonb_build_object(
    'run_id', v_run_id, 'report_mode', p_mode, 'credit_cost', v_cost,
    'credit_source', v_source, 'request_id', p_request_id
  ));

  select * into v_account from public.team_credit_accounts where team_id = v_team_id;
  return query select v_run_id, 'Queued', p_mode, v_cost, v_source,
    v_account.paid_credits, v_account.free_quick_scans_remaining, false;
end;
$$;

create or replace function public.finalize_research_credit(
  p_run_id uuid,
  p_outcome text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation public.credit_reservations%rowtype;
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from public.research_runs rr
    where rr.id = p_run_id and rr.created_by = auth.uid()
      and rr.status = 'Failed' and rr.credit_state = 'reserved'
  ) then
    raise exception 'CREDIT_FINALIZATION_DENIED';
  end if;
  if p_outcome not in ('consume', 'restore') then raise exception 'INVALID_CREDIT_OUTCOME'; end if;

  select * into v_reservation from public.credit_reservations
  where run_id = p_run_id for update;
  if not found then
    if exists (select 1 from public.research_runs where id = p_run_id and credit_state = 'legacy') then
      return 'legacy';
    end if;
    raise exception 'CREDIT_RESERVATION_NOT_FOUND';
  end if;
  if v_reservation.status <> 'reserved' then return v_reservation.status; end if;

  if p_outcome = 'consume' then
    update public.credit_reservations set status = 'consumed', finalized_at = now()
      where id = v_reservation.id;
    if v_reservation.credit_source = 'paid' then
      update public.team_credit_accounts
        set reserved_paid_credits = reserved_paid_credits - v_reservation.credit_cost
        where team_id = v_reservation.team_id;
    end if;
    update public.research_runs set credit_state = 'consumed' where id = p_run_id;
    insert into public.credit_ledger (team_id, run_id, reservation_id, event_type, metadata)
      values (v_reservation.team_id, p_run_id, v_reservation.id, 'consume',
        jsonb_build_object('report_mode', v_reservation.report_mode));
    return 'consumed';
  end if;

  update public.credit_reservations set status = 'restored', finalized_at = now()
    where id = v_reservation.id;
  if v_reservation.credit_source = 'paid' then
    update public.team_credit_accounts
      set paid_credits = paid_credits + v_reservation.credit_cost,
          reserved_paid_credits = reserved_paid_credits - v_reservation.credit_cost
      where team_id = v_reservation.team_id;
  else
    update public.team_credit_accounts
      set free_quick_scans_remaining = least(1, free_quick_scans_remaining + 1)
      where team_id = v_reservation.team_id;
  end if;
  update public.research_runs set credit_state = 'restored' where id = p_run_id;
  insert into public.credit_ledger (
    team_id, run_id, reservation_id, event_type, paid_credit_delta,
    free_credit_delta, metadata
  ) values (
    v_reservation.team_id, p_run_id, v_reservation.id, 'restore',
    case when v_reservation.credit_source = 'paid' then v_reservation.credit_cost else 0 end,
    case when v_reservation.credit_source = 'free_monthly' then 1 else 0 end,
    jsonb_build_object('report_mode', v_reservation.report_mode)
  );
  return 'restored';
end;
$$;

create or replace function public.fail_queued_research_dispatch(
  p_run_id uuid,
  p_error_message text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_status text;
begin
  select created_by, status into v_owner, v_status from public.research_runs
    where id = p_run_id for update;
  if v_owner is null or v_owner <> auth.uid() then raise exception 'RUN_ACCESS_DENIED'; end if;
  if v_status <> 'Queued' then return 'not_queued'; end if;
  update public.research_runs set status = 'Failed', progress = 100,
    error_message = p_error_message, progress_detail = 'Worker dispatch failed; reserved credits were restored.'
    where id = p_run_id;
  perform public.finalize_research_credit(p_run_id, 'restore');
  return 'restored';
end;
$$;

create or replace function public.get_team_credit_snapshot()
returns table (
  team_id uuid,
  paid_credits integer,
  reserved_paid_credits integer,
  free_quick_scans_remaining integer,
  quick_scans_available integer,
  full_validations_available integer,
  free_cycle_started_at date
)
language plpgsql
security definer
set search_path = public
as $$
declare v_team_id uuid;
begin
  select tm.team_id into v_team_id from public.team_members tm
    where tm.user_id = auth.uid() order by tm.created_at limit 1;
  if v_team_id is null then raise exception 'TEAM_NOT_FOUND'; end if;
  perform public.refresh_monthly_quick_scan(v_team_id);
  return query select a.team_id, a.paid_credits, a.reserved_paid_credits,
    a.free_quick_scans_remaining,
    a.paid_credits + a.free_quick_scans_remaining,
    floor(a.paid_credits / 3.0)::integer,
    a.free_cycle_started_at
  from public.team_credit_accounts a where a.team_id = v_team_id;
end;
$$;

-- Billing providers call this boundary only after a verified, idempotent payment event.
create or replace function public.grant_paid_credits(
  p_team_id uuid,
  p_credits integer,
  p_external_reference text,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_balance integer;
begin
  if auth.role() <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  if p_credits <= 0 or nullif(trim(p_external_reference), '') is null then
    raise exception 'INVALID_CREDIT_GRANT';
  end if;
  insert into public.team_credit_accounts (team_id) values (p_team_id)
    on conflict (team_id) do nothing;
  insert into public.credit_ledger (
    team_id, event_type, paid_credit_delta, external_reference, metadata
  ) values (p_team_id, 'grant', p_credits, p_external_reference, p_metadata)
  on conflict (team_id, external_reference) where external_reference is not null do nothing;
  if found then
    update public.team_credit_accounts set paid_credits = paid_credits + p_credits
      where team_id = p_team_id;
  end if;
  select paid_credits into v_balance from public.team_credit_accounts where team_id = p_team_id;
  return v_balance;
end;
$$;

-- Replace permissive legacy read policies with tenant-scoped policies.
drop policy if exists "Users can view run data" on public.opportunities;
create policy "Users can view team opportunities" on public.opportunities for select using (
  exists (select 1 from public.research_runs rr join public.projects p on p.id = rr.project_id
    where rr.id = opportunities.run_id and public.is_team_member(p.team_id, auth.uid()))
);
drop policy if exists "Users can view run data" on public.sources;
create policy "Users can view team sources" on public.sources for select using (
  exists (select 1 from public.research_runs rr join public.projects p on p.id = rr.project_id
    where rr.id = sources.run_id and public.is_team_member(p.team_id, auth.uid()))
);
drop policy if exists "Users can view run data" on public.evidence_items;
create policy "Users can view team evidence" on public.evidence_items for select using (
  exists (select 1 from public.research_runs rr join public.projects p on p.id = rr.project_id
    where rr.id = evidence_items.run_id and public.is_team_member(p.team_id, auth.uid()))
);
drop policy if exists "Users can view opportunity data" on public.competitors;
create policy "Users can view team competitors" on public.competitors for select using (
  exists (select 1 from public.opportunities o join public.research_runs rr on rr.id = o.run_id
    join public.projects p on p.id = rr.project_id where o.id = competitors.opportunity_id
    and public.is_team_member(p.team_id, auth.uid()))
);
drop policy if exists "Users can view opportunity data" on public.risks;
create policy "Users can view team risks" on public.risks for select using (
  exists (select 1 from public.opportunities o join public.research_runs rr on rr.id = o.run_id
    join public.projects p on p.id = rr.project_id where o.id = risks.opportunity_id
    and public.is_team_member(p.team_id, auth.uid()))
);
drop policy if exists "Users can view opportunity data" on public.pricing_models;
create policy "Users can view team pricing models" on public.pricing_models for select using (
  exists (select 1 from public.opportunities o join public.research_runs rr on rr.id = o.run_id
    join public.projects p on p.id = rr.project_id where o.id = pricing_models.opportunity_id
    and public.is_team_member(p.team_id, auth.uid()))
);
drop policy if exists "Users can view opportunity data" on public.mvp_plans;
create policy "Users can view team mvp plans" on public.mvp_plans for select using (
  exists (select 1 from public.opportunities o join public.research_runs rr on rr.id = o.run_id
    join public.projects p on p.id = rr.project_id where o.id = mvp_plans.opportunity_id
    and public.is_team_member(p.team_id, auth.uid()))
);
drop policy if exists "Users can view opportunity data" on public.mvp_scope_items;
create policy "Users can view team mvp scope" on public.mvp_scope_items for select using (
  exists (select 1 from public.mvp_plans mp join public.opportunities o on o.id = mp.opportunity_id
    join public.research_runs rr on rr.id = o.run_id join public.projects p on p.id = rr.project_id
    where mp.id = mvp_scope_items.mvp_plan_id and public.is_team_member(p.team_id, auth.uid()))
);
drop policy if exists "Users can view opportunity data" on public.launch_plans;
create policy "Users can view team launch plans" on public.launch_plans for select using (
  exists (select 1 from public.opportunities o join public.research_runs rr on rr.id = o.run_id
    join public.projects p on p.id = rr.project_id where o.id = launch_plans.opportunity_id
    and public.is_team_member(p.team_id, auth.uid()))
);
drop policy if exists "Users can view opportunity data" on public.launch_strategies;
create policy "Users can view team launch strategies" on public.launch_strategies for select using (
  exists (select 1 from public.launch_plans lp join public.opportunities o on o.id = lp.opportunity_id
    join public.research_runs rr on rr.id = o.run_id join public.projects p on p.id = rr.project_id
    where lp.id = launch_strategies.launch_plan_id and public.is_team_member(p.team_id, auth.uid()))
);

drop policy if exists "Users can view scores" on public.opportunity_scores;
create policy "Users can view team scores" on public.opportunity_scores for select using (
  exists (select 1 from public.opportunities o join public.research_runs rr on rr.id = o.run_id
    join public.projects p on p.id = rr.project_id where o.id = opportunity_scores.opportunity_id
    and public.is_team_member(p.team_id, auth.uid()))
);
drop policy if exists "Users can view score breakdowns" on public.score_breakdowns;
create policy "Users can view team score breakdowns" on public.score_breakdowns for select using (
  exists (select 1 from public.opportunity_scores os join public.opportunities o on o.id = os.opportunity_id
    join public.research_runs rr on rr.id = o.run_id join public.projects p on p.id = rr.project_id
    where os.id = score_breakdowns.score_id and public.is_team_member(p.team_id, auth.uid()))
);
drop policy if exists "Users can view score evidence" on public.score_evidence_refs;
create policy "Users can view team score evidence" on public.score_evidence_refs for select using (
  exists (select 1 from public.score_breakdowns sb join public.opportunity_scores os on os.id = sb.score_id
    join public.opportunities o on o.id = os.opportunity_id join public.research_runs rr on rr.id = o.run_id
    join public.projects p on p.id = rr.project_id where sb.id = score_evidence_refs.score_breakdown_id
    and public.is_team_member(p.team_id, auth.uid()))
);
drop policy if exists "Users can view reports" on public.reports;
create policy "Users can view team reports" on public.reports for select using (
  exists (select 1 from public.research_runs rr join public.projects p on p.id = rr.project_id
    where rr.id = reports.run_id and public.is_team_member(p.team_id, auth.uid()))
);
drop policy if exists "Users can view report versions" on public.report_versions;
create policy "Users can view team report versions" on public.report_versions for select using (
  exists (select 1 from public.reports r join public.research_runs rr on rr.id = r.run_id
    join public.projects p on p.id = rr.project_id where r.id = report_versions.report_id
    and public.is_team_member(p.team_id, auth.uid()))
);

grant execute on function public.create_research_run_with_reservation(uuid,text,text,text,text,text,jsonb,public.report_mode,uuid,uuid) to authenticated;
grant execute on function public.fail_queued_research_dispatch(uuid,text) to authenticated;
grant execute on function public.get_team_credit_snapshot() to authenticated;
revoke all on function public.finalize_research_credit(uuid,text) from public, anon, authenticated;
grant execute on function public.finalize_research_credit(uuid,text) to service_role;
revoke all on function public.grant_paid_credits(uuid,integer,text,jsonb) from public, anon, authenticated;
grant execute on function public.grant_paid_credits(uuid,integer,text,jsonb) to service_role;

notify pgrst, 'reload schema';
