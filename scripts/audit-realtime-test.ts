import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRealtime() {
  console.log('--- REALTIME SEQUENCE TEST ---');

  const { data: team } = await supabase.from('teams').select('id').limit(1).single();
  if (!team) throw new Error('No team found to attach project to');

  // 1. Create a project first to attach the run to
  const { data: project, error: pErr } = await supabase.from('projects').insert([{
    name: 'Realtime Audit Project',
    team_id: team.id
  }]).select().single();

  if (pErr) throw pErr;

  let runId: string | null = null;
  let receivedStatuses: string[] = [];
  
  // 2. Setup subscription
  const channel = supabase.channel('schema-db-changes')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'research_runs' },
      (payload) => {
        if (runId && payload.new.id === runId) {
          console.log(`[Realtime] Received status: ${payload.new.status}`);
          receivedStatuses.push(payload.new.status);
        }
      }
    )
    .subscribe();

  // Give subscription a moment to connect
  await new Promise(r => setTimeout(r, 2000));

  // 3. Create a run
  const { data: run, error: rErr } = await supabase.from('research_runs').insert([{
    project_id: project.id,
    idea_name: 'Test Idea',
    idea_description: 'Test Idea Description',
    target_customer: 'Test Customer',
    market_type: 'B2B',
    target_region: 'US',
    status: 'Queued',
    mode: 'Fast Scan'
  }]).select().single();

  if (rErr) throw rErr;
  runId = run.id;
  console.log(`Created Run: ${runId}`);

  // 4. Simulate the worker progressing through all statuses with delays
  const statuses = ['Searching', 'Extracting', 'Normalizing', 'Scoring', 'Generating', 'Completed'];
  
  for (const status of statuses) {
    console.log(`[Worker] Updating to ${status}...`);
    await supabase.from('research_runs').update({ status }).eq('id', runId);
    // realistic delay between transitions
    await new Promise(r => setTimeout(r, 1000));
  }

  // Allow final events to arrive
  await new Promise(r => setTimeout(r, 2000));

  console.log('\\nExpected:', statuses);
  console.log('Received:', receivedStatuses);

  if (JSON.stringify(statuses) === JSON.stringify(receivedStatuses)) {
    console.log('[PASS] Realtime sequence fully ordered with no drops.');
  } else {
    console.log('[FAIL] Realtime sequence mismatch.');
  }

  process.exit(0);
}

testRealtime().catch(console.error);
