-- Full Validation evidence routing and adversarial adjudication.
-- Quick Scan tables, pack definitions, factor weights, and scoring code are untouched.

alter table public.source_registry
  add column if not exists cannot_establish_claims text[] not null default '{}',
  add column if not exists markets text[] not null default '{}',
  add column if not exists authority numeric(4,3) not null default 0.500
    check (authority between 0 and 1),
  add column if not exists promotional_bias text not null default 'medium'
    check (promotional_bias in ('low', 'medium', 'high')),
  add column if not exists expected_freshness_days integer
    check (expected_freshness_days is null or expected_freshness_days > 0),
  add column if not exists retrieval_adapter text,
  add column if not exists query_templates jsonb not null default '{}'::jsonb,
  add column if not exists extraction_attempts integer not null default 0
    check (extraction_attempts >= 0),
  add column if not exists extraction_successes integer not null default 0
    check (extraction_successes >= 0 and extraction_successes <= extraction_attempts),
  add column if not exists last_successful_retrieval timestamptz,
  add column if not exists storage_restrictions text,
  add column if not exists access_restrictions text,
  add column if not exists routing_pack_keys text[] not null default '{}';

create table if not exists public.source_routing_packs (
  pack_key text primary key,
  label text not null,
  suitable_markets text[] not null default '{}',
  suitable_industries text[] not null default '{}',
  suitable_geographies text[] not null default '{}',
  evidence_families text[] not null default '{}',
  query_templates jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.source_routing_packs (
  pack_key, label, suitable_markets, suitable_industries,
  suitable_geographies, evidence_families, query_templates
) values
  ('developer_tools', 'Developer tools',
    array['developer tools','B2B SaaS'], array['software','technology'], array['global'],
    array['pain','alternatives','pricing','delivery_feasibility','buyer_voice'],
    '{"official":"site:{domain} documentation pricing limits","buyer_voice":"{buyer} {workflow} complaint workaround"}'),
  ('b2b_saas', 'B2B SaaS',
    array['B2B SaaS'], array['business software'], array['global'],
    array['pain','urgency','budget','current_spending','procurement','reachability'],
    '{"commercial":"{buyer} procurement budget owner paid pilot contract","official":"site:{domain} pricing plans"}'),
  ('consumer_products', 'Consumer products',
    array['consumer'], array['consumer products'], array['global'],
    array['pain','frequency','alternatives','switching','behavioral_demand'],
    '{"buyer_voice":"{buyer} review complaint workaround frequency","market":"{category} consumer adoption"}'),
  ('local_services', 'Local services',
    array['local services'], array['services'], array['local'],
    array['pain','current_spending','reachability','geographic_constraints'],
    '{"directory":"{geography} {category} directory reviews pricing","official":"{geography} licensing {category}"}'),
  ('marketplaces', 'Marketplaces',
    array['marketplace','two-sided marketplace'], array['marketplaces'], array['global'],
    array['pain','alternatives','liquidity','reachability','switching'],
    '{"liquidity":"{category} marketplace supply demand cold start fill rate","failure":"{category} marketplace failed abandoned disintermediation"}'),
  ('regulated_products', 'Regulated products',
    array['regulated'], array['health','finance','insurance','legal','privacy'], array['global'],
    array['regulation','delivery_feasibility','kill_conditions'],
    '{"regulator":"site:{domain} {category} licensing enforcement guidance","law":"{geography} {category} law compliance"}'),
  ('india', 'India',
    array['all'], array['all'], array['India'],
    array['geographic_constraints','pricing','regulation','reachability'],
    '{"local":"India {buyer} {workflow} INR","official":"site:gov.in {category} regulation data"}'),
  ('united_states', 'United States',
    array['all'], array['all'], array['United States'],
    array['geographic_constraints','pricing','regulation','reachability'],
    '{"local":"United States {buyer} {workflow} USD","official":"site:.gov {category} regulation data"}'),
  ('european_union', 'European Union',
    array['all'], array['all'], array['European Union'],
    array['geographic_constraints','pricing','regulation','reachability'],
    '{"local":"European Union {buyer} {workflow} EUR","official":"site:europa.eu {category} regulation data"}')
on conflict (pack_key) do update set
  label = excluded.label,
  suitable_markets = excluded.suitable_markets,
  suitable_industries = excluded.suitable_industries,
  suitable_geographies = excluded.suitable_geographies,
  evidence_families = excluded.evidence_families,
  query_templates = excluded.query_templates,
  updated_at = now();

-- Curated routing contracts for the deterministic registry seed. These are
-- intentionally conservative: source authority is claim-family specific, and
-- a preferred source is never allowed to establish a registered exclusion.
create or replace function public.apply_source_registry_curation()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
update public.source_registry set
  cannot_establish_claims = array['buyer_urgency','willingness_to_pay','alternative_inadequacy','founder_advantage'],
  markets = array['B2B SaaS','consumer products','local services'],
  authority = 0.980, promotional_bias = 'low',
  expected_freshness_days = 35, retrieval_adapter = 'direct_http',
  query_templates = '{"market":"site:{domain} {category} employment wages industry","spending_context":"site:{domain} {industry} producer price index"}',
  storage_restrictions = 'Public excerpts and metadata may be stored with attribution.',
  access_restrictions = 'Public web access; observe published rate limits.',
  routing_pack_keys = array['b2b_saas','consumer_products','local_services','united_states']
where domain = 'bls.gov';

update public.source_registry set
  cannot_establish_claims = array['pain_frequency','buyer_urgency','budget_ownership','current_spending','alternative_inadequacy','founder_advantage'],
  markets = array['B2B SaaS','consumer products','local services','marketplaces'],
  authority = 0.970, promotional_bias = 'low',
  expected_freshness_days = 90, retrieval_adapter = 'direct_http',
  query_templates = '{"market":"site:{domain} {geography} {industry} business population","segment":"site:{domain} {buyer} industry statistics"}',
  storage_restrictions = 'Public excerpts and metadata may be stored with attribution.',
  access_restrictions = 'Public web and API access; observe Census terms and rate limits.',
  routing_pack_keys = array['b2b_saas','consumer_products','local_services','marketplaces','united_states']
where domain = 'census.gov';

update public.source_registry set
  cannot_establish_claims = array['pain_existence','pain_frequency','buyer_urgency','founder_advantage'],
  markets = array['B2B SaaS','marketplaces','regulated products'],
  authority = 0.960, promotional_bias = 'medium',
  expected_freshness_days = 30, retrieval_adapter = 'direct_http',
  query_templates = '{"filings":"site:{domain} {category} annual report competition risk spending","pricing_context":"site:{domain} {industry} revenue contract pricing"}',
  storage_restrictions = 'Public filing excerpts and metadata may be stored with filing attribution.',
  access_restrictions = 'Public EDGAR access; identify the client and observe SEC fair-access limits.',
  routing_pack_keys = array['b2b_saas','marketplaces','regulated_products','united_states']
where domain = 'sec.gov';

update public.source_registry set
  cannot_establish_claims = array['pain_frequency','buyer_urgency','budget_ownership','current_spending','alternative_inadequacy','founder_advantage'],
  markets = array['B2B SaaS','consumer products','local services','marketplaces','regulated products'],
  authority = 0.850, promotional_bias = 'low',
  expected_freshness_days = 90, retrieval_adapter = 'direct_http',
  query_templates = '{"dataset":"site:{domain} {category} {geography} dataset","regulation":"site:{domain} {category} agency regulation"}',
  storage_restrictions = 'Store excerpts and metadata subject to the linked dataset licence.',
  access_restrictions = 'Portal metadata is public; linked datasets may impose separate terms.',
  routing_pack_keys = array['b2b_saas','consumer_products','local_services','marketplaces','regulated_products','united_states']
where domain = 'data.gov';

update public.source_registry set
  cannot_establish_claims = array['pain_existence','pain_frequency','buyer_urgency','budget_ownership','current_spending','founder_advantage'],
  markets = array['B2B SaaS','consumer products','marketplaces','regulated products'],
  authority = 0.980, promotional_bias = 'low',
  expected_freshness_days = 30, retrieval_adapter = 'direct_http',
  query_templates = '{"regulation":"site:{domain} {category} regulation guidance enforcement","market":"site:{domain} {industry} European Union statistics"}',
  storage_restrictions = 'Public excerpts and metadata may be stored with institutional attribution.',
  access_restrictions = 'Public EU web access; linked datasets and publications may have separate reuse notices.',
  routing_pack_keys = array['b2b_saas','consumer_products','marketplaces','regulated_products','european_union']
where domain = 'europa.eu';

update public.source_registry set
  cannot_establish_claims = array['buyer_urgency','budget_ownership','current_spending','regulatory_compliance','founder_advantage'],
  markets = array['developer tools','B2B SaaS'],
  authority = 0.720, promotional_bias = 'medium',
  expected_freshness_days = 21, retrieval_adapter = 'github',
  query_templates = '{"repository":"site:{domain} {category} stars issues releases","execution":"site:{domain} {category} integration limitations documentation"}',
  storage_restrictions = 'Store short excerpts and metadata; repository content remains subject to its licence.',
  access_restrictions = 'Public API and web access; authentication and rate limits may apply.',
  routing_pack_keys = array['developer_tools','b2b_saas']
where domain = 'github.com';

update public.source_registry set
  cannot_establish_claims = array['official_pricing','budget_ownership','current_spending','regulatory_compliance','market_size','founder_advantage'],
  markets = array['developer tools','B2B SaaS','consumer products','marketplaces'],
  authority = 0.480, promotional_bias = 'medium',
  expected_freshness_days = 14, retrieval_adapter = 'hacker_news',
  query_templates = '{"buyer_voice":"site:{domain} {buyer} {workflow} complaint workaround","failure":"site:{domain} {category} failed abandoned switching"}',
  storage_restrictions = 'Store short public excerpts and discussion metadata with URL attribution.',
  access_restrictions = 'Public web/API access; community claims require independent corroboration.',
  routing_pack_keys = array['developer_tools','b2b_saas','consumer_products','marketplaces']
where domain = 'news.ycombinator.com';

update public.source_registry set
  cannot_establish_claims = array['unbiased_pain_frequency','buyer_urgency','budget_ownership','current_spending','regulatory_compliance','founder_advantage'],
  markets = array['developer tools','B2B SaaS'],
  authority = 0.560, promotional_bias = 'high',
  expected_freshness_days = 30, retrieval_adapter = 'direct_http',
  query_templates = '{"competitors":"site:{domain} {category} alternatives reviews","pricing":"site:{domain} {category} pricing plans"}',
  storage_restrictions = 'Store only short attributable excerpts and metadata; do not reproduce review pages.',
  access_restrictions = 'Public-page access is subject to site terms and robots restrictions.',
  routing_pack_keys = array['developer_tools','b2b_saas']
where domain = 'g2.com';
end;
$$;

select public.apply_source_registry_curation();

alter table public.full_validation_research_pack_statuses
  add column if not exists sources_discovered integer not null default 0,
  add column if not exists sources_reviewed integer not null default 0,
  add column if not exists sources_fetched integer not null default 0,
  add column if not exists findings_accepted integer not null default 0,
  add column if not exists findings_rejected integer not null default 0,
  add column if not exists independent_evidence_groups integer not null default 0,
  add column if not exists direct_official_sources integer not null default 0,
  add column if not exists challenging_findings integer not null default 0;

alter table public.evidence_items
  add column if not exists atomic_claim text,
  add column if not exists published_or_updated_at date,
  add column if not exists limitations text[] not null default '{}',
  add column if not exists proposition_links text[] not null default '{}',
  add column if not exists hostile_text_detected boolean not null default false;

alter table public.research_propositions
  add column if not exists burden_status text not null default 'insufficient_evidence'
    check (burden_status in ('met','contested','unmet','insufficient_evidence')),
  add column if not exists missing_evidence text[] not null default '{}',
  add column if not exists kill_condition text,
  add column if not exists supporting_evidence_ids uuid[] not null default '{}',
  add column if not exists challenging_evidence_ids uuid[] not null default '{}';

create table if not exists public.full_validation_investigation_passes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.research_runs(id) on delete cascade,
  pass_key text not null check (pass_key in ('prosecution','defense','adjudication')),
  status text not null default 'completed'
    check (status in ('completed','provider_unavailable','disagreement','insufficient_evidence')),
  provider text not null default 'code',
  official_score_owner text not null default 'code'
    check (official_score_owner = 'code'),
  output jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, pass_key)
);

create index if not exists source_registry_routing_pack_keys_idx
  on public.source_registry using gin(routing_pack_keys);
create index if not exists investigation_passes_run_idx
  on public.full_validation_investigation_passes(run_id);

create or replace function public.record_source_registry_extraction(
  p_domain text,
  p_succeeded boolean
)
returns void
language sql
security definer
set search_path = public
as $$
  update public.source_registry
  set extraction_attempts = extraction_attempts + 1,
      extraction_successes = extraction_successes +
        case when p_succeeded then 1 else 0 end,
      historical_success_rate =
        (extraction_successes + case when p_succeeded then 1 else 0 end)::numeric /
        nullif(extraction_attempts + 1, 0),
      last_successful_retrieval = case
        when p_succeeded then now() else last_successful_retrieval end,
      updated_at = now()
  where lower(domain) = lower(p_domain);
$$;

alter table public.source_routing_packs enable row level security;
alter table public.full_validation_investigation_passes enable row level security;
revoke all on table public.source_routing_packs,
  public.full_validation_investigation_passes from anon, authenticated;
grant all on table public.source_routing_packs,
  public.full_validation_investigation_passes to service_role;
revoke all on function public.record_source_registry_extraction(text,boolean)
  from public, anon, authenticated;
grant execute on function public.record_source_registry_extraction(text,boolean)
  to service_role;
revoke all on function public.apply_source_registry_curation()
  from public, anon, authenticated;
grant execute on function public.apply_source_registry_curation()
  to service_role;

notify pgrst, 'reload schema';
