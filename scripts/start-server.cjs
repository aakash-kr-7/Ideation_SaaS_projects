/*
 * Production launcher for local development.
 * It avoids the common Windows EADDRINUSE failure by choosing the first
 * available port beginning at PORT (or 3000). Use `npm run start -- --port=3001`
 * when a particular port is required.
 */
const net = require("net");
const { spawn } = require("child_process");
const path = require("path");

function requestedPort() {
  const args = process.argv.slice(2);
  const inline = args.find((arg) => arg.startsWith("--port="));
  const shortIndex = args.findIndex((arg) => arg === "-p" || arg === "--port");
  // npm.cmd on some Windows setups removes the leading dash from forwarded
  // arguments. Accepting a bare numeric argument keeps the documented command
  // reliable in both forms.
  const positional = args.find((arg) => /^\d+$/.test(arg));
  const parsed = inline ? inline.split("=")[1] : shortIndex >= 0 ? args[shortIndex + 1] : positional || process.env.PORT;
  const port = Number(parsed || 3000);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 3000;
}

function portIsAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "::");
  });
}

async function findAvailablePort(startingPort) {
  for (let port = startingPort; port < startingPort + 20; port += 1) {
    if (await portIsAvailable(port)) return port;
  }
  throw new Error(`No available port found between ${startingPort} and ${startingPort + 19}.`);
}

async function main() {
  const requested = requestedPort();
  const port = await findAvailablePort(requested);
  if (port !== requested) console.log(`Port ${requested} is busy. Starting BuildSignal on http://localhost:${port} instead.`);
  const nextBin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  const child = spawn(process.execPath, [nextBin, "start", "-p", String(port)], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (error) => { console.error("Could not start BuildSignal:", error.message); process.exit(1); });
}

main().catch((error) => { console.error(error.message); process.exit(1); });
