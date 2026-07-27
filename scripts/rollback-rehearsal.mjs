import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".");
const liveBuild = path.resolve(".next");
const artifactDir = path.resolve("artifacts/rollback-rehearsal");
const archivedBuild = path.join(artifactDir, "previous-build");
const failedCandidate = path.resolve(".next.rollback-candidate");
const resultPath = path.join(artifactDir, "rollback-rehearsal-result.json");
const port = 4321;

for (const target of [liveBuild, artifactDir, archivedBuild, failedCandidate]) {
  if (!(target === liveBuild || target.startsWith(`${root}${path.sep}`))) {
    throw new Error(`Unsafe rollback path: ${target}`);
  }
}

async function manifest(directory) {
  const result = {};
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) {
        const relative = path.relative(directory, absolute).replaceAll(
          "\\",
          "/",
        );
        result[relative] = createHash("sha256").update(await readFile(absolute))
          .digest("hex");
      }
    }
  }
  await visit(directory);
  return result;
}

async function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill.exe", [
        "/PID",
        String(child.pid),
        "/T",
        "/F",
      ], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.once("exit", resolve);
      killer.once("error", resolve);
    });
  } else {
    child.kill("SIGTERM");
  }
}

const result = { startedAt: new Date().toISOString(), steps: [] };
let server;
let movedLiveBuild = false;
try {
  const buildStat = await stat(liveBuild);
  if (!buildStat.isDirectory()) {
    throw new Error("No production .next build is available to rehearse.");
  }
  const expectedBuild = JSON.parse(
    await readFile(
      path.resolve("artifacts/browser/expected-build.json"),
      "utf8",
    ),
  );
  await mkdir(artifactDir, { recursive: true });
  await rm(archivedBuild, { recursive: true, force: true });
  await rm(failedCandidate, { recursive: true, force: true });

  const before = await manifest(liveBuild);
  await cp(liveBuild, archivedBuild, { recursive: true, force: true });
  result.steps.push({
    name: "previous_build_archived",
    passed: true,
    files: Object.keys(before).length,
  });

  await rename(liveBuild, failedCandidate);
  movedLiveBuild = true;
  await cp(archivedBuild, liveBuild, { recursive: true, force: true });
  const restored = await manifest(liveBuild);
  const exact = JSON.stringify(restored) === JSON.stringify(before);
  if (!exact) {
    throw new Error(
      "Restored build manifest differs from the archived production build.",
    );
  }
  result.steps.push({
    name: "artifact_restore_exact",
    passed: true,
    files: Object.keys(restored).length,
  });

  server = spawn(process.execPath, [
    path.resolve("node_modules/next/dist/bin/next"),
    "start",
    "-H",
    "127.0.0.1",
    "-p",
    String(port),
  ], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "production",
      SHOULDBUILD_DEPLOYMENT_ENV: "production",
      PORT: String(port),
    },
    stdio: "ignore",
    windowsHide: true,
  });
  const deadline = Date.now() + 60_000;
  let health;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/health/release`,
        { cache: "no-store" },
      );
      health = await response.json();
      if (
        response.ok && health.mode === "production" &&
        health.buildId === expectedBuild.buildId
      ) break;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  if (
    !health || health.buildId !== expectedBuild.buildId ||
    health.mode !== "production"
  ) {
    throw new Error(
      `Rolled-back build failed identity verification: ${
        JSON.stringify(health)
      }`,
    );
  }
  result.steps.push({
    name: "rolled_back_build_booted",
    passed: true,
    buildId: health.buildId,
  });
  result.result = "PASS";
  result.buildId = health.buildId;
} catch (error) {
  result.result = "FAIL";
  result.error = error instanceof Error ? error.message : String(error);
} finally {
  await stop(server);
  if (movedLiveBuild) {
    if (result.result === "PASS") {
      await rm(failedCandidate, { recursive: true, force: true });
    } else {
      await rm(liveBuild, { recursive: true, force: true });
      await rename(failedCandidate, liveBuild);
    }
  }
  result.completedAt = new Date().toISOString();
  await mkdir(artifactDir, { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result, null, 2));
  if (result.result !== "PASS") process.exitCode = 1;
}
