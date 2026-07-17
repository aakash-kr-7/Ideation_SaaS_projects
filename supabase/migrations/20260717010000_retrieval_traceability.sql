-- Make methodology metadata directly consumable from Realtime evidence events,
-- and tighten market-size citations to qualified source classes.

alter table public.sources
  add column if not exists market_size_source_qualified boolean not null default false,
  add column if not exists market_size_qualification_reason text;

alter table public.evidence_items
  add column if not exists research_query_id uuid references public.research_queries(id) on delete set null,
  add column if not exists tier_reason text,
  add column if not exists exclusion_reason text,
  add column if not exists market_size_source_qualified boolean not null default false;

alter table public.research_passes
  add column if not exists status text not null default 'Running'
    check (status in ('Running','Complete','BudgetLimited')),
  add column if not exists started_at timestamptz not null default now();

update public.research_passes
set status = case when budget_limited then 'BudgetLimited' else 'Complete' end
where completed_at is not null;

create index if not exists idx_evidence_items_research_query
  on public.evidence_items(research_query_id);

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
      if coalesce(entry->>'figure','') !~* '(\$|€|£)?[0-9][0-9,.]*[[:space:]]*(thousand|million|billion|trillion|k|m|bn|users?|businesses|companies|households|seats|accounts)' then
        raise exception '% figure must contain a concrete market-sized amount or population', metric;
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
          and e.market_size_source_qualified
          and s.market_size_source_qualified
      ) into matched;
      if not matched then
        raise exception '% figure is not grounded in a qualified source for this report run', metric;
      end if;
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
