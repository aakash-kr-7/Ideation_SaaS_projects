import "dotenv/config";
import { existsSync } from "node:fs";

const required = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

const missing = required.filter((name) => !String(process.env[name] || "").trim());
const checks = {
  environmentFilePresent: existsSync(".env") || existsSync(".env.local"),
  requiredVariablesPresent: missing.length === 0,
  supabaseEndpointsMatch: !missing.length &&
    process.env.SUPABASE_URL?.replace(/\/$/, "") === process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, ""),
};

console.log(JSON.stringify({
  result: Object.values(checks).every(Boolean) ? "PASS" : "FAIL",
  checks,
  missing,
  note: "Provider credentials are verified by the isolated worker smoke; this preflight never prints secret values.",
}, null, 2));

if (!Object.values(checks).every(Boolean)) process.exitCode = 1;
