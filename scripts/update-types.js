const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const destination = path.join(
  __dirname,
  "../supabase/functions/_shared/types.ts",
);
const marker = "// Application domain types";
const existing = fs.readFileSync(destination, "utf8");
const markerIndex = existing.indexOf(marker);

if (markerIndex < 0) {
  throw new Error(`Missing preserved domain-type marker in ${destination}`);
}

console.log("Generating canonical database schema types...");
const generated = execSync("npx supabase gen types typescript --local", {
  encoding: "utf8",
});
const domainTypes = existing.slice(markerIndex);
const preamble = [
  "// Shared, runtime-neutral database and report domain types.",
  'import type { ResearchStatus } from "./research/status.ts";',
  'import type { ReportMode } from "./research/mode-config.ts";',
  "",
].join("\n");

fs.writeFileSync(
  destination,
  `${preamble}${generated.trimEnd()}\n\n${domainTypes}`,
  "utf8",
);
console.log(`Updated ${destination}`);
