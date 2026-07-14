import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function execSql(query: string) {
  const { data, error } = await supabase.rpc('audit_exec_sql', { query });
  if (error) {
    throw new Error(`RPC Error: ${error.message} (Query: ${query})`);
  }
  return data;
}

const TABLES = [
  'users', 'teams', 'team_members', 'user_preferences', 'feature_limits',
  'projects', 'research_runs', 'research_stages', 'saved_comparisons',
  'opportunities', 'sources', 'evidence_items', 'competitors', 'risks',
  'pricing_models', 'mvp_plans', 'mvp_scope_items', 'launch_plans',
  'launch_strategies', 'opportunity_scores', 'score_breakdowns',
  'score_evidence_refs', 'reports', 'report_versions', 'analytics_events',
  'error_logs', 'background_jobs', 'notifications', 'cached_research',
  'search_cache', 'billing_customers', 'billing_subscriptions', 'audit_logs'
];

async function checkSchema() {
  console.log('--- SCHEMA AUDIT ---');
  let hasErrors = false;

  for (const table of TABLES) {
    // 1. Check if table exists
    const tblRes = await execSql(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema='public' AND table_name='${table}'
    `);
    if (tblRes.length === 0) {
      console.error(`[FAIL] Table missing: ${table}`);
      hasErrors = true;
      continue;
    }

    // 2. PK UUID check
    const pkRes = await execSql(`
      SELECT c.column_name, c.column_default, c.data_type
      FROM information_schema.table_constraints tc 
      JOIN information_schema.constraint_column_usage AS ccu USING (constraint_schema, constraint_name) 
      JOIN information_schema.columns AS c ON c.table_schema = tc.constraint_schema
        AND tc.table_name = c.table_name AND ccu.column_name = c.column_name
      WHERE constraint_type = 'PRIMARY KEY' and tc.table_name = '${table}'
    `);
    if (pkRes.length === 0) {
      console.error(`[FAIL] No PK for: ${table}`);
      hasErrors = true;
    } else {
      const pk = pkRes[0];
      const derivedPkTables = ['users', 'user_preferences', 'feature_limits', 'search_cache', 'audit_logs'];
      if (pk.data_type !== 'uuid') {
        console.error(`[FAIL] Invalid PK for ${table}: ${pk.column_name} (type: ${pk.data_type})`);
        hasErrors = true;
      } else if (!derivedPkTables.includes(table) && (!pk.column_default || !pk.column_default.includes('gen_random_uuid'))) {
        console.error(`[FAIL] Invalid PK for ${table}: ${pk.column_name} (default: ${pk.column_default})`);
        hasErrors = true;
      }
    }

    // 3. created_at & updated_at
    const colsRes = await execSql(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema='public' AND table_name='${table}'
        AND column_name IN ('created_at', 'updated_at')
    `);
    const cols = colsRes.map((r: any) => r.column_name);
    if (!cols.includes('created_at')) { console.error(`[FAIL] Missing created_at on ${table}`); hasErrors = true; }
    if (!cols.includes('updated_at')) { console.error(`[FAIL] Missing updated_at on ${table}`); hasErrors = true; }

    // 4. updated_at trigger
    if (cols.includes('updated_at')) {
      const triggerRes = await execSql(`
        SELECT tgname 
        FROM pg_trigger 
        JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid 
        WHERE relname='${table}' AND tgname LIKE '%modtime%'
      `);
      if (triggerRes.length === 0) {
        console.error(`[FAIL] Missing updated_at trigger on ${table}`);
        hasErrors = true;
      }
    }

    // 5. RLS Enabled
    const rlsRes = await execSql(`
      SELECT relrowsecurity 
      FROM pg_class 
      WHERE relname='${table}'
    `);
    if (!rlsRes[0]?.relrowsecurity) {
      console.error(`[FAIL] RLS disabled on ${table}`);
      hasErrors = true;
    }
  }

  // Check Foreign Keys (CASCADE / RESTRICT)
  console.log('\\n--- FOREIGN KEYS AUDIT ---');
  const fkRes = await execSql(`
    SELECT
      tc.table_name, kcu.column_name, ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name, rc.delete_rule
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
    JOIN information_schema.referential_constraints AS rc ON rc.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public'
  `);
  
  // Just print them out for manual review of correctness, or flag any "NO ACTION" or "RESTRICT" that might need CASCADE
  for (const fk of fkRes) {
    if (fk.delete_rule === 'NO ACTION') {
       console.warn(`[WARN] FK on ${fk.table_name}.${fk.column_name} -> ${fk.foreign_table_name} has NO ACTION on delete.`);
    }
  }

  console.log(hasErrors ? '\\n[FAIL] Schema Audit Completed with Errors' : '\\n[PASS] Schema Audit Completed Cleanly');
}

checkSchema().catch(console.error);
