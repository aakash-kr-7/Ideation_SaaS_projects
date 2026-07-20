-- Migration to create gemini cache for hybrid research

CREATE TABLE IF NOT EXISTS public.gemini_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.research_runs(id) ON DELETE CASCADE,
    prompt_hash TEXT NOT NULL,
    model TEXT NOT NULL,
    response_text TEXT,
    grounding_sources JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE (run_id, prompt_hash, model)
);

-- Enable RLS
ALTER TABLE public.gemini_cache ENABLE ROW LEVEL SECURITY;

-- Service role has full access
CREATE POLICY "Service role manages gemini cache" ON public.gemini_cache
    FOR ALL TO service_role USING (true);
