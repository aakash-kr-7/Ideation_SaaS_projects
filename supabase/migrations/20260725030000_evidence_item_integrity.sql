-- Make every accepted evidence row independently auditable while preserving the
-- canonical source/evidence foreign-key model.

alter table public.sources
  add column if not exists publisher text,
  add column if not exists retrieval_date date,
  add column if not exists source_class text,
  add column if not exists extraction_method text;

alter table public.evidence_items
  add column if not exists canonical_url text,
  add column if not exists source_title text,
  add column if not exists publisher text,
  add column if not exists retrieval_date date,
  add column if not exists relevant_excerpt text,
  add column if not exists structured_value jsonb,
  add column if not exists support_classification text,
  add column if not exists source_class text,
  add column if not exists segment text,
  add column if not exists geography text,
  add column if not exists extraction_method text,
  add column if not exists associated_claim_ids text[] not null default '{}',
  add column if not exists numeric_value numeric,
  add column if not exists currency text;

update public.sources
set publisher = coalesce(publisher, source_domain, title),
    retrieval_date = coalesce(retrieval_date, created_at::date),
    source_class = coalesce(source_class, case when source_tier <= 2 then 'primary' else 'secondary' end),
    extraction_method = coalesce(extraction_method, 'direct_http')
where publisher is null
   or retrieval_date is null
   or source_class is null
   or extraction_method is null;

update public.evidence_items e
set canonical_url = coalesce(e.canonical_url, s.canonical_url, s.url),
    source_title = coalesce(e.source_title, s.title, e.title),
    publisher = coalesce(e.publisher, s.publisher, s.source_domain, e.source_domain),
    retrieval_date = coalesce(e.retrieval_date, s.retrieval_date, e.created_at::date),
    relevant_excerpt = coalesce(e.relevant_excerpt, e.snippet),
    support_classification = coalesce(e.support_classification, case when e.disconfirming then 'contradiction' else 'support' end),
    source_class = coalesce(e.source_class, s.source_class, case when e.source_tier <= 2 then 'primary' else 'secondary' end),
    extraction_method = coalesce(e.extraction_method, s.extraction_method, 'direct_http'),
    associated_claim_ids = case
      when cardinality(e.associated_claim_ids) > 0 then e.associated_claim_ids
      when e.claim_fingerprint is not null then array['claim:' || e.claim_fingerprint]
      else array['evidence:' || e.id::text]
    end
from public.sources s
where s.id = e.source_id;

alter table public.sources
  alter column publisher set not null,
  alter column retrieval_date set not null,
  alter column source_class set not null,
  alter column extraction_method set not null;

alter table public.evidence_items
  alter column canonical_url set not null,
  alter column source_title set not null,
  alter column publisher set not null,
  alter column retrieval_date set not null,
  alter column relevant_excerpt set not null,
  alter column support_classification set not null,
  alter column source_class set not null,
  alter column extraction_method set not null;

alter table public.evidence_items
  add constraint evidence_items_canonical_url_http
    check (canonical_url ~ '^https?://'),
  add constraint evidence_items_support_classification
    check (support_classification in ('support', 'contradiction')),
  add constraint evidence_items_support_matches_disconfirming
    check (
      (support_classification = 'contradiction' and disconfirming)
      or (support_classification = 'support' and not disconfirming)
    ),
  add constraint evidence_items_source_class
    check (source_class in ('primary', 'secondary', 'community', 'official', 'commercial')),
  add constraint evidence_items_currency
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  add constraint evidence_items_numeric_value
    check (numeric_value is null or numeric_value >= 0),
  add constraint evidence_items_claim_ids_present
    check (cardinality(associated_claim_ids) > 0);

create or replace function public.validate_evidence_source_run_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  source_run uuid;
  source_url text;
begin
  select run_id, coalesce(canonical_url, url)
    into source_run, source_url
  from public.sources
  where id = new.source_id;

  if source_run is null or source_run <> new.run_id then
    raise exception 'evidence source must belong to the same research run';
  end if;
  if source_url is distinct from new.canonical_url then
    raise exception 'evidence canonical URL must match its source';
  end if;
  return new;
end;
$$;

drop trigger if exists evidence_items_source_run_ownership on public.evidence_items;
create trigger evidence_items_source_run_ownership
before insert or update of run_id, source_id, canonical_url
on public.evidence_items
for each row execute function public.validate_evidence_source_run_ownership();

notify pgrst, 'reload schema';
