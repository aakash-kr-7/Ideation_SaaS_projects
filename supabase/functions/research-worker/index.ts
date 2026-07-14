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

    // 1. Update status to 'Searching'
    console.log(`Setting run ${record.id} to Searching...`)
    const { error } = await supabaseClient
      .from('research_runs')
      .update({ status: 'Searching', progress: 10 })
      .eq('id', record.id)

    if (error) throw error

    // Simulate some work...
    await new Promise(resolve => setTimeout(resolve, 2000))

    // 2. Update status to 'Completed' (Stub implementation)
    console.log(`Setting run ${record.id} to Completed...`)
    const { error: finalError } = await supabaseClient
      .from('research_runs')
      .update({ status: 'Completed', progress: 100 })
      .eq('id', record.id)

    if (finalError) throw finalError

    return new Response(
      JSON.stringify({ message: 'Processed successfully', run_id: record.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error("Worker error:", error)
    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
