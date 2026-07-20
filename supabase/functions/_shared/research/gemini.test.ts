import { GeminiClient, GEMINI_MODEL, parseGroundingSources } from "./gemini.ts";
import { canonicalizeUrl } from "./evidence-boosters.ts";
function assert(value: unknown, message: string) { if (!value) throw new Error(message); }
Deno.test("Gemini has one stable canonical model", () => { assert(GEMINI_MODEL === "gemini-2.5-flash", "model drifted"); });
Deno.test("Gemini credentials are mandatory and server-only", () => { let threw = false; try { new GeminiClient(""); } catch { threw = true; } assert(threw, "empty key accepted"); });
Deno.test("grounding metadata is normalized and deduplicated", () => {
  const response = { candidates: [{ groundingMetadata: { groundingChunks: [{ web: { uri: "https://example.com/a", title: "A" } }, { web: { uri: "https://example.com/a", title: "Duplicate" } }, { web: { uri: "javascript:alert(1)", title: "Bad" } }] } }] };
  const sources = parseGroundingSources(response);
  assert(sources.length === 1 && sources[0].title === "Duplicate", "grounding source normalization failed");
});
Deno.test("booster URLs reject private networks and strip tracking", () => {
  assert(canonicalizeUrl("http://127.0.0.1/secret") === null, "loopback accepted");
  assert(canonicalizeUrl("https://example.com/page?utm_source=test") === "https://example.com/page", "tracking parameter remained");
});
