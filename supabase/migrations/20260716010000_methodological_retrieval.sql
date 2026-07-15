-- Multi-pass, methodology-aware retrieval with source quality and traceable sizing.

alter table public.sources
  add column if not exists research_query_id uuid,
  add column if not exists evidence_family text check (evidence_family in ('problem','solution')),
  add column if not exists research_pass integer check (research_pass between 1 and 3),
  add column if not exists source_tier integer check (source_tier between 1 and 4),
  add column if not exists tier_reason text,
  add column if not exists excluded boolean not null default false,
  add column if not exists exclusion_reason text,
  add column if not exists source_domain text,
  add column if not exists author text;

alter table public.evidence_items
  add column if not exists evidence_family text check (evidence_family in ('problem','solution')),
  add column if not exists research_pass integer check (research_pass between 1 and 3),
  add column if not exists source_tier integer check (source_tier between 1 and 4),
  add column if not exists excluded boolean not null default false,
  add column if not exists disconfirming boolean not null default false,
  add column if not exists pain_point text,
  add column if not exists author text,
  add column if not exists named_entities text[] not null default '{}',
  add column if not exists source_domain text,
  add column if not exists independent_source_count integer not null default 1 check (independent_source_count >= 0),
  add column if not exists independent_domain_count integer not null default 1 check (independent_domain_count >= 0),
  add column if not exists market_size_metric text check (market_size_metric in ('TAM','SAM','SOM','MarketSize')),
  add column if not exists market_size_figure text;

create table public.research_queries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  pass_number integer not null check (pass_number between 1 and 3),
  evidence_family text not null check (evidence_family in ('problem','solution')),
  objective text not null check (objective in ('broad','targeted','disconfirming','market-sizing')),
  query text not null,
  triggered_by_evidence_ids uuid[] not null default '{}',
  status text not null check (status in ('Running','Complete','Failed')),
  result_count integer not null default 0 check (result_count >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.sources
  add constraint sources_research_query_id_fkey foreign key (research_query_id)
  references public.research_queries(id) on delete set null;

create table public.research_passes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  pass_number integer not null check (pass_number between 1 and 3),
  objective text not null check (objective in ('broad','targeted','disconfirming')),
  query_count integer not null default 0 check (query_count >= 0),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  sufficient boolean not null default false,
  coverage jsonb not null default '{}'::jsonb,
  coverage_gaps text[] not null default '{}',
  budget_limited boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (run_id, pass_number)
);

alter table public.research_runs
  add column if not exists retrieval_sufficient boolean,
  add column if not exists retrieval_coverage jsonb,
  add column if not exists retrieval_coverage_gaps text[] not null default '{}',
  add column if not exists retrieval_budget_limited boolean not null default false;

alter table public.report_versions
  add column if not exists market_sizing jsonb;

create or replace function public.validate_grounded_market_sizing()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  metric text;
  entry jsonb;
  matched boolean;
  any_figure boolean := false;
begin
  if new.market_sizing is null then
    raise exception 'report_versions.market_sizing must explicitly contain citations or a no-data reason';
  end if;
  foreach metric in array array['TAM','SAM','SOM','MarketSize'] loop
    entry := new.market_sizing -> metric;
    if entry is not null and entry <> 'null'::jsonb then
      any_figure := true;
      if coalesce(entry->>'figure','') !~ '[0-9]' then
        raise exception '% figure must be numeric text', metric;
      end if;
      select exists (
        select 1
        from public.evidence_items e
        join public.sources s on s.id = e.source_id
        join public.reports r on r.run_id = e.run_id
        where r.id = new.report_id
          and e.id = (entry->>'evidenceItemId')::uuid
          and s.id = (entry->>'sourceId')::uuid
          and s.url = entry->>'citationUrl'
          and not e.excluded
      ) into matched;
      if not matched then raise exception '% figure is not grounded in this report run', metric; end if;
    end if;
  end loop;
  if not any_figure and nullif(new.market_sizing->>'reason','') is null then
    raise exception 'missing market-size figures require an explicit reason';
  end if;
  return new;
exception when invalid_text_representation then
  raise exception 'market sizing citations must use valid evidence/source UUIDs';
end;
$$;

create trigger report_versions_grounded_market_sizing
before insert on public.report_versions for each row
execute function public.validate_grounded_market_sizing();

alter table public.research_queries enable row level security;
alter table public.research_passes enable row level security;

create policy "Users can view run research queries" on public.research_queries for select using (
  exists (
    select 1 from public.research_runs rr
    join public.projects p on p.id = rr.project_id
    join public.team_members tm on tm.team_id = p.team_id
    where rr.id = research_queries.run_id and tm.user_id = auth.uid()
  )
);
create policy "Users can view run research passes" on public.research_passes for select using (
  exists (
    select 1 from public.research_runs rr
    join public.projects p on p.id = rr.project_id
    join public.team_members tm on tm.team_id = p.team_id
    where rr.id = research_passes.run_id and tm.user_id = auth.uid()
  )
);

create index idx_research_queries_run_pass on public.research_queries(run_id, pass_number);
create index idx_research_passes_run on public.research_passes(run_id);
create index idx_evidence_items_methodology on public.evidence_items(run_id, evidence_family, research_pass, source_tier);
create index idx_evidence_items_cluster on public.evidence_items(run_id, cluster_key);
