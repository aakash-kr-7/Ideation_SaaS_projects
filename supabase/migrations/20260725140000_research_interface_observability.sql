-- Authenticated, sanitized observability for the production research room.
-- Internal prompts, provider payloads, raw errors, claims, and credentials never cross this boundary.

create or replace function public.get_research_progress_snapshot(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.research_runs;
  v_snapshot jsonb;
begin
  select rr.* into v_run
  from public.research_runs rr
  join public.projects p on p.id = rr.project_id
  join public.team_members tm on tm.team_id = p.team_id
  where rr.id = p_run_id and tm.user_id = auth.uid();

  if v_run.id is null then
    raise exception 'RESEARCH_RUN_NOT_FOUND' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', v_run.id,
    'mode', v_run.mode,
    'status', v_run.status,
    'currentStage', coalesce(v_run.current_stage, v_run.status),
    'progressDetail', coalesce(v_run.progress_detail, v_run.status),
    'createdAt', v_run.created_at,
    'updatedAt', v_run.updated_at,
    'stageStartedAt', v_run.current_stage_started_at,
    'lastProgressAt', v_run.last_progress_at,
    'terminalAt', v_run.terminal_at,
    'creditState', v_run.credit_state,
    'creditRestored', v_run.credit_state = 'restored',
    'publicFailureReason', case
      when v_run.status = 'Failed' and v_run.time_budget_exhausted then 'The research time budget was reached before a reliable report could be completed.'
      when v_run.status = 'Failed' and v_run.cost_budget_exhausted then 'The provider budget was reached before a reliable report could be completed.'
      when v_run.status = 'Failed' then 'Research stopped before completion. Retry the same brief; contact support if the issue repeats.'
      when v_run.status = 'Cancelled' then 'This research run was cancelled before completion.'
      else null
    end,
    'stages', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.stage_name,
        'status', s.status,
        'detail', s.progress_detail,
        'startedAt', s.started_at,
        'completedAt', s.completed_at
      ) order by s.created_at)
      from public.research_stages s
      where s.run_id = p_run_id
    ), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', j.id,
        'stage', j.stage,
        'status', j.status,
        'attempt', j.attempt_count,
        'maxAttempts', j.max_attempts,
        'batchIndex', j.batch_index,
        'batchSize', j.batch_size,
        'purpose', j.job_purpose,
        'createdAt', j.created_at,
        'completedAt', j.completed_at
      ) order by j.created_at)
      from public.research_jobs j
      where j.run_id = p_run_id
    ), '[]'::jsonb),
    'metrics', coalesce((
      select jsonb_build_object(
        'candidatesDiscovered', m.candidates_discovered,
        'pagesAttempted', m.pages_attempted,
        'pagesFetched', m.pages_fetched,
        'sourcesAccepted', m.sources_accepted,
        'sourcesRejectedByReason', m.sources_rejected_by_reason,
        'independentDomains', m.independent_domains,
        'evidenceItemsExtracted', m.evidence_items_extracted,
        'retries', m.retry_count,
        'providerFallbacks', m.provider_fallback_count,
        'groundedCallsAttempted', m.grounded_calls_attempted,
        'groundedCallsCompleted', m.grounded_calls_completed,
        'groundedCallsQuotaBlocked', m.grounded_calls_quota_blocked,
        'externalSearchCalls', m.external_search_calls,
        'synthesisCalls', m.synthesis_calls,
        'degradedProviders', m.degraded_providers,
        'groundingMode', m.grounding_mode,
        'groundingDegraded', m.grounding_degraded,
        'durationMs', m.total_duration_ms
      )
      from public.research_pipeline_metrics m
      where m.run_id = p_run_id
    ), '{}'::jsonb),
    'retrieval', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'queryFamily', a.query_family,
        'provider', a.provider,
        'url', coalesce(a.canonical_url, a.candidate_url),
        'domain', a.source_domain,
        'disposition', a.disposition,
        'rejectionReason', a.rejection_reason,
        'relevance', a.relevance_score,
        'createdAt', a.created_at
      ) order by a.created_at desc)
      from public.source_retrieval_audit a
      where a.run_id = p_run_id
      limit 80
    ), '[]'::jsonb),
    'sources', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'title', s.title,
        'url', s.url,
        'sourceType', s.source_type,
        'createdAt', s.created_at
      ) order by s.created_at desc)
      from public.sources s
      where s.run_id = p_run_id
    ), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id,
        'sourceId', e.source_id,
        'title', e.title,
        'snippet', e.snippet,
        'signal', e.signal_type,
        'strength', e.strength,
        'family', e.evidence_family,
        'sourceTier', e.source_tier,
        'sourceDomain', e.source_domain,
        'excluded', e.excluded,
        'disconfirming', e.disconfirming,
        'createdAt', e.created_at
      ) order by e.created_at desc)
      from public.evidence_items e
      where e.run_id = p_run_id
    ), '[]'::jsonb),
    'clusters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'type', c.cluster_type,
        'claim', c.representative_claim,
        'supportingCount', cardinality(c.supporting_evidence_ids),
        'contradictingCount', cardinality(c.contradicting_evidence_ids),
        'independentDomains', c.independent_domain_count,
        'confidence', c.confidence,
        'unresolved', c.unresolved_disagreement
      ) order by c.created_at)
      from public.evidence_clusters c
      where c.run_id = p_run_id
    ), '[]'::jsonb),
    'confidence', coalesce((
      select jsonb_build_object('band', c.band, 'score', c.score, 'reasons', c.reasons)
      from public.evidence_confidence_results c
      where c.run_id = p_run_id
    ), '{}'::jsonb),
    'reportState', jsonb_build_object(
      'ready', exists(select 1 from public.reports r where r.run_id = p_run_id),
      'chartsPrepared', (
        select count(*) from public.report_chart_datasets d where d.run_id = p_run_id
      ),
      'exportsPrepared', (
        select count(*)
        from public.report_exports x
        join public.report_versions rv on rv.id = x.report_version_id
        join public.reports r on r.id = rv.report_id
        where r.run_id = p_run_id
      )
    )
  ) into v_snapshot;

  return v_snapshot;
end;
$$;

revoke all on function public.get_research_progress_snapshot(uuid) from public, anon;
grant execute on function public.get_research_progress_snapshot(uuid) to authenticated;

create or replace function public.get_research_history_snapshot()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rr.id,
    'mode', rr.mode,
    'status', rr.status,
    'currentStage', coalesce(rr.current_stage, rr.status),
    'createdAt', rr.created_at,
    'completedAt', rr.terminal_at,
    'durationMs', coalesce(m.total_duration_ms,
      case when rr.terminal_at is not null then (extract(epoch from (rr.terminal_at - rr.created_at)) * 1000)::bigint else null end),
    'sourceCount', coalesce(m.sources_accepted, (select count(*) from public.sources s where s.run_id = rr.id)),
    'independentDomains', coalesce(m.independent_domains, 0),
    'groundingDegraded', coalesce(m.grounding_degraded, false),
    'degradedProviders', coalesce(m.degraded_providers, '[]'::jsonb),
    'retries', coalesce(m.retry_count, 0),
    'creditRestored', rr.credit_state = 'restored',
    'publicReason', case
      when rr.status = 'Failed' and rr.time_budget_exhausted then 'Research time budget reached'
      when rr.status = 'Failed' and rr.cost_budget_exhausted then 'Provider budget reached'
      when rr.status = 'Failed' then 'Research stopped before completion'
      when rr.status = 'Cancelled' then 'Cancelled before completion'
      else null
    end
  ) order by rr.created_at desc), '[]'::jsonb)
  from public.research_runs rr
  join public.projects p on p.id = rr.project_id
  join public.team_members tm on tm.team_id = p.team_id and tm.user_id = auth.uid()
  left join public.research_pipeline_metrics m on m.run_id = rr.id;
$$;

revoke all on function public.get_research_history_snapshot() from public, anon;
grant execute on function public.get_research_history_snapshot() to authenticated;

notify pgrst, 'reload schema';
