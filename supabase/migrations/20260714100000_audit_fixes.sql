-- Add missing updated_at columns
DO $$
DECLARE
    t text;
    tables text[] := ARRAY[
        'team_members', 'saved_comparisons', 'sources', 'evidence_items',
        'competitors', 'risks', 'pricing_models', 'mvp_plans', 'mvp_scope_items',
        'launch_plans', 'launch_strategies', 'opportunity_scores', 'score_breakdowns',
        'score_evidence_refs', 'report_versions', 'analytics_events', 'error_logs',
        'notifications', 'cached_research', 'search_cache', 'billing_customers', 'audit_logs'
    ];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone DEFAULT timezone(''utc''::text, now()) NOT NULL;', t);
        EXECUTE format('DROP TRIGGER IF EXISTS update_%I_modtime ON public.%I;', t, t);
        EXECUTE format('CREATE TRIGGER update_%I_modtime BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_modified_column();', t, t);
    END LOOP;
END;
$$;

-- Add missing created_at to reports
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL;
