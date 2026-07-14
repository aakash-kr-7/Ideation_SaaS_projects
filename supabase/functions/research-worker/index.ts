import { createClient } from "@supabase/supabase-js"

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

    // The webhook payload structure from Supabase Database Webhooks
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
    console.log(`Setting run ${record.id} to Searching...`)
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

    // Simulate some work...
    await new Promise(resolve => setTimeout(resolve, 2000))

    // 2. Update status to 'Completed' (Stub implementation)
    // We simulate a 2-second delay to show progress in UI
    await new Promise(resolve => setTimeout(resolve, 2000))
    console.log(`Setting run ${record.id} to Completed...`)
    const { error: update2Error } = await supabaseClient
      .from('research_runs')
      .update({ status: 'Completed', progress: 100 })
      .eq('id', record.id)

    if (update2Error) throw update2Error

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
