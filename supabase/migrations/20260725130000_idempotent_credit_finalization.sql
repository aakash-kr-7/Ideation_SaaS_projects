-- Let trusted terminal operations observe an already-finalized reservation
-- before enforcing mutation authorization. This makes cancellation cleanup
-- idempotent without permitting a second credit mutation.

create or replace function public.finalize_research_credit(p_run_id uuid, p_outcome text)
returns text language plpgsql security definer set search_path=public as $$
declare v_reservation public.credit_reservations%rowtype;
begin
  if p_outcome not in ('consume','restore') then
    raise exception 'INVALID_CREDIT_OUTCOME';
  end if;

  select * into v_reservation
  from public.credit_reservations
  where run_id=p_run_id
  for update;

  if not found then
    if exists(select 1 from public.research_runs where id=p_run_id and credit_state='legacy') then
      return 'legacy';
    end if;
    raise exception 'CREDIT_RESERVATION_NOT_FOUND';
  end if;

  -- Exactly-once terminal retries are reads of the existing outcome.
  if v_reservation.status<>'reserved' then
    return v_reservation.status;
  end if;

  if auth.role()<>'service_role' and not exists (
    select 1
    from public.research_runs rr
    where rr.id=p_run_id
      and rr.created_by=auth.uid()
      and rr.status in ('Failed','Cancelled')
      and rr.credit_state='reserved'
  ) then
    raise exception 'CREDIT_FINALIZATION_DENIED';
  end if;

  if p_outcome='consume' then
    update public.credit_reservations set status='consumed',finalized_at=now() where id=v_reservation.id;
    if v_reservation.credit_source='paid' then
      update public.team_credit_accounts
      set reserved_paid_credits=reserved_paid_credits-v_reservation.credit_cost
      where team_id=v_reservation.team_id;
    end if;
    update public.research_runs set credit_state='consumed' where id=p_run_id;
    insert into public.credit_ledger(team_id,run_id,reservation_id,event_type,metadata)
    values(v_reservation.team_id,p_run_id,v_reservation.id,'consume',jsonb_build_object('report_mode',v_reservation.report_mode));
    return 'consumed';
  end if;

  update public.credit_reservations set status='restored',finalized_at=now() where id=v_reservation.id;
  if v_reservation.credit_source='paid' then
    update public.team_credit_accounts
    set paid_credits=paid_credits+v_reservation.credit_cost,
        reserved_paid_credits=reserved_paid_credits-v_reservation.credit_cost
    where team_id=v_reservation.team_id;
  else
    update public.team_credit_accounts
    set free_quick_scans_remaining=least(1,free_quick_scans_remaining+1)
    where team_id=v_reservation.team_id;
  end if;
  update public.research_runs set credit_state='restored' where id=p_run_id;
  insert into public.credit_ledger(
    team_id,run_id,reservation_id,event_type,paid_credit_delta,free_credit_delta,metadata
  ) values(
    v_reservation.team_id,p_run_id,v_reservation.id,'restore',
    case when v_reservation.credit_source='paid' then v_reservation.credit_cost else 0 end,
    case when v_reservation.credit_source='free_monthly' then 1 else 0 end,
    jsonb_build_object('report_mode',v_reservation.report_mode)
  );
  return 'restored';
end; $$;

revoke all on function public.finalize_research_credit(uuid,text) from public, anon, authenticated;
grant execute on function public.finalize_research_credit(uuid,text) to service_role;

notify pgrst, 'reload schema';
