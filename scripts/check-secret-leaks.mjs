import fs from "node:fs";
import path from "node:path";

const ignoredDirectories = new Set(["node_modules", ".git", ".next", "coverage", "playwright-report", "test-results", ".temp"]);
const allowedExtensions = new Set([".cjs", ".js", ".json", ".md", ".mjs", ".sql", ".toml", ".ts", ".tsx", ".yaml", ".yml"]);
const sensitiveNames = ["GEMINI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "WEBHOOK_SECRET", "OAUTH_CLIENT_SECRET", "DATABASE_URL", "DB_PASSWORD", "TAVILY_API_KEY", "FIRECRAWL_API_KEY", "GROQ_API_KEY", "CEREBRAS_API_KEY", "COHERE_API_KEY", "BRAVE_SEARCH_API_KEY"];
const failures = [];

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) { visit(fullPath); continue; }
    if (entry.name.startsWith(".env") && entry.name !== ".env.example") continue;
    if (!allowedExtensions.has(path.extname(entry.name)) && entry.name !== ".env.example") continue;
    const content = fs.readFileSync(fullPath, "utf8");
    if (content.includes("NEXT_PUBLIC_" + "GEMINI_API_KEY")) failures.push(`${fullPath}: browser-exposed Gemini key name`);
    if (/AIza[0-9A-Za-z_-]{30,}/.test(content)) failures.push(`${fullPath}: Google API credential-like value`);
    if (/postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/i.test(content)) failures.push(`${fullPath}: database URL with embedded credentials`);
    for (const name of sensitiveNames) {
      const assignment = new RegExp(`${name}\\s*[=:]\\s*["']([^"'\\s]{8,})["']`, "i");
      if (assignment.test(content) && !fullPath.endsWith("check-secret-leaks.mjs")) failures.push(`${fullPath}: hard-coded ${name}`);
    }
    if (/console\.(log|error|warn|info)\([^\n]*(API_KEY|SERVICE_ROLE|WEBHOOK_SECRET|CLIENT_SECRET|PASSWORD)/i.test(content) && !fullPath.endsWith("check-secret-leaks.mjs")) failures.push(`${fullPath}: possible secret logging`);
  }
}

visit(".");
if (failures.length) {
  console.error(`FAIL: ${failures.length} potential secret exposure(s) found.`);
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log("PASS: no hard-coded or browser-exposed credentials found in repository source files.");
}
