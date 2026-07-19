import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL.replace(/\/$/, "");
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function extract() {
  const { data: run } = await admin.from("research_runs").select("id").eq("status", "Completed").order("created_at", { ascending: false }).limit(1).single();
  if (!run) throw new Error("No completed run found");
  
  console.log(`=== RUN ID: ${run.id} ===`);

  // Claim Mappings (graph edges)
  const { data: edges } = await admin.from("evidence_graph_edges").select("from_node_id, to_node_id, relation").eq("run_id", run.id).limit(10);
  console.log("\n--- CLAIM MAPPINGS (Sample) ---");
  edges.forEach(e => console.log(`${e.from_node_id} --[${e.relation}]--> ${e.to_node_id}`));

  // Metric Mappings (score evidence refs)
  const { data: refs } = await admin.from("score_evidence_refs").select("score_breakdowns(criterion, score), evidence_id").limit(10);
  console.log("\n--- METRIC MAPPINGS (Sample) ---");
  refs.forEach(r => {
      const b = Array.isArray(r.score_breakdowns) ? r.score_breakdowns[0] : r.score_breakdowns;
      if (b) console.log(`Metric ${b.criterion} (Score: ${b.score}) uses Evidence ID: ${r.evidence_id}`);
  });

  // Chart Mappings
  const { data: charts } = await admin.from("report_chart_datasets").select("chart_key, chart_type, sha256").eq("run_id", run.id);
  console.log("\n--- CHART MAPPINGS ---");
  charts.forEach(c => console.log(`Chart: ${c.chart_key} (${c.chart_type}) - SHA256: ${c.sha256}`));

  // Completeness Results
  const { data: reportVersion } = await admin.from("report_versions").select("payload").eq("report_mode", "full_validation").order("created_at", { ascending: false }).limit(1).single();
  console.log("\n--- COMPLETENESS RESULTS ---");
  if (reportVersion) {
      console.log(JSON.stringify(reportVersion.payload.completeness, null, 2));
  } else {
      console.log("No report version payload found.");
  }

  // Export Checksums
  if (reportVersion) {
      const { data: versionMeta } = await admin.from("report_versions").select("id").eq("payload->>score", reportVersion.payload.score).order("created_at", { ascending: false }).limit(1).single();
      if (versionMeta) {
          const { data: exports } = await admin.from("report_exports").select("format, sha256, byte_size").eq("report_version_id", versionMeta.id);
          console.log("\n--- EXPORT CHECKSUMS ---");
          exports.forEach(e => console.log(`Format: ${e.format.padEnd(8)} | Size: ${String(e.byte_size).padEnd(6)} | SHA256: ${e.sha256}`));
      }
  }
}

extract().catch(console.error);
