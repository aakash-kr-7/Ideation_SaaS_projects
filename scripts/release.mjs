import { spawn } from "node:child_process";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const releaseId = `release-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${crypto.randomUUID().slice(0, 8)}`;
// Certified bundles are the only generated release evidence retained after cleanup.
const artifactDir = path.resolve("artifacts/certified-release", releaseId);
const logDir = path.join(artifactDir, "logs");
const startTime = Date.now();
const results = [];
await mkdir(logDir, { recursive: true });

function commandForPlatform(command, args) {
  if (process.platform !== "win32" || !["npm", "npx"].includes(command)) return { command, args };
  const quote = (value) => /[\s"]/u.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", `${command}.cmd ${args.map(quote).join(" ")}`],
  };
}
const duration = (startedAt) => Date.now() - startedAt;
const formatDuration = (ms) => `${(ms / 1000).toFixed(1)}s`;

async function terminate(child) {
  if (child.exitCode !== null || child.killed) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
      killer.once("error", resolve);
      killer.once("exit", resolve);
    });
    return;
  }
  child.kill("SIGTERM");
  await new Promise((resolve) => setTimeout(resolve, 3_000));
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function runGate({ id, name, command, args, timeoutMs }) {
  const startedAt = Date.now();
  const logPath = path.join(logDir, `${String(results.length + 1).padStart(2, "0")}-${id}.log`);
  const commandLine = [command, ...args].join(" ");
  console.log(`\n${"=".repeat(78)}\nGATE ${results.length + 1}: ${name}\nCMD: ${commandLine}\n${"=".repeat(78)}`);
  const spawned = commandForPlatform(command, args);
  const child = spawn(spawned.command, spawned.args, {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const chunks = [`$ ${commandLine}\n\n`];
  const append = (chunk, target) => {
    const text = chunk.toString();
    chunks.push(text);
    target.write(text);
  };
  child.stdout.on("data", (chunk) => append(chunk, process.stdout));
  child.stderr.on("data", (chunk) => append(chunk, process.stderr));

  let timedOut = false;
  const outcome = await new Promise((resolve) => {
    const timer = setTimeout(async () => {
      timedOut = true;
      await terminate(child);
      resolve({ code: null, signal: "timeout" });
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ code: null, signal: null, error: error.message });
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
  const passed = outcome.code === 0 && !timedOut;
  const entry = {
    id, name, command: commandLine, timeoutMs, startedAt: new Date(startedAt).toISOString(),
    durationMs: duration(startedAt), passed, exitCode: outcome.code, signal: outcome.signal,
    error: outcome.error ?? (timedOut ? `Timed out after ${timeoutMs}ms` : undefined),
    log: path.relative(artifactDir, logPath),
  };
  chunks.push(`\n[release] ${passed ? "PASS" : "FAIL"}: ${name} (${formatDuration(entry.durationMs)})\n`);
  await writeFile(logPath, chunks.join(""), "utf8");
  results.push(entry);
  console.log(`[release] ${passed ? "PASS" : "FAIL"}: ${name} (${formatDuration(entry.durationMs)})`);
  if (!passed) throw new Error(`${name} failed; see ${logPath}`);
}

async function discoverVerifiedRuns() {
  const script = `import "dotenv/config"; import { createClient } from "@supabase/supabase-js"; const u=process.env.SUPABASE_URL, k=process.env.SUPABASE_SERVICE_ROLE_KEY; const db=createClient(u,k,{auth:{persistSession:false}}); const {data,error}=await db.from("research_runs").select("id,mode,status,terminal_at").eq("status","Completed").in("mode",["quick_scan","full_validation"]).order("terminal_at",{ascending:false}); if(error) throw error; const quick=data.find(r=>r.mode==="quick_scan"), full=data.find(r=>r.mode==="full_validation"); if(!quick||!full) throw new Error("No completed Quick Scan and Full Validation runs are available for immutable release verification."); console.log(JSON.stringify({quickRunId:quick.id,fullRunId:full.id}));`;
  const output = [];
  try {
    await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", script], { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => process.stderr.write(chunk));
    child.once("error", reject);
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error("Unable to discover completed release verification runs.")));
    });
    return { ...JSON.parse(Buffer.concat(output).toString("utf8")), source: "database" };
  } catch {
    const auditRoot = await latestCertifiedAuditRoot();
    const entries = await readdir(auditRoot, { withFileTypes: true });
    const snapshots = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
      try { return JSON.parse(await readFile(path.join(auditRoot, entry.name, "summary.json"), "utf8")); } catch { return null; }
    }));
    const completed = snapshots.filter((item) => item?.status === "Completed");
    const quick = completed.find((item) => item.mode === "quick_scan");
    const full = completed.find((item) => item.mode === "full_validation");
    if (!quick || !full) throw new Error("No completed Quick Scan and Full Validation database rows or immutable audit snapshots are available for release verification.");
    return { quickRunId: quick.runId, fullRunId: full.runId, source: "immutable_snapshot" };
  }
}

async function latestCertifiedAuditRoot() {
  const certifiedRoot = path.resolve("artifacts/certified-release");
  const releases = await readdir(certifiedRoot, { withFileTypes: true });
  const latest = releases
    .filter((entry) => entry.isDirectory() && entry.name !== releaseId)
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  if (!latest) throw new Error("No certified release bundle is available for immutable release verification.");
  return path.join(certifiedRoot, latest, "hybrid-audit");
}

async function copyIfPresent(source, destination) {
  try { await cp(source, destination, { recursive: true, force: true, errorOnExist: false }); } catch (error) { if (error.code !== "ENOENT") throw error; }
}

async function sealArtifactBundle(directory) {
  const files = [];
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile() && entry.name !== "artifact-seal.json" && entry.name !== "release-audit.json") {
        const bytes = await readFile(absolute);
        files.push({
          path: path.relative(directory, absolute).replaceAll("\\", "/"),
          bytes: bytes.length,
          sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  }
  await visit(directory);
  files.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = JSON.stringify(files);
  const digest = crypto.createHash("sha256").update(manifest).digest("hex");
  const seal = {
    algorithm: "SHA-256",
    contentAddress: `sha256:${digest}`,
    fileCount: files.length,
    createdAt: new Date().toISOString(),
    exclusions: ["artifact-seal.json", "release-audit.json"],
    files,
  };
  await writeFile(path.join(directory, "artifact-seal.json"), `${JSON.stringify(seal, null, 2)}\n`, "utf8");
  for (const file of files) {
    const bytes = await readFile(path.join(directory, file.path));
    const actual = crypto.createHash("sha256").update(bytes).digest("hex");
    if (actual !== file.sha256) throw new Error(`Release seal verification failed for ${file.path}.`);
  }
  return { contentAddress: seal.contentAddress, fileCount: seal.fileCount, verified: true };
}

let runIds;
let failure;
try {
  await runGate({ id: "environment", name: "Environment preflight", command: "node", args: ["scripts/env-preflight.mjs"], timeoutMs: 60_000 });
  runIds = await discoverVerifiedRuns();
  if (runIds.source === "database") {
    await runGate({ id: "snapshot", name: "Immutable verified-report snapshot", command: "node", args: ["scripts/export-hybrid-audit.mjs", runIds.quickRunId], timeoutMs: 120_000 });
    await runGate({ id: "snapshot-full", name: "Immutable Full Validation snapshot", command: "node", args: ["scripts/export-hybrid-audit.mjs", runIds.fullRunId], timeoutMs: 120_000 });
  } else {
    await runGate({ id: "snapshot", name: "Immutable verified-report snapshot", command: "node", args: ["scripts/verify-export-checksums.mjs", runIds.quickRunId, runIds.fullRunId], timeoutMs: 120_000 });
    await copyIfPresent(await latestCertifiedAuditRoot(), path.join(artifactDir, "hybrid-audit"));
  }
  const gates = [
    ["product-truth", "Product-truth and text scan", "npm", ["run", "check:text"], 60_000],
    ["secrets", "Secret scan", "npm", ["run", "test:secrets"], 60_000],
    ["typescript", "TypeScript", "npm", ["run", "typecheck"], 120_000],
    ["eslint", "ESLint with zero warnings", "npm", ["run", "lint"], 120_000],
    ["unit", "Unit tests", "npm", ["run", "test:unit"], 180_000],
    ["deno", "Deno checks", "npm", ["run", "check:deno"], 120_000],
    ["database-reset", "Fresh local database reset", "npm", ["run", "db:reset"], 10 * 60_000],
    ["upgrade", "Upgrade-path verification", "npm", ["run", "verify:upgrade"], 10 * 60_000],
    ["restore", "Restore rehearsal", "npm", ["run", "verify:restore"], 15 * 60_000],
    ["security", "RLS, Storage, Realtime and internal-table audit", "npm", ["run", "test:rls"], 5 * 60_000],
    ["auth", "Authentication-flow verification", "npm", ["run", "verify:auth"], 5 * 60_000],
    ["worker", "Isolated worker smoke", "npm", ["run", "smoke:worker"], 5 * 60_000],
    ["scheduler", "Isolated scheduler smoke", "npm", ["run", "smoke:scheduler"], 5 * 60_000],
    ["operations", "Operational-health verification", "npm", ["run", "ops:health"], 120_000],
    ["alert-delivery", "Signed external alert-delivery verification", "npm", ["run", "verify:alerts"], 120_000],
    ["semantic", "Semantic-quality verification", "node", ["scripts/assess-semantic-quality.mjs", runIds.quickRunId, runIds.fullRunId], 120_000],
    ["build", "Production build", "npm", ["run", "build"], 10 * 60_000],
    ["browser", "Browser E2E", "npm", ["run", "test:browser"], 45 * 60_000],
    ["rollback", "Production-build rollback rehearsal", "npm", ["run", "verify:rollback"], 10 * 60_000],
    ["exports", "Export and checksum verification", "node", ["scripts/verify-export-checksums.mjs", runIds.quickRunId, runIds.fullRunId], 120_000],
    ["build-identity", "Final production build identity check", "node", ["scripts/verify-release-build.mjs"], 180_000],
  ];
  for (const [id, name, command, args, timeoutMs] of gates) await runGate({ id, name, command, args, timeoutMs });
} catch (error) {
  failure = error instanceof Error ? error.message : String(error);
} finally {
  await copyIfPresent(path.resolve("artifacts/browser"), path.join(artifactDir, "browser"));
  await copyIfPresent(path.resolve("artifacts/hybrid-audit"), path.join(artifactDir, "hybrid-audit"));
  await copyIfPresent(path.resolve("artifacts/restore-rehearsal"), path.join(artifactDir, "restore-rehearsal"));
}

let seal;
try {
  seal = await sealArtifactBundle(artifactDir);
} catch (error) {
  failure ??= `Release artifact sealing failed: ${error instanceof Error ? error.message : String(error)}`;
}
const summary = { releaseId, result: failure ? "FAIL" : "PASS", totalDurationMs: duration(startTime), generatedAt: new Date().toISOString(), runIds, seal, failure, gates: results };
await writeFile(path.join(artifactDir, "release-audit.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
console.log(`\nRELEASE ${summary.result}: ${releaseId}`);
console.table(results.map((gate) => ({ gate: gate.name, result: gate.passed ? "PASS" : "FAIL", duration: formatDuration(gate.durationMs), exit: gate.exitCode ?? gate.signal ?? "error" })));
console.log(`Artifact bundle: ${artifactDir}`);
if (failure) { console.error(`Release stopped: ${failure}`); process.exitCode = 1; }
