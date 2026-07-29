-- Product contract metadata around the unchanged deterministic 12-factor
-- score. Evidence confidence remains a separate persisted field.

alter table public.full_validation_decisions
  add column if not exists score_contract jsonb not null default '{}'::jsonb,
  add column if not exists readiness_rollups jsonb not null default '[]'::jsonb,
  add column if not exists score_change_contract jsonb not null default '{}'::jsonb,
  add column if not exists verification_card jsonb not null default '{}'::jsonb,
  add column if not exists decision_contract jsonb;

notify pgrst, 'reload schema';
