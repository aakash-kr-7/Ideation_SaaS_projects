-- Migration: Fix research_stages status enum values

-- Drop the old constraint
ALTER TABLE public.research_stages DROP CONSTRAINT IF EXISTS research_stages_status_check;

-- Update existing rows from Complete to Completed
UPDATE public.research_stages SET status = 'Completed' WHERE status = 'Complete';

-- Apply the new constraint
ALTER TABLE public.research_stages ADD CONSTRAINT research_stages_status_check CHECK (status IN ('Pending', 'Active', 'Completed', 'Failed'));
