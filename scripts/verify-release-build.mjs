import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const expected = JSON.parse(await readFile(path.resolve("artifacts/browser/expected-build.json"), "utf8"));
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const address = probe.address();
    probe.close(() => resolve(address.port));
  });
});
const server = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, NODE_ENV: "production", PORT: String(port) },
  stdio: "inherit",
  windowsHide: true,
});

async function stop() {
  if (server.exitCode !== null || server.killed) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", ["/pid", String(server.pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
      killer.once("exit", resolve); killer.once("error", resolve);
    });
  } else server.kill("SIGTERM");
}

try {
  const deadline = Date.now() + 60_000;
  let health;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health/release`, { cache: "no-store" });
      if (response.ok) { health = await response.json(); break; }
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  if (!health || health.mode !== "production" || health.buildId !== expected.buildId || health.buildId === "unidentified-build") {
    throw new Error(`Build identity verification failed: expected ${expected.buildId}, received ${JSON.stringify(health)}`);
  }
  console.log(JSON.stringify({ result: "PASS", buildId: health.buildId, port }, null, 2));
} finally {
  await stop();
}
