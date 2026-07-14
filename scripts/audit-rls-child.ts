import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
const supabaseB = createClient(supabaseUrl, supabaseKey);

async function runChildAudit() {
  console.log('--- RLS ADVERSARIAL AUDIT (CHILD TABLES) ---');
  
  const emailA = `testA_child_${Date.now()}@example.com`;
  const emailB = `testB_child_${Date.now()}@example.com`;
  const pass = 'AuditPass123!';

  const { data: userAData } = await supabaseAdmin.auth.admin.createUser({ email: emailA, password: pass, email_confirm: true });
  const { data: userBData } = await supabaseAdmin.auth.admin.createUser({ email: emailB, password: pass, email_confirm: true });

  const userIdA = userAData!.user!.id;
  const userIdB = userBData!.user!.id;

  // Sign in as B
  await supabaseB.auth.signInWithPassword({ email: emailB, password: pass });

  // Get A's team
  const { data: teamA } = await supabaseAdmin.from('team_members').select('team_id').eq('user_id', userIdA).single();
  const teamIdA = teamA!.team_id;

  const check = (name: string, res: any) => { if (res.error) { console.error(`${name} failed:`, res.error); process.exit(1); } return res.data; };
  const projectA = check('project', await supabaseAdmin.from('projects').insert({ team_id: teamIdA, name: 'Project A', created_by: userIdA }).select().single());
  const runA = check('run', await supabaseAdmin.from('research_runs').insert({ project_id: projectA.id, idea_name: 'Idea A', idea_description: 'Desc', target_customer: 'Cust', market_type: 'B2B', target_region: 'US', mode: 'Fast Scan', status: 'Queued' }).select().single());
  const stageA = check('stage', await supabaseAdmin.from('research_stages').insert({ run_id: runA.id, stage_name: 'Stage A', status: 'Pending' }).select().single());
  const oppA = check('opp', await supabaseAdmin.from('opportunities').insert({ run_id: runA.id, name: 'Opp A', one_liner: 'one', core_pain: 'pain', target_customer: 'cust', market: 'B2B' }).select().single());
  const sourceA = check('source', await supabaseAdmin.from('sources').insert({ run_id: runA.id, url: 'http://a', title: 'Src', source_type: 'web', text_content: 'X' }).select().single());
  const reportA = check('report', await supabaseAdmin.from('reports').insert({ run_id: runA.id, opportunity_id: oppA.id, status: 'Draft', executive_summary: 'E', methodology: 'M' }).select().single());
  const mvpPlanA = check('mvp', await supabaseAdmin.from('mvp_plans').insert({ opportunity_id: oppA.id, build_estimate: 'low', build_complexity: 'Low', outcome: 'good' }).select().single());
  const launchPlanA = check('launch', await supabaseAdmin.from('launch_plans').insert({ opportunity_id: oppA.id, first_customer_channel: 'SEO', success_metric: 'CTR', outreach_message: 'Hi' }).select().single());
  const oppScoreA = check('score', await supabaseAdmin.from('opportunity_scores').insert({ opportunity_id: oppA.id, total: 10, confidence: 5, verdict: 'Avoid' }).select().single());
  const scoreBreakdownA = check('breakdown', await supabaseAdmin.from('score_breakdowns').insert({ score_id: oppScoreA.id, criterion: 'X', score: 5, notes: 'X', weight: 1 }).select().single());
  const evidenceA = check('evidence', await supabaseAdmin.from('evidence_items').insert({ run_id: runA.id, source_id: sourceA.id, opportunity_id: oppA.id, title: 'Ev', snippet: 'Sn', signal_type: 'Pain', strength: 'High', verified: true }).select().single());
  
  const childTables = [
    { name: 'research_stages', fk: 'run_id', fkVal: runA.id, dummy: { stage_name: 'X', status: 'Pending' } },
    { name: 'saved_comparisons', fk: 'project_id', fkVal: projectA.id, dummy: { name: 'X', run_ids: [runA.id] } },
    { name: 'opportunities', fk: 'run_id', fkVal: runA.id, dummy: { name: 'X', one_liner: 'x', core_pain: 'x', target_customer: 'x', market: 'B2B' } },
    { name: 'sources', fk: 'run_id', fkVal: runA.id, dummy: { url: 'http://x', title: 'X', source_type: 'web', text_content: 'X' } },
    { name: 'evidence_items', fk: 'run_id', fkVal: runA.id, dummy: { title: 'X', snippet: 'X', signal_type: 'Pain', strength: 'High' } },
    { name: 'competitors', fk: 'opportunity_id', fkVal: oppA.id, dummy: { name: 'X', positioning: 'X', pricing: 'X', strength: 'X', target: 'X', gap: 'X' } },
    { name: 'risks', fk: 'opportunity_id', fkVal: oppA.id, dummy: { category: 'X', description: 'X', severity: 'low', mitigation: 'X' } },
    { name: 'pricing_models', fk: 'opportunity_id', fkVal: oppA.id, dummy: { model: 'X', price_point: 'X', rationale: 'X', first_offer: 'X', target_customers: 10 } },
    { name: 'mvp_plans', fk: 'opportunity_id', fkVal: oppA.id, dummy: { build_estimate: 'X', build_complexity: 'Low', outcome: 'X' } },
    { name: 'mvp_scope_items', fk: 'mvp_plan_id', fkVal: mvpPlanA.id, dummy: { item_type: 'Scope', description: 'X' } },
    { name: 'launch_plans', fk: 'opportunity_id', fkVal: oppA.id, dummy: { first_customer_channel: 'X', success_metric: 'X', outreach_message: 'X' } },
    { name: 'launch_strategies', fk: 'launch_plan_id', fkVal: launchPlanA.id, dummy: { strategy_type: 'WeekOne', description: 'X' } },
    { name: 'opportunity_scores', fk: 'opportunity_id', fkVal: oppA.id, dummy: { total: 0, confidence: 0, verdict: 'Avoid' } },
    { name: 'score_breakdowns', fk: 'score_id', fkVal: oppScoreA.id, dummy: { criterion: 'X', score: 0, notes: 'X', weight: 1 } },
    { name: 'score_evidence_refs', fk: 'score_breakdown_id', fkVal: scoreBreakdownA.id, dummy: { evidence_id: evidenceA.id } },
    { name: 'reports', fk: 'run_id', fkVal: runA.id, dummy: { opportunity_id: oppA.id, status: 'Draft', executive_summary: 'X', methodology: 'X' } },
    { name: 'report_versions', fk: 'report_id', fkVal: reportA.id, dummy: { version_number: 1, payload: {} } }
  ];

  const matrix: Record<string, any> = {};

  for (const t of childTables) {
    matrix[t.name] = { SELECT: 'FAIL', INSERT: 'FAIL', UPDATE: 'FAIL', DELETE: 'FAIL' };

    // 1. SELECT (Try to fetch A's rows by foreign key)
    let { data: selData, error: selErr } = await supabaseB.from(t.name).select('*').eq(t.fk, t.fkVal);
    if (selErr) {
        matrix[t.name].SELECT = 'PASS (Blocked)';
    } else if (selData && selData.length > 0) {
        matrix[t.name].SELECT = 'FAIL (Rows visible!)';
    } else {
        matrix[t.name].SELECT = 'PASS (0 rows)';
    }

    // 2. INSERT (Try to insert attaching to A's parent record)
    const dummyPayload = { [t.fk]: t.fkVal, ...t.dummy };
    const { error: insErr } = await supabaseB.from(t.name).insert([dummyPayload]);
    if (insErr && (insErr.code === '42501' || insErr.code === 'PGRST116')) {
        matrix[t.name].INSERT = 'PASS (RLS Blocked)';
    } else if (insErr) {
        matrix[t.name].INSERT = `WARN (${insErr.code}: ${insErr.message})`; // If it hits an FK error, RLS didn't block it!
    } else {
        matrix[t.name].INSERT = 'FAIL (Inserted!)';
    }

    // 3. UPDATE (B tries to update A's rows)
    const { error: updErr, data: updData } = await supabaseB.from(t.name).update(t.dummy).eq(t.fk, t.fkVal).select();
    if (updErr && (updErr.code === '42501' || updErr.code === 'PGRST116')) {
        matrix[t.name].UPDATE = 'PASS (Blocked)';
    } else if (updData && updData.length > 0) {
        matrix[t.name].UPDATE = 'FAIL (Updated!)';
    } else {
        matrix[t.name].UPDATE = 'PASS (0 rows)';
    }

    // 4. DELETE (B tries to delete A's rows)
    const { error: delErr, data: delData } = await supabaseB.from(t.name).delete().eq(t.fk, t.fkVal).select();
    if (delErr && (delErr.code === '42501' || delErr.code === 'PGRST116')) {
        matrix[t.name].DELETE = 'PASS (Blocked)';
    } else if (delData && delData.length > 0) {
        matrix[t.name].DELETE = 'FAIL (Deleted!)';
    } else {
        matrix[t.name].DELETE = 'PASS (0 rows)';
    }
  }

  console.table(matrix);
  process.exit(0);
}

runChildAudit().catch(console.error);
