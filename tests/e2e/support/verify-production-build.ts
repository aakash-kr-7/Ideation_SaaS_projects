import { readFile } from "node:fs/promises";
import path from "node:path";

export default async function verifyProductionBuild() {
  const expected = JSON.parse(await readFile(path.resolve("artifacts/browser/expected-build.json"), "utf8"));
  const response = await fetch(`http://127.0.0.1:${expected.port}/api/health/release`, { cache: "no-store" });
  if (!response.ok) throw new Error(`Production build health check failed with ${response.status}`);
  const actual = await response.json();
  if (actual.mode !== "production" || actual.buildId !== expected.buildId || actual.buildId === "unidentified-build") {
    throw new Error(`Stale or non-production server rejected. Expected ${expected.buildId}; received ${JSON.stringify(actual)}`);
  }
}
