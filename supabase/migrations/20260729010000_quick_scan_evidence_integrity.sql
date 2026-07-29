-- Quick Scan evidence integrity: canonical evidence identity, factor-level
-- confidence, uncertainty-aware presentation, and competitor verification.
-- Additive columns preserve all immutable report payloads and Full Validation.

alter table public.evidence_items
  add column if not exists claim_id text,
  add column if not exists canonical_source_id uuid references public.sources(id) on delete set null,
  add column if not exists canonical_domain text,
  add column if not exists source_family text,
  add column if not exists source_authority numeric,
  add column if not exists evidence_directness numeric,
  add column if not exists semantic_relevance numeric,
  add column if not exists independence_key text,
  add column if not exists syndication_group text,
  add column if not exists evidence_role text,
  add column if not exists associated_factor_ids text[] not null default '{}',
  add column if not exists extraction_confidence numeric,
  add column if not exists numeric_validation_state text,
  add column if not exists model_classification_metadata jsonb;

update public.evidence_items
set claim_id = coalesce(claim_id, 'claim:' || coalesce(claim_fingerprint, id::text)),
    canonical_source_id = coalesce(canonical_source_id, source_id),
    canonical_domain = coalesce(canonical_domain, source_domain),
    source_family = coalesce(source_family, evidence_topic, evidence_family, 'unclassified'),
    source_authority = coalesce(source_authority, case source_tier when 1 then 1 when 2 then 0.8 when 3 then 0.45 else 0 end),
    evidence_directness = coalesce(evidence_directness, case source_tier when 1 then 0.85 when 2 then 0.65 else 0.4 end),
    semantic_relevance = coalesce(semantic_relevance, relevance_score, 0),
    independence_key = coalesce(independence_key, claim_fingerprint, source_id::text, id::text),
    syndication_group = coalesce(syndication_group, claim_fingerprint, source_domain),
    evidence_role = coalesce(evidence_role, case when disconfirming then 'challenging' else 'supporting' end),
    extraction_confidence = coalesce(extraction_confidence, case when verified then 0.9 else 0.5 end),
    numeric_validation_state = coalesce(numeric_validation_state, case when numeric_value is null then 'not_applicable' else 'not_checked' end),
    model_classification_metadata = coalesce(model_classification_metadata, jsonb_build_object(
      'geminiRelevanceScore', gemini_relevance_score,
      'relevanceClass', relevance_class,
      'acceptanceDecision', acceptance_decision
    ));

alter table public.evidence_items
  add constraint evidence_items_source_authority_range check (source_authority between 0 and 1),
  add constraint evidence_items_directness_range check (evidence_directness between 0 and 1),
  add constraint evidence_items_semantic_relevance_range check (semantic_relevance between 0 and 1),
  add constraint evidence_items_extraction_confidence_range check (extraction_confidence between 0 and 1),
  add constraint evidence_items_role check (evidence_role in ('supporting', 'challenging')),
  add constraint evidence_items_numeric_validation_state check (
    numeric_validation_state in ('verified', 'flagged', 'rejected', 'not_applicable', 'not_checked')
  );

create index if not exists evidence_items_run_independence_idx
  on public.evidence_items(run_id, independence_key);
create index if not exists evidence_items_run_factor_ids_idx
  on public.evidence_items using gin(associated_factor_ids);

alter table public.score_breakdowns
  add column if not exists raw_score numeric,
  add column if not exists evidence_coefficient numeric,
  add column if not exists effective_score numeric,
  add column if not exists evidence_state text,
  add column if not exists supporting_evidence_ids uuid[] not null default '{}',
  add column if not exists challenging_evidence_ids uuid[] not null default '{}',
  add column if not exists confidence_deductions jsonb not null default '[]'::jsonb,
  add column if not exists unresolved_gaps jsonb not null default '[]'::jsonb;

update public.score_breakdowns
set raw_score = coalesce(raw_score, score),
    evidence_coefficient = coalesce(evidence_coefficient, 1),
    effective_score = coalesce(effective_score, score),
    evidence_state = coalesce(evidence_state, 'EVIDENCED');

alter table public.score_breakdowns
  add constraint score_breakdowns_evidence_coefficient_range check (evidence_coefficient between 0 and 1),
  add constraint score_breakdowns_evidence_state check (evidence_state in ('EVIDENCED', 'SUGGESTIVE', 'ASSUMED'));

alter table public.competitors
  add column if not exists verification_status text,
  add column if not exists verified_at timestamptz;

update public.competitors
set verification_status = coalesce(
  verification_status,
  case
    when cardinality(evidence_ids) > 0 and classification = 'adjacent' then 'adjacent_alternative'
    when cardinality(evidence_ids) > 0 then 'live_verified_competitor'
    else 'unverified_seed'
  end
);

alter table public.competitors
  alter column verification_status set not null,
  add constraint competitors_verification_status check (
    verification_status in (
      'discovered_candidate',
      'live_verified_competitor',
      'adjacent_alternative',
      'unverified_seed'
    )
  );

alter table public.pricing_models alter column target_customers drop not null;
alter table public.mvp_plans alter column build_complexity drop not null;

notify pgrst, 'reload schema';
