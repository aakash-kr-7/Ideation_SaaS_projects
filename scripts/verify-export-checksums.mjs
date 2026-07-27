import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const runIds = process.argv.slice(2);
if (runIds.length !== 2 || runIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
  throw new Error("Usage: node scripts/verify-export-checksums.mjs <quick-run-id> <full-run-id>");
}

const requiredFormats = new Set(["pdf", "markdown", "csv", "json"]);
async function auditSummaryPath(runId) {
  const livePath = path.resolve("artifacts/hybrid-audit", runId, "summary.json");
  try {
    await access(livePath);
    return livePath;
  } catch {
    const certifiedRoot = path.resolve("artifacts/certified-release");
    const releases = await readdir(certifiedRoot, { withFileTypes: true });
    const candidates = releases.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
    for (const release of candidates) {
      const candidate = path.join(certifiedRoot, release, "hybrid-audit", runId, "summary.json");
      try {
        await access(candidate);
        return candidate;
      } catch { /* try the next certified bundle */ }
    }
    throw new Error("No certified release artifact contains the required immutable export summary.");
  }
}
const result = [];
for (const runId of runIds) {
  const summaryPath = await auditSummaryPath(runId);
  const summary = JSON.parse(await readFile(summaryPath, "utf8"));
  const checks = summary.exportChecks || [];
  const formats = new Set(checks.map((check) => check.format));
  const valid = checks.length === 4 && [...requiredFormats].every((format) => formats.has(format)) &&
    checks.every((check) => check.opened === true && /^[a-f0-9]{64}$/i.test(check.sha256 || ""));
  result.push({ runId, mode: summary.mode, valid, formats: [...formats].sort(), exports: checks.length });
}

console.log(JSON.stringify({ result: result.every((item) => item.valid) ? "PASS" : "FAIL", runs: result }, null, 2));
if (!result.every((item) => item.valid)) process.exitCode = 1;
