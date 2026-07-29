revoke all on table public.research_call_metrics from anon, authenticated;
revoke all on table public.validated_pricing_observations from anon, authenticated;

grant all on table public.research_call_metrics to service_role;
grant all on table public.validated_pricing_observations to service_role;

notify pgrst, 'reload schema';
