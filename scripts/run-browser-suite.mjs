import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readFile } from "node:fs/promises";
import path from "node:path";

const execFileAsync = promisify(execFile);

async function loadLocalSupabaseEnvironment() {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return;

  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npx";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npx.cmd supabase status -o env"]
    : ["supabase", "status", "-o", "env"];
  let stdout;
  try {
    ({ stdout } = await execFileAsync(command, args, {
      cwd: process.cwd(),
      windowsHide: true,
    }));
  } catch {
    throw new Error("Browser tests require a running local Supabase instance or NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  }

  const values = Object.fromEntries(
    stdout.split(/\r?\n/).flatMap((line) => {
      const match = line.match(/^([A-Z_]+)=(?:"(.*)"|(.*))$/);
      return match ? [[match[1], match[2] ?? match[3] ?? ""]] : [];
    }),
  );
  process.env.NEXT_PUBLIC_SUPABASE_URL ??= values.API_URL;
  process.env.SUPABASE_URL ??= values.API_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??= values.ANON_KEY;
  process.env.SUPABASE_ANON_KEY ??= values.ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= values.SERVICE_ROLE_KEY;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Local Supabase did not provide the credentials required for browser tests.");
  }
}

function run(command, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: { ...process.env, ...env }, stdio: "inherit", windowsHide: true });
    child.once("error", reject);
    child.once("exit", (code, signal) => code === 0 ? resolve() : reject(new Error(`${command} exited with ${code ?? signal}`)));
  });
}

await loadLocalSupabaseEnvironment();
await run(process.execPath, [path.resolve("scripts/prepare-playwright-build.mjs")]);
const expected = JSON.parse(await readFile(path.resolve("artifacts/browser/expected-build.json"), "utf8"));
const server = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(expected.port)], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: "production", SHOULDBUILD_DEPLOYMENT_ENV: "production", PORT: String(expected.port) },
  stdio: "inherit",
  windowsHide: true,
});
let suiteError;
try {
  const deadline = Date.now() + 60_000;
  let verified = false;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${expected.port}/api/health/release`, { cache: "no-store" });
      const health = await response.json();
      if (response.ok && health.mode === "production" && health.buildId === expected.buildId) {
        verified = true;
        break;
      }
      throw new Error(`Unexpected build health: ${JSON.stringify(health)}`);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  if (!verified) throw new Error(`Production server did not prove build ${expected.buildId} on port ${expected.port}.`);
  await run(process.execPath, [path.resolve("scripts/verify-security-headers.mjs"), `http://127.0.0.1:${expected.port}`], {
    SHOULDBUILD_DEPLOYMENT_ENV: "production",
  });
  await run(process.execPath, [path.resolve("node_modules/@playwright/test/cli.js"), "test"], { SHOULDBUILD_EXTERNAL_SERVER: "1" });
} catch (error) {
  suiteError = error;
} finally {
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
  } else if (!server.killed) {
    server.kill("SIGTERM");
  }
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  if (server.exitCode === null && !server.killed) server.kill("SIGKILL");
}
if (suiteError) throw suiteError;
