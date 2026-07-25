-- Required deterministic scoring data for fresh local environments.
insert into public.scoring_weights (criterion, weight, description) values
  ('painSeverity',12,'Strength and consistency of verified pain evidence'),
  ('purchaseUrgency',10,'Urgent language and demand evidence'),
  ('willingnessToPay',11,'Pricing evidence and existing paid alternatives'),
  ('buyerReachability',8,'Independent demand sources and addressable communities'),
  ('mvpSpeed',8,'Execution-risk burden and scope signals'),
  ('competitionGap',8,'Competitive density and explicit gaps'),
  ('retentionPotential',9,'Recurring-workflow evidence'),
  ('platformDependencyRisk',7,'Platform-category risk burden; inverted in total'),
  ('regulatoryRisk',5,'Regulatory-category risk burden; inverted in total'),
  ('founderFit',7,'Evidence access and domain-specific signal coverage'),
  ('distributionClarity',8,'Demand-source and launch-channel clarity'),
  ('speedToFirstRevenue',7,'Pricing plus purchase-urgency evidence')
on conflict (criterion) do update set weight=excluded.weight, description=excluded.description;

-- Deterministic Source Registry used by the Gemini grounded-research stage.
insert into public.source_registry
  (domain, evidence_families, industries, geographies, quality_tier, source_class, extraction_strategy, cache_ttl_seconds, enabled)
values
  ('bls.gov', array['demand','pricing','market'], array['all'], array['US'], 1, 'primary', 'direct_html', 86400, true),
  ('census.gov', array['market','demand'], array['all'], array['US'], 1, 'primary', 'direct_html', 86400, true),
  ('sec.gov', array['competition','pricing','risk'], array['all'], array['US'], 1, 'primary', 'direct_html', 86400, true),
  ('data.gov', array['market','demand','risk'], array['all'], array['US'], 1, 'primary', 'direct_html', 86400, true),
  ('europa.eu', array['market','regulatory','risk'], array['all'], array['EU'], 1, 'primary', 'direct_html', 86400, true),
  ('github.com', array['demand','competition','execution'], array['software'], array['global'], 2, 'community', 'api', 21600, true),
  ('news.ycombinator.com', array['problem','demand','competition'], array['software','startups'], array['global'], 3, 'community', 'direct_html', 14400, true),
  ('g2.com', array['competition','pricing','problem'], array['software'], array['global'], 3, 'secondary', 'direct_html', 43200, true)
on conflict (domain) do update set
  evidence_families = excluded.evidence_families,
  industries = excluded.industries,
  geographies = excluded.geographies,
  quality_tier = excluded.quality_tier,
  source_class = excluded.source_class,
  extraction_strategy = excluded.extraction_strategy,
  cache_ttl_seconds = excluded.cache_ttl_seconds,
  enabled = excluded.enabled,
  updated_at = now();
