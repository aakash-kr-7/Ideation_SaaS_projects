-- Keep the immutable report snapshot's decision record queryable and prevent
-- adversarial downgrades from being conflated with score/narrative mismatches.

alter table public.report_versions
  add column if not exists decision_integrity jsonb,
  add column if not exists adversarial_downgrade boolean not null default false;

comment on column public.report_versions.verdict_score_mismatch is
  'True only when the Final Judge written verdict differs from the provider-free deterministic score tier.';

comment on column public.report_versions.adversarial_downgrade is
  'True when a strong unresolved adversarial objection code-gated the effective verdict to Weak Signal.';

comment on column public.report_versions.decision_integrity is
  'Exact deterministic, effective, and Final Judge verdict comparison exported with this immutable report version.';
