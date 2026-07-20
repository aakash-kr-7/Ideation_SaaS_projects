-- Add comprehensive API usage metrics for the canonical gemini_hybrid pipeline.

alter table public.api_usage_logs
  add column if not exists task_type text,
  add column if not exists model text,
  add column if not exists start_time timestamptz,
  add column if not exists end_time timestamptz,
  add column if not exists grounded_search_usage integer,
  add column if not exists retry_count integer default 0,
  add column if not exists error_class text,
  add column if not exists fallback_state text,
  add column if not exists interaction_id text;

alter table public.research_pipeline_metrics
  add column if not exists provider_calls integer default 0,
  add column if not exists grounded_calls integer default 0,
  add column if not exists fallback_calls integer default 0;

-- Notify PostgREST to reload schema cache
notify pgrst, 'reload schema';
