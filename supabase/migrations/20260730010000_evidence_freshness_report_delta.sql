-- Living evidence, immutable report deltas, public score identity, and opt-in
-- founder outcomes. Official scoring weights and score ownership are untouched.

create table public.evidence_freshness_policies (
  policy_key text primary key,
  label text not null,
  evidence_families text[] not null default '{}',
  max_age_days integer not null check (max_age_days > 0),
  revalidation_interval_days integer not null
    check (revalidation_interval_days > 0),
  aging_threshold numeric(4,3) not null
    check (aging_threshold > 0 and aging_threshold < 1),
  use_expected_next_release boolean not null default false,
  visible_vintage boolean not null default true,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.evidence_freshness_policies (
  policy_key, label, evidence_families, max_age_days,
  revalidation_interval_days, aging_threshold,
  use_expected_next_release, visible_vintage
) values
  ('competitor_pricing_features', 'Competitor pricing and features',
    array['competitors','alternatives','pricing'], 45, 14, 0.670, false, true),
  ('regulation', 'Regulation and official guidance',
    array['regulation','risks','delivery_feasibility'], 120, 30, 0.670, false, true),
  ('community', 'Community and buyer-voice evidence',
    array['customer_pain','behavior_demand','willingness_to_pay'], 180, 60, 0.750, false, true),
  ('official_statistics', 'Official statistics',
    array['market_context','segments','official_statistics'], 450, 90, 0.800, true, true),
  ('foundational_research', 'Foundational research',
    array['research','study','foundational_research'], 1825, 365, 0.800, false, true),
  ('default', 'General web evidence',
    array['general'], 270, 90, 0.750, false, true)
on conflict (policy_key) do update set
  label = excluded.label,
  evidence_families = excluded.evidence_families,
  max_age_days = excluded.max_age_days,
  revalidation_interval_days = excluded.revalidation_interval_days,
  aging_threshold = excluded.aging_threshold,
  use_expected_next_release = excluded.use_expected_next_release,
  visible_vintage = excluded.visible_vintage,
  updated_at = now();

alter table public.evidence_items
  add column if not exists freshness_policy_key text
    references public.evidence_freshness_policies(policy_key),
  add column if not exists retrieved_at timestamptz,
  add column if not exists revalidation_due_at timestamptz,
  add column if not exists content_hash text,
  add column if not exists content_hash_scope text,
  add column if not exists source_etag text,
  add column if not exists source_last_modified text,
  add column if not exists expected_next_release_at timestamptz,
  add column if not exists freshness_state text,
  add column if not exists last_material_change_at timestamptz;

-- Historical accepted rows retain an explicitly labelled excerpt hash. Unknown
-- publication dates stay null and are never inferred from retrieval_date.
update public.evidence_items
set freshness_policy_key = coalesce(
      freshness_policy_key,
      case
        when coalesce(evidence_topic, source_family, '') ~* 'competitor|alternative|pricing|price|feature'
          then 'competitor_pricing_features'
        when coalesce(evidence_topic, source_family, '') ~* 'regulat|legal|law|compliance|guidance'
          then 'regulation'
        when coalesce(source_class, source_family, '') ~* 'community|forum|review'
          then 'community'
        when coalesce(evidence_topic, source_family, '') ~* 'statistic|census|dataset|market_context'
          then 'official_statistics'
        when coalesce(evidence_topic, source_family, '') ~* 'research|study|paper|journal'
          then 'foundational_research'
        else 'default'
      end
    ),
    retrieved_at = coalesce(retrieved_at, retrieval_date::timestamptz),
    content_hash = coalesce(
      content_hash,
      md5(coalesce(relevant_excerpt, snippet, ''))
    ),
    content_hash_scope = coalesce(content_hash_scope, 'accepted_excerpt_md5'),
    revalidation_due_at = coalesce(
      revalidation_due_at,
      retrieval_date::timestamptz + case
        when coalesce(evidence_topic, source_family, '') ~* 'competitor|alternative|pricing|price|feature'
          then interval '14 days'
        when coalesce(evidence_topic, source_family, '') ~* 'regulat|legal|law|compliance|guidance'
          then interval '30 days'
        when coalesce(source_class, source_family, '') ~* 'community|forum|review'
          then interval '60 days'
        when coalesce(evidence_topic, source_family, '') ~* 'statistic|census|dataset|market_context'
          then interval '90 days'
        when coalesce(evidence_topic, source_family, '') ~* 'research|study|paper|journal'
          then interval '365 days'
        else interval '90 days'
      end
    ),
    freshness_state = coalesce(
      freshness_state,
      case
        when published_or_updated_at is null then 'unknown_date'
        else 'revalidation_due'
      end
    ),
    last_material_change_at = coalesce(
      last_material_change_at,
      published_or_updated_at::timestamptz
    )
where freshness_policy_key is null
   or retrieved_at is null
   or revalidation_due_at is null
   or content_hash is null
   or content_hash_scope is null
   or freshness_state is null;

alter table public.evidence_items
  add constraint evidence_items_freshness_state_check
    check (freshness_state is null or freshness_state in (
      'fresh','aging','revalidation_due','stale','unknown_date'
    )),
  add constraint evidence_items_content_hash_present
    check (content_hash is null or length(content_hash) >= 32),
  add constraint accepted_evidence_has_freshness_contract
    check (
      acceptance_decision is distinct from 'accepted_core'
      or (
        freshness_policy_key is not null
        and retrieved_at is not null
        and revalidation_due_at is not null
        and content_hash is not null
        and content_hash_scope is not null
        and freshness_state is not null
      )
    );

create index evidence_items_revalidation_due_idx
  on public.evidence_items(revalidation_due_at, freshness_state)
  where acceptance_decision = 'accepted_core' and not excluded;

alter table public.report_versions
  add column if not exists current_as_of date not null default current_date,
  add column if not exists previous_version_id uuid
    references public.report_versions(id) on delete restrict,
  add column if not exists version_reason text not null default 'initial'
    check (version_reason in ('initial','evidence_refresh')),
  add column if not exists report_delta jsonb;

create table public.report_refresh_runs (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  base_version_id uuid not null references public.report_versions(id) on delete restrict,
  created_version_id uuid references public.report_versions(id) on delete restrict,
  status text not null check (status in (
    'running','no_change','changed','failed'
  )),
  cited_sources_targeted integer not null default 0 check (cited_sources_targeted >= 0),
  decision_critical_sources_targeted integer not null default 0
    check (decision_critical_sources_targeted >= 0),
  sources_checked integer not null default 0 check (sources_checked >= 0),
  successful_no_change_checks integer not null default 0
    check (successful_no_change_checks >= 0),
  material_changes integer not null default 0 check (material_changes >= 0),
  llm_calls integer not null default 0 check (llm_calls >= 0),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text
);

create table public.evidence_source_refresh_checks (
  id uuid primary key default gen_random_uuid(),
  refresh_run_id uuid not null references public.report_refresh_runs(id) on delete cascade,
  source_id uuid references public.sources(id) on delete set null,
  canonical_url text not null check (canonical_url ~ '^https?://'),
  cited boolean not null default false,
  decision_critical boolean not null default false,
  check_method text not null check (check_method in (
    'conditional_get','content_hash','sitemap','rss','changelog'
  )),
  http_status integer,
  previous_content_hash text,
  observed_content_hash text,
  previous_etag text,
  observed_etag text,
  previous_last_modified text,
  observed_last_modified text,
  material_change boolean not null default false,
  change_kind text,
  affected_claim_ids text[] not null default '{}',
  affected_propositions text[] not null default '{}',
  affected_factors text[] not null default '{}',
  checked_at timestamptz not null default now(),
  unique (refresh_run_id, canonical_url)
);

create table public.report_version_deltas (
  report_version_id uuid primary key references public.report_versions(id) on delete cascade,
  previous_version_id uuid not null references public.report_versions(id) on delete restrict,
  current_as_of date not null,
  stale_evidence_warning text,
  changed_sources jsonb not null default '[]'::jsonb,
  affected_propositions text[] not null default '{}',
  affected_factors text[] not null default '{}',
  previous_score numeric not null,
  current_score numeric not null,
  score_delta numeric not null,
  previous_verdict text not null,
  current_verdict text not null,
  material_changes text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.report_verification_cards (
  report_version_id uuid primary key references public.report_versions(id) on delete cascade,
  public_id uuid not null unique default gen_random_uuid(),
  payload jsonb not null,
  current_as_of date not null,
  created_at timestamptz not null default now()
);

create table public.founder_outcome_checkpoints (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  opted_in boolean not null default false,
  checkpoint_day integer not null check (checkpoint_day in (30,90,180)),
  interviews_completed integer check (interviews_completed is null or interviews_completed >= 0),
  paid_commitments integer check (paid_commitments is null or paid_commitments >= 0),
  mvp_launched boolean,
  first_revenue boolean,
  retained_customers integer check (retained_customers is null or retained_customers >= 0),
  declared_milestone_reached boolean,
  idea_abandoned boolean,
  abandonment_reason text,
  checkpoint_due_at timestamptz not null,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, user_id, checkpoint_day),
  check (idea_abandoned is distinct from true or nullif(trim(abandonment_reason), '') is not null)
);

create index report_refresh_runs_report_idx
  on public.report_refresh_runs(report_id, started_at desc);
create unique index report_refresh_runs_one_running_idx
  on public.report_refresh_runs(report_id)
  where status = 'running';
create index evidence_source_refresh_checks_run_idx
  on public.evidence_source_refresh_checks(refresh_run_id, material_change);
create index report_version_deltas_previous_idx
  on public.report_version_deltas(previous_version_id);
create index founder_outcome_checkpoints_due_idx
  on public.founder_outcome_checkpoints(user_id, checkpoint_due_at)
  where opted_in and submitted_at is null;

alter table public.evidence_freshness_policies enable row level security;
alter table public.report_refresh_runs enable row level security;
alter table public.evidence_source_refresh_checks enable row level security;
alter table public.report_version_deltas enable row level security;
alter table public.report_verification_cards enable row level security;
alter table public.founder_outcome_checkpoints enable row level security;

alter table public.evidence_freshness_policies force row level security;
alter table public.report_refresh_runs force row level security;
alter table public.evidence_source_refresh_checks force row level security;
alter table public.report_version_deltas force row level security;
alter table public.report_verification_cards force row level security;
alter table public.founder_outcome_checkpoints force row level security;

revoke all on public.evidence_freshness_policies,
  public.report_refresh_runs,
  public.evidence_source_refresh_checks,
  public.report_version_deltas,
  public.report_verification_cards from public, anon, authenticated;
grant select, insert, update, delete on public.evidence_freshness_policies,
  public.report_refresh_runs,
  public.evidence_source_refresh_checks,
  public.report_version_deltas,
  public.report_verification_cards to service_role;

revoke all on public.founder_outcome_checkpoints from public, anon, authenticated;
grant all on public.founder_outcome_checkpoints to service_role;
grant select, insert, update on public.founder_outcome_checkpoints to authenticated;

create policy "Users manage their own opted-in outcome checkpoints"
  on public.founder_outcome_checkpoints
  for all to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1
      from public.reports r
      join public.research_runs rr on rr.id = r.run_id
      join public.projects p on p.id = rr.project_id
      join public.team_members tm on tm.team_id = p.team_id
      where r.id = founder_outcome_checkpoints.report_id
        and tm.user_id = auth.uid()
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.reports r
      join public.research_runs rr on rr.id = r.run_id
      join public.projects p on p.id = rr.project_id
      join public.team_members tm on tm.team_id = p.team_id
      where r.id = founder_outcome_checkpoints.report_id
        and tm.user_id = auth.uid()
    )
  );

create or replace function public.persist_changed_report_refresh(
  p_refresh_run_id uuid,
  p_report_id uuid,
  p_base_version_id uuid,
  p_new_version_id uuid,
  p_payload jsonb,
  p_delta jsonb,
  p_verification_card jsonb,
  p_current_as_of date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_base public.report_versions;
  v_latest_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  perform 1 from public.reports where id = p_report_id for update;
  select rv.id into v_latest_id
  from public.report_versions rv
  where rv.report_id = p_report_id
  order by rv.version_number desc, rv.created_at desc
  limit 1;
  if v_latest_id is distinct from p_base_version_id then
    raise exception 'REPORT_REFRESH_BASE_VERSION_IS_NOT_LATEST';
  end if;
  select * into v_base
  from public.report_versions
  where id = p_base_version_id and report_id = p_report_id;
  if v_base.id is null then
    raise exception 'REPORT_REFRESH_BASE_VERSION_NOT_FOUND';
  end if;

  insert into public.report_versions (
    id, report_id, version_number, payload, report_mode,
    adversarial_gate, citation_validation, reasoning_flags,
    verdict_score_mismatch, market_sizing, decision_integrity,
    adversarial_downgrade, current_as_of, previous_version_id,
    version_reason, report_delta
  ) values (
    p_new_version_id, p_report_id, v_base.version_number + 1, p_payload,
    v_base.report_mode, v_base.adversarial_gate, v_base.citation_validation,
    v_base.reasoning_flags, v_base.verdict_score_mismatch,
    v_base.market_sizing, v_base.decision_integrity,
    v_base.adversarial_downgrade, p_current_as_of, v_base.id,
    'evidence_refresh', p_delta
  );

  insert into public.report_version_deltas (
    report_version_id, previous_version_id, current_as_of,
    stale_evidence_warning, changed_sources, affected_propositions,
    affected_factors, previous_score, current_score, score_delta,
    previous_verdict, current_verdict, material_changes
  ) values (
    p_new_version_id, v_base.id, p_current_as_of,
    p_delta->>'staleEvidenceWarning',
    coalesce(p_delta->'changedSources', '[]'::jsonb),
    array(select jsonb_array_elements_text(
      coalesce(p_delta->'affectedPropositions', '[]'::jsonb)
    )),
    array(select jsonb_array_elements_text(
      coalesce(p_delta->'affectedFactors', '[]'::jsonb)
    )),
    (p_delta#>>'{scoreMovement,previous}')::numeric,
    (p_delta#>>'{scoreMovement,current}')::numeric,
    (p_delta#>>'{scoreMovement,delta}')::numeric,
    p_delta#>>'{verdictMovement,previous}',
    p_delta#>>'{verdictMovement,current}',
    array(select jsonb_array_elements_text(
      coalesce(p_delta->'materialChanges', '[]'::jsonb)
    ))
  );

  insert into public.report_verification_cards (
    report_version_id, public_id, payload, current_as_of
  ) values (
    p_new_version_id, p_new_version_id, p_verification_card, p_current_as_of
  );

  update public.report_refresh_runs
  set status = 'changed',
      created_version_id = p_new_version_id,
      material_changes = jsonb_array_length(
        coalesce(p_delta->'changedSources', '[]'::jsonb)
      ),
      completed_at = now()
  where id = p_refresh_run_id
    and report_id = p_report_id
    and base_version_id = p_base_version_id;
  if not found then
    raise exception 'REPORT_REFRESH_RUN_NOT_FOUND';
  end if;
  return p_new_version_id;
end;
$$;

create or replace function public.complete_report_refresh_no_change(
  p_refresh_run_id uuid,
  p_sources_checked integer,
  p_successful_no_change_checks integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  update public.report_refresh_runs
  set status = 'no_change',
      sources_checked = greatest(0, p_sources_checked),
      successful_no_change_checks = greatest(
        0, p_successful_no_change_checks
      ),
      llm_calls = 0,
      completed_at = now()
  where id = p_refresh_run_id and status = 'running';
  if not found then raise exception 'REPORT_REFRESH_RUN_NOT_RUNNING'; end if;
end;
$$;

create or replace function public.opt_in_founder_outcome_checkpoints(
  p_report_id uuid
)
returns setof public.founder_outcome_checkpoints
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_generated_at timestamptz;
  v_day integer;
begin
  if v_user_id is null then raise exception 'AUTHENTICATION_REQUIRED'; end if;
  select r.generated_at into v_generated_at
  from public.reports r
  join public.research_runs rr on rr.id = r.run_id
  join public.projects p on p.id = rr.project_id
  join public.team_members tm on tm.team_id = p.team_id
  where r.id = p_report_id and tm.user_id = v_user_id;
  if v_generated_at is null then raise exception 'REPORT_NOT_FOUND'; end if;
  foreach v_day in array array[30,90,180] loop
    insert into public.founder_outcome_checkpoints (
      report_id, user_id, opted_in, checkpoint_day, checkpoint_due_at
    ) values (
      p_report_id, v_user_id, true, v_day,
      v_generated_at + make_interval(days => v_day)
    )
    on conflict (report_id, user_id, checkpoint_day) do update
      set opted_in = true, updated_at = now();
  end loop;
  return query
    select *
    from public.founder_outcome_checkpoints
    where report_id = p_report_id and user_id = v_user_id
    order by checkpoint_day;
end;
$$;

revoke all on function public.persist_changed_report_refresh(
  uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,date
) from public, anon, authenticated;
grant execute on function public.persist_changed_report_refresh(
  uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,date
) to service_role;
revoke all on function public.complete_report_refresh_no_change(uuid,integer,integer)
  from public, anon, authenticated;
grant execute on function public.complete_report_refresh_no_change(uuid,integer,integer)
  to service_role;
revoke all on function public.opt_in_founder_outcome_checkpoints(uuid)
  from public, anon;
grant execute on function public.opt_in_founder_outcome_checkpoints(uuid)
  to authenticated, service_role;

-- A single schedule per report is enough because evidence-family policies
-- determine the actual page-level due dates. The scheduler only wakes reports
-- whose next decision-critical check is due.
create table public.report_refresh_schedules (
  report_id uuid primary key references public.reports(id) on delete cascade,
  enabled boolean not null default false,
  cadence_days integer not null default 1 check (cadence_days between 1 and 30),
  next_refresh_at timestamptz,
  last_refresh_run_id uuid references public.report_refresh_runs(id) on delete set null,
  last_refresh_status text check (
    last_refresh_status is null or
    last_refresh_status in ('no_change','changed','failed')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.report_refresh_requests (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','running','completed','failed')),
  refresh_run_id uuid references public.report_refresh_runs(id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index report_refresh_schedules_due_idx
  on public.report_refresh_schedules(next_refresh_at)
  where enabled;
create unique index report_refresh_requests_one_open_idx
  on public.report_refresh_requests(report_id)
  where status in ('pending','running');
create index report_refresh_requests_pending_idx
  on public.report_refresh_requests(created_at)
  where status = 'pending';

alter table public.report_refresh_schedules enable row level security;
alter table public.report_refresh_schedules force row level security;
alter table public.report_refresh_requests enable row level security;
alter table public.report_refresh_requests force row level security;
revoke all on public.report_refresh_schedules,
  public.report_refresh_requests from public, anon, authenticated;
grant select, insert, update, delete on public.report_refresh_schedules,
  public.report_refresh_requests
  to service_role;

-- Refresh exports and charts are prepared before this transaction. Their
-- metadata is committed with the immutable version so readers never observe a
-- refreshed version without its complete artifact set.
create or replace function public.persist_changed_report_refresh_with_artifacts(
  p_refresh_run_id uuid,
  p_report_id uuid,
  p_base_version_id uuid,
  p_new_version_id uuid,
  p_payload jsonb,
  p_delta jsonb,
  p_verification_card jsonb,
  p_current_as_of date,
  p_exports jsonb,
  p_charts jsonb,
  p_evidence_updates jsonb,
  p_source_updates jsonb,
  p_score_update jsonb,
  p_breakdowns jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_version_id uuid;
  v_export jsonb;
  v_chart jsonb;
  v_evidence jsonb;
  v_source jsonb;
  v_breakdown jsonb;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;

  v_version_id := public.persist_changed_report_refresh(
    p_refresh_run_id, p_report_id, p_base_version_id, p_new_version_id,
    p_payload, p_delta, p_verification_card, p_current_as_of
  );

  for v_evidence in
    select value from jsonb_array_elements(
      coalesce(p_evidence_updates, '[]'::jsonb)
    )
  loop
    update public.evidence_items set
      atomic_claim = coalesce(v_evidence->>'atomicClaim', atomic_claim),
      title = coalesce(v_evidence->>'title', title),
      snippet = coalesce(v_evidence->>'excerpt', snippet),
      relevant_excerpt = coalesce(v_evidence->>'excerpt', relevant_excerpt),
      signal_type = coalesce(v_evidence->>'signalType', signal_type),
      strength = coalesce(v_evidence->>'strength', strength),
      evidence_role = coalesce(v_evidence->>'evidenceRole', evidence_role),
      disconfirming = case
        when v_evidence ? 'evidenceRole'
          then v_evidence->>'evidenceRole' = 'challenging'
        else disconfirming
      end,
      excluded = coalesce((v_evidence->>'removed')::boolean, excluded),
      exclusion_reason = case
        when coalesce((v_evidence->>'removed')::boolean, false)
          then 'Source refresh no longer supports this accepted claim.'
        else exclusion_reason
      end,
      published_or_updated_at = coalesce(
        (v_evidence->>'publishedOrUpdatedAt')::date,
        published_or_updated_at
      ),
      retrieved_at = (v_evidence->>'retrievedAt')::timestamptz,
      retrieval_date = (v_evidence->>'retrievedAt')::date,
      revalidation_due_at = (v_evidence->>'revalidationDueAt')::timestamptz,
      freshness_state = v_evidence->>'freshnessState',
      last_material_change_at =
        (v_evidence->>'lastMaterialChangeAt')::timestamptz,
      content_hash = v_evidence->>'contentHash',
      content_hash_scope = 'normalized_page_sha256',
      source_etag = v_evidence->>'etag',
      source_last_modified = v_evidence->>'lastModified',
      updated_at = now()
    where id = (v_evidence->>'id')::uuid;
  end loop;

  for v_source in
    select value from jsonb_array_elements(
      coalesce(p_source_updates, '[]'::jsonb)
    )
  loop
    update public.sources set
      text_content = v_source->>'content',
      canonical_url = coalesce(v_source->>'canonicalUrl', canonical_url),
      published_at = coalesce(
        (v_source->>'publishedOrUpdatedAt')::timestamptz,
        published_at
      ),
      retrieval_date = (v_source->>'retrievedAt')::date,
      updated_at = now()
    where id = (v_source->>'id')::uuid;
  end loop;

  update public.opportunity_scores set
    total = (p_score_update->>'total')::numeric,
    confidence = (p_score_update->>'confidence')::numeric,
    verdict = p_score_update->>'verdict'
  where id = (p_score_update->>'id')::uuid;

  for v_breakdown in
    select value from jsonb_array_elements(coalesce(p_breakdowns, '[]'::jsonb))
  loop
    update public.score_breakdowns set
      score = (v_breakdown->>'score')::numeric,
      raw_score = (v_breakdown->>'rawScore')::numeric,
      evidence_coefficient =
        (v_breakdown->>'evidenceCoefficient')::numeric,
      effective_score = (v_breakdown->>'effectiveScore')::numeric,
      evidence_state = v_breakdown->>'evidenceState',
      supporting_evidence_ids = array(
        select jsonb_array_elements_text(
          coalesce(v_breakdown->'supportingEvidenceIds', '[]'::jsonb)
        )
      )::uuid[],
      challenging_evidence_ids = array(
        select jsonb_array_elements_text(
          coalesce(v_breakdown->'challengingEvidenceIds', '[]'::jsonb)
        )
      )::uuid[],
      confidence_deductions = array(
        select jsonb_array_elements_text(
          coalesce(v_breakdown->'confidenceDeductions', '[]'::jsonb)
        )
      ),
      unresolved_gaps = array(
        select jsonb_array_elements_text(
          coalesce(v_breakdown->'unresolvedGaps', '[]'::jsonb)
        )
      ),
      notes = v_breakdown->>'note'
    where score_id = (p_score_update->>'id')::uuid
      and criterion = v_breakdown->>'criterion';
  end loop;

  for v_export in
    select value from jsonb_array_elements(coalesce(p_exports, '[]'::jsonb))
  loop
    insert into public.report_exports (
      report_version_id, format, storage_path, byte_size, sha256
    ) values (
      v_version_id,
      v_export->>'format',
      v_export->>'storagePath',
      (v_export->>'byteSize')::bigint,
      v_export->>'sha256'
    );
  end loop;

  for v_chart in
    select value from jsonb_array_elements(coalesce(p_charts, '[]'::jsonb))
  loop
    insert into public.report_chart_datasets (
      report_version_id, run_id, chart_key, chart_type, source_data,
      chart_config, supporting_evidence_ids, sha256
    ) values (
      v_version_id,
      (v_chart->>'runId')::uuid,
      v_chart->>'chartKey',
      v_chart->>'chartType',
      coalesce(v_chart->'sourceData', '{}'::jsonb),
      coalesce(v_chart->'chartConfig', '{}'::jsonb),
      array(
        select jsonb_array_elements_text(
          coalesce(v_chart->'supportingEvidenceIds', '[]'::jsonb)
        )
      )::uuid[],
      v_chart->>'sha256'
    );
  end loop;

  update public.report_refresh_runs
  set llm_calls = jsonb_array_length(
    coalesce(p_source_updates, '[]'::jsonb)
  )
  where id = p_refresh_run_id;

  return v_version_id;
end;
$$;

revoke all on function public.persist_changed_report_refresh_with_artifacts(
  uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,date,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.persist_changed_report_refresh_with_artifacts(
  uuid,uuid,uuid,uuid,jsonb,jsonb,jsonb,date,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) to service_role;

notify pgrst, 'reload schema';
