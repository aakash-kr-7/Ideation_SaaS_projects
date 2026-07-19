-- Upgrade existing databases created before the reservation routine's output
-- names were configured to prefer table columns.
create or replace function public.create_research_run_with_reservation(
  p_project_id uuid, p_idea_name text, p_idea_description text, p_target_customer text,
  p_market_type text, p_target_region text, p_assumptions jsonb, p_mode public.report_mode,
  p_idempotency_key uuid, p_request_id uuid
)
returns table (
  run_id uuid, run_status text, report_mode public.report_mode, credit_cost integer,
  credit_source text, available_paid_credits integer, free_quick_scans_remaining integer, duplicate boolean
)
language plpgsql security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid := auth.uid(); v_team_id uuid; v_run_id uuid;
  v_existing public.research_runs%rowtype; v_account public.team_credit_accounts%rowtype;
  v_cost integer := case when p_mode = 'quick_scan' then 1 else 3 end;
  v_source text; v_reservation_id uuid;
begin
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  if p_idempotency_key is null or p_request_id is null then raise exception 'IDEMPOTENCY_AND_REQUEST_ID_REQUIRED'; end if;
  if length(trim(p_idea_name)) < 1 or length(trim(p_idea_description)) < 10 or length(trim(p_target_customer)) < 1 or length(trim(p_target_region)) < 1 then raise exception 'INVALID_RESEARCH_INPUT'; end if;
  select p.team_id into v_team_id from public.projects p where p.id = p_project_id and public.is_team_member(p.team_id, v_user_id);
  if v_team_id is null then raise exception 'PROJECT_ACCESS_DENIED'; end if;
  select * into v_existing from public.research_runs where created_by = v_user_id and idempotency_key = p_idempotency_key;
  if found then
    return query select v_existing.id, v_existing.status::text, v_existing.mode, v_existing.credit_cost,
      coalesce(cr.credit_source, 'paid'), a.paid_credits, a.free_quick_scans_remaining, true
    from public.team_credit_accounts a left join public.credit_reservations cr on cr.run_id = v_existing.id where a.team_id = v_team_id;
    return;
  end if;
  perform public.refresh_monthly_quick_scan(v_team_id);
  select * into v_account from public.team_credit_accounts where team_id = v_team_id for update;
  if p_mode = 'quick_scan' and v_account.free_quick_scans_remaining > 0 then
    v_source := 'free_monthly';
    update public.team_credit_accounts set free_quick_scans_remaining = team_credit_accounts.free_quick_scans_remaining - 1 where team_id = v_team_id;
  elsif v_account.paid_credits >= v_cost then
    v_source := 'paid';
    update public.team_credit_accounts set paid_credits = team_credit_accounts.paid_credits - v_cost, reserved_paid_credits = team_credit_accounts.reserved_paid_credits + v_cost where team_id = v_team_id;
  else
    raise exception 'INSUFFICIENT_CREDITS:%:%', v_cost, v_account.paid_credits + case when p_mode = 'quick_scan' then v_account.free_quick_scans_remaining else 0 end;
  end if;
  insert into public.research_runs (project_id,created_by,idea_name,idea_description,target_customer,market_type,target_region,assumptions,mode,status,progress,progress_detail,idempotency_key,request_id,credit_cost,credit_state)
  values (p_project_id,v_user_id,trim(p_idea_name),trim(p_idea_description),trim(p_target_customer),p_market_type,trim(p_target_region),coalesce(p_assumptions,'{}'::jsonb),p_mode,'Queued',0,'Preparing research',p_idempotency_key,p_request_id,v_cost,'reserved') returning id into v_run_id;
  insert into public.credit_reservations (team_id,run_id,report_mode,credit_cost,credit_source,idempotency_key) values (v_team_id,v_run_id,p_mode,v_cost,v_source,p_idempotency_key) returning id into v_reservation_id;
  insert into public.credit_ledger (team_id,run_id,reservation_id,event_type,paid_credit_delta,free_credit_delta,metadata) values (v_team_id,v_run_id,v_reservation_id,'reserve',case when v_source='paid' then -v_cost else 0 end,case when v_source='free_monthly' then -1 else 0 end,jsonb_build_object('report_mode',p_mode,'request_id',p_request_id));
  insert into public.research_stages (run_id,stage_name,status,progress_detail,started_at,completed_at) values (v_run_id,'Queued','Queued','Preparing research',now(),now());
  insert into public.analytics_events (user_id,event_name,event_data) values (v_user_id,'research_run_reserved',jsonb_build_object('run_id',v_run_id,'report_mode',p_mode,'credit_cost',v_cost,'credit_source',v_source,'request_id',p_request_id));
  select * into v_account from public.team_credit_accounts where team_id = v_team_id;
  return query select v_run_id,'Queued',p_mode,v_cost,v_source,v_account.paid_credits,v_account.free_quick_scans_remaining,false;
end;
$$;
