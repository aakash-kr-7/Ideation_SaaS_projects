-- Migration: Create api_usage_logs table and RLS policies

CREATE TABLE public.api_usage_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.research_runs(id) ON DELETE CASCADE,
  provider text NOT NULL,
  operation text NOT NULL,
  prompt_tokens integer,
  completion_tokens integer,
  cost numeric,
  status text NOT NULL CHECK (status IN ('success', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

-- Select Policy for Tenant Isolation
CREATE POLICY "Users can view logs of their team runs" ON public.api_usage_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.research_runs rr
      JOIN public.projects p ON rr.project_id = p.id
      JOIN public.team_members tm ON p.team_id = tm.team_id
      WHERE rr.id = api_usage_logs.run_id AND tm.user_id = auth.uid()
    )
  );

-- Index for optimization
CREATE INDEX idx_api_usage_logs_run ON public.api_usage_logs(run_id);
