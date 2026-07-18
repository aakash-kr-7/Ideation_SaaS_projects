import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const ignoredDirectories = new Set([".git", ".next", "node_modules"]);
const textExtensions = new Set([".css", ".cjs", ".d.ts", ".env", ".example", ".html", ".js", ".json", ".md", ".mjs", ".sql", ".svg", ".toml", ".ts", ".tsx"]);
const mojibakeMarkers = [
  "\u00c3", "\u00c2", "\u00e2\u20ac", "\u00e2\u2122", "\u00e2\u20ac\u0153",
  "\u00e2\u20ac\u009d", "\u00e2\u20ac\u201c", "\u00e2\u20ac\u201d", "\u00e2\u2020",
  "\u00f0\u0178", "\u00ef\u00bf\u00bd", "\ufffd",
];
const decoder = new TextDecoder("utf-8", { fatal: true });
const failures = [];

async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    const extension = entry.name.endsWith(".d.ts") ? ".d.ts" : extname(entry.name);
    if (!textExtensions.has(extension) && !entry.name.startsWith(".env")) continue;
    let content;
    try {
      content = decoder.decode(await readFile(path));
    } catch (error) {
      failures.push(`${relative(root, path)}: invalid UTF-8 (${error.message})`);
      continue;
    }
    const marker = mojibakeMarkers.find((candidate) => content.includes(candidate));
    if (marker) failures.push(`${relative(root, path)}: probable mojibake marker ${JSON.stringify(marker)}`);
  }
}

await visit(root);
if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Repository text is valid UTF-8 with no known mojibake markers.");
}
