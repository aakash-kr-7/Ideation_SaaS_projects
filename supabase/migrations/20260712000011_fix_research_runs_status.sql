-- First, drop the old constraint so we can update values that would otherwise violate it
ALTER TABLE public.research_runs DROP CONSTRAINT IF EXISTS research_runs_status_check;

-- Update any existing rows to match the new constraint values
UPDATE public.research_runs SET status = 'Searching' WHERE status = 'Researching';
UPDATE public.research_runs SET status = 'Completed' WHERE status = 'Complete';

-- Apply the new constraint
ALTER TABLE public.research_runs ADD CONSTRAINT research_runs_status_check CHECK (status IN ('Queued', 'Searching', 'Extracting', 'Normalizing', 'Scoring', 'Generating', 'Completed', 'Failed', 'Cancelled'));
