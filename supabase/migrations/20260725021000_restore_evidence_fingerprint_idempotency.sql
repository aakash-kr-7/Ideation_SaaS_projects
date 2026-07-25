-- Forward-only repair: claim_fingerprint is nullable, so a non-partial unique
-- index still permits legacy nulls while supporting ON CONFLICT inference.
drop index if exists public.evidence_items_run_claim_fingerprint;
create unique index evidence_items_run_claim_fingerprint
  on public.evidence_items (run_id, claim_fingerprint);

notify pgrst, 'reload schema';
