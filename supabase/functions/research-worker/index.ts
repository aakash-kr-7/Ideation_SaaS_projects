import { createClient } from "@supabase/supabase-js"
import { runResearchPipeline } from "./lib/research/pipeline.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Webhook Security: Verify Webhook Secret
    const authHeader = req.headers.get('Authorization')
    const webhookSecret = Deno.env.get('WEBHOOK_SECRET')
    if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const payload = await req.json()
    console.log("Received webhook payload:", payload)

    const record = payload.record
    if (!record || !record.id) {
      throw new Error("Invalid payload: no record ID")
    }

    // Initialize Supabase client with Service Role key to bypass RLS for background jobs
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 2. Idempotency: Update status to 'Searching' ONLY if currently 'Queued'
    console.log(`Checking status and initializing run ${record.id}...`)
    const { data: update1Data, error: update1Error } = await supabaseClient
      .from('research_runs')
      .update({ status: 'Searching', progress: 10 })
      .eq('id', record.id)
      .eq('status', 'Queued')
      .select()

    if (update1Error) throw update1Error
    
    // If no rows were returned, it means the run is not Queued. Skip processing.
    if (!update1Data || update1Data.length === 0) {
      console.log(`Run ${record.id} is not in Queued state. Skipping.`)
      return new Response(
        JSON.stringify({ message: 'Skipped: Not in Queued state', run_id: record.id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    // Map record data to ResearchRequest
    const requestPayload = {
      ideaName: record.idea_name,
      ideaDescription: record.idea_description,
      targetCustomer: record.target_customer,
      marketType: record.market_type || 'B2B',
      targetRegion: record.target_region || 'Global',
      depth: (record.mode === 'Fast Scan' ? 'fast' : 'deep') as 'fast' | 'deep'
    }

    // Launch pipeline execution asynchronously
    console.log(`Executing real evidence pipeline for run ${record.id}...`)
    // Run the pipeline and let it handle database updates
    await runResearchPipeline(record.id, requestPayload, supabaseClient)

    return new Response(
      JSON.stringify({ message: 'Processed successfully', run_id: record.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error: any) {
    console.error("Worker error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
