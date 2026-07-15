-- Unify run state and stage-transition history on one canonical vocabulary.
-- research_stages is append-only: each row records a state observed by a run.

ALTER TABLE public.research_stages
  DROP CONSTRAINT IF EXISTS research_stages_status_check;

UPDATE public.research_stages
SET
  status = CASE
    WHEN status = 'Pending' THEN 'Queued'
    WHEN status = 'Active' AND stage_name IN (
      'Queued', 'Searching', 'Extracting', 'Normalizing', 'Scoring',
      'Generating', 'Completed', 'Failed', 'Cancelled'
    ) THEN stage_name
    WHEN status = 'Active' THEN 'Searching'
    ELSE status
  END,
  stage_name = CASE
    WHEN status = 'Pending' THEN 'Queued'
    WHEN status = 'Active' AND stage_name IN (
      'Queued', 'Searching', 'Extracting', 'Normalizing', 'Scoring',
      'Generating', 'Completed', 'Failed', 'Cancelled'
    ) THEN stage_name
    WHEN status = 'Active' THEN 'Searching'
    ELSE status
  END;

ALTER TABLE public.research_stages
  ADD CONSTRAINT research_stages_status_check CHECK (
    status IN (
      'Queued', 'Searching', 'Extracting', 'Normalizing', 'Scoring',
      'Generating', 'Completed', 'Failed', 'Cancelled'
    )
  ),
  ADD CONSTRAINT research_stages_name_matches_status CHECK (stage_name = status);

