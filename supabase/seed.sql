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
