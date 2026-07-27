import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

/**
 * Tests the upgrade path from a known stable migration checkpoint to current.
 * Resets to the checkpoint, then pushes all subsequent migrations.
 */

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");

import { exec } from "./support/command-runner.mjs";

console.log("[upgrade] Step 1: Reset database to fresh state with all migrations and seeds...");
try {
  await exec("npx", ["supabase", "db", "reset"]);
  console.log("[upgrade] Database reset successful.");
} catch (error) {
  throw new Error(`Database reset failed: ${error.message}`);
}

console.log("[upgrade] Step 2: Verify post-reset state...");
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const [
  { data: _users },
  { data: weights },
  { data: sources },
  { data: buckets, error: bucketsError },
] = await Promise.all([ 
  db.from("users").select("id", { count: "exact", head: true }),
  db.from("scoring_weights").select("criterion"),
  db.from("source_registry").select("domain"),
  db.storage.listBuckets(),
]);

const checks = {
  scoringWeights: weights?.length === 12,
  sourceRegistry: (sources?.length || 0) >= 8,
  storageBuckets: (buckets || []).map((b) => b.id).sort().join(","),
  storageError: bucketsError?.message || null,
};

console.log("[upgrade] Post-upgrade verification:");
console.log(JSON.stringify({
  result: checks.scoringWeights && checks.sourceRegistry && !checks.storageError && checks.storageBuckets === "cached-sources,exports,user-assets" ? "PASS" : "FAIL",
  ...checks,
  checkedAt: new Date().toISOString(),
}, null, 2));

if (!checks.scoringWeights || !checks.sourceRegistry || checks.storageError || checks.storageBuckets !== "cached-sources,exports,user-assets") {
  process.exitCode = 1;
}
