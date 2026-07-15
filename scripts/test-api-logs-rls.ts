import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = "http://127.0.0.1:54321";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
const supabaseA = createClient(supabaseUrl, supabaseKey);
const supabaseB = createClient(supabaseUrl, supabaseKey);

async function runRlsTest() {
  console.log('--- RLS ADVERSARIAL TEST FOR API USAGE LOGS ---');
  
  const emailA = `userA_test_${Date.now()}@example.com`;
  const emailB = `userB_test_${Date.now()}@example.com`;
  const pass = 'TestPass123!';

  // 1. Create User A and User B
  const { data: userAData } = await supabaseAdmin.auth.admin.createUser({ email: emailA, password: pass, email_confirm: true });
  const { data: userBData } = await supabaseAdmin.auth.admin.createUser({ email: emailB, password: pass, email_confirm: true });

  const userIdA = userAData!.user!.id;
  const userIdB = userBData!.user!.id;

  try {
    // 2. Sign in user A and user B to establish sessions
    await supabaseA.auth.signInWithPassword({ email: emailA, password: pass });
    await supabaseB.auth.signInWithPassword({ email: emailB, password: pass });

    // 3. Get A's seeded team (automatically created by triggers on new user creation)
    const { data: teamA } = await supabaseAdmin.from('team_members').select('team_id').eq('user_id', userIdA).single();
    const teamIdA = teamA!.team_id;

    // Helper check
    const check = (name: string, res: any) => {
      if (res.error) {
        console.error(`${name} failed:`, res.error);
        throw res.error;
      }
      return res.data;
    };

    // 4. Create Project and Run for User A
    const projectA = check('project', await supabaseAdmin.from('projects').insert({
      team_id: teamIdA,
      name: 'User A project',
      created_by: userIdA
    }).select().single());

    const runA = check('run', await supabaseAdmin.from('research_runs').insert({
      project_id: projectA.id,
      idea_name: 'Idea A',
      idea_description: 'Validating invoice tool',
      target_customer: 'Freelancers',
      market_type: 'B2B',
      target_region: 'Global',
      mode: 'Fast Scan',
      status: 'Queued',
      created_by: userIdA
    }).select().single());

    // 5. Insert an API usage log for User A's run (inserted via background service role admin client)
    const logA = check('log', await supabaseAdmin.from('api_usage_logs').insert({
      run_id: runA.id,
      provider: 'groq',
      operation: 'extraction',
      prompt_tokens: 1500,
      completion_tokens: 500,
      cost: 0.003,
      status: 'success'
    }).select().single());

    console.log(`Inserted test log ID: ${logA.id} for Run: ${runA.id} owned by User A.`);

    // 6. Test User B (Adversary) - try to query User A's API usage log
    console.log("Adversary User B attempts to read User A's API usage logs...");
    const { data: dataB, error: errorB } = await supabaseB
      .from('api_usage_logs')
      .select('*')
      .eq('run_id', runA.id);

    if (errorB) {
      console.log('User B select was blocked or errored:', errorB.message);
    }
    
    const readSuccessfulB = dataB && dataB.some((log: any) => log.id === logA.id);
    if (readSuccessfulB) {
      console.error('❌ RLS VIOLATION: User B successfully read User A\'s api_usage_logs!');
      process.exit(1);
    } else {
      console.log('✅ RLS SECURED: User B was blocked from reading User A\'s api_usage_logs (returned 0 rows).');
    }

    // 7. Test User A (Owner) - query their own API usage log
    console.log("Owner User A attempts to read their own API usage logs...");
    const { data: dataA, error: errorA } = await supabaseA
      .from('api_usage_logs')
      .select('*')
      .eq('run_id', runA.id);

    if (errorA) {
      console.error('Owner User A read failed:', errorA.message);
      process.exit(1);
    }

    const readSuccessfulA = dataA && dataA.some((log: any) => log.id === logA.id);
    if (readSuccessfulA) {
      console.log('✅ RLS VERIFIED: Owner User A successfully read their own api_usage_logs.');
    } else {
      console.error('❌ ERROR: Owner User A was unable to read their own api_usage_logs!');
      process.exit(1);
    }

    console.log('🎉 ALL RLS TESTS PASSED SUCCESSFULLY!');

  } finally {
    // 8. Cleanup test data
    console.log('Cleaning up test auth users...');
    await supabaseAdmin.auth.admin.deleteUser(userIdA);
    await supabaseAdmin.auth.admin.deleteUser(userIdB);
    console.log('Cleanup finished.');
  }
}

runRlsTest().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
