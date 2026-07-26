import { defineConfig, devices } from "@playwright/test";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env.local") });
const port = Number(process.env.SHOULDBUILD_E2E_PORT ?? 4317);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /research-live\.spec\.ts/,
  timeout: 20 * 60_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["line"], ["html", { outputFolder: "artifacts/browser/html-report", open: "never" }]],
  globalSetup: "./tests/e2e/support/verify-production-build.ts",
  outputDir: "artifacts/browser/test-results",
  use: {
    baseURL,
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium-production", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.SHOULDBUILD_EXTERNAL_SERVER ? undefined : {
    command: `node node_modules/next/dist/bin/next start -H 127.0.0.1 -p ${port}`,
    url: `${baseURL}/api/health/release`,
    reuseExistingServer: false,
    timeout: 8 * 60_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
