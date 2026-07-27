import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const secret = `alert-proof-${crypto.randomUUID()}`;
const artifactDir = path.resolve("artifacts/operations");
await mkdir(artifactDir, { recursive: true });
let receipt;

const server = createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", () => {
    const body = Buffer.concat(chunks).toString("utf8");
    const expected = `sha256=${
      createHmac("sha256", secret).update(body).digest("hex")
    }`;
    receipt = {
      method: request.method,
      signatureValid: request.headers["x-shouldbuild-signature"] === expected,
      payload: JSON.parse(body),
      receivedAt: new Date().toISOString(),
    };
    response.writeHead(receipt.signatureValid ? 202 : 401);
    response.end();
  });
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") {
  throw new Error("Alert proof receiver did not bind a port.");
}

const output = [];
const child = spawn(process.execPath, [
  path.resolve("scripts/operational-health.mjs"),
], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    OPERATIONAL_ALERT_TEST: "1",
    OPERATIONAL_ALERT_WEBHOOK_URL: `http://127.0.0.1:${address.port}/alerts`,
    OPERATIONAL_ALERT_WEBHOOK_SECRET: secret,
  },
  stdio: ["ignore", "pipe", "pipe"],
  windowsHide: true,
});
child.stdout.on("data", (chunk) => output.push(chunk));
child.stderr.on("data", (chunk) => output.push(chunk));
const code = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", resolve);
});
await new Promise((resolve) => server.close(resolve));

const result = {
  result: code === 0 && receipt?.signatureValid &&
      receipt?.payload?.event === "shouldbuild.alert.test"
    ? "PASS"
    : "FAIL",
  childExitCode: code,
  receipt,
  checkedAt: new Date().toISOString(),
};
await writeFile(
  path.join(artifactDir, "alert-delivery-result.json"),
  `${JSON.stringify(result, null, 2)}\n`,
  "utf8",
);
console.log(JSON.stringify(result, null, 2));
if (result.result !== "PASS") {
  console.error(Buffer.concat(output).toString("utf8"));
  process.exitCode = 1;
}
