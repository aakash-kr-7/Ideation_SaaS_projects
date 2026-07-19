-- The durable staged queue is the sole execution architecture.
-- NOT VALID preserves historical rows while enforcing the invariant for every
-- new or updated run; validate it after legacy history is archived.
alter table public.research_runs
  add constraint research_runs_staged_pipeline_only
  check (pipeline_version = 'staged') not valid;

comment on column public.research_runs.pipeline_version is
  'Compatibility marker. New and updated rows must use the staged durable queue.';
