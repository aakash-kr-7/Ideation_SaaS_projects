import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted } from "../../stages.ts";
import { updateState } from "../../pipeline-utils.ts";
import { retrieveOfficialPage, searchGitHub, searchHackerNews, type BoosterResult } from "../../evidence-boosters.ts";

export async function executeHybridEvidenceBoosters(ctx: StageContext): Promise<StageResult> {
  const { runId, db, inputMeta, startedAt } = ctx;
  const opportunityId = inputMeta.opportunityId as string;
  const rawGeminiText = String(inputMeta.rawGeminiText || "");
  const targetCustomer = String(inputMeta.targetCustomer || "").toLowerCase();
  const marketType = String(inputMeta.marketType || "").toLowerCase();
  const ideaName = String(inputMeta.ideaName || "");
  const groundingSources = Array.isArray(inputMeta.groundingSources) ? inputMeta.groundingSources as Array<{ url?: string }> : [];
  const mode = String(inputMeta.mode || "quick_scan");
  await updateState(runId, "Searching", 50, "Retrieving cited pages and selective public evidence", db);

  const results: BoosterResult[] = [];
  const citedUrls = groundingSources.flatMap((source) => source.url ? [source.url] : []).slice(0, mode === "full_validation" ? 12 : 5);
  for (const url of citedUrls) {
    try { const result = await retrieveOfficialPage(url); if (result) results.push(result); }
    catch (error) { console.warn("Cited-page booster failed", { runId, url, message: error instanceof Error ? error.message : String(error) }); }
  }
  const technicalAudience = /developer|startup|founder|software/.test(`${targetCustomer} ${marketType}`);
  if (technicalAudience) {
    try { results.push(...await searchHackerNews(`${ideaName} ${targetCustomer}`)); } catch { /* selective boosters are non-blocking */ }
  }
  if (/developer|open source|software/.test(`${targetCustomer} ${marketType} ${rawGeminiText.toLowerCase()}`)) {
    try { results.push(...await searchGitHub(`${ideaName} ${marketType}`)); } catch { /* selective boosters are non-blocking */ }
  }
  const catalogEntries: BoosterResult[] = [
    ...groundingSources.flatMap((source) => source.url ? [{ title: source.url, url: source.url, excerpt: "Gemini grounded source", source: "grounding" as const }] : []),
    ...results,
  ];
  const unique = [...new Map(catalogEntries.map((item) => [item.url, item])).values()];
  const boosterText = unique.map((item) => `Source: ${item.title}\nURL: ${item.url}\nExcerpt: ${item.excerpt}`).join("\n\n");
  return stageCompleted("validate_normalize", { boosterCount: unique.length }, {
    pages_attempted: citedUrls.length, pages_fetched: unique.length, duration_ms: Date.now() - startedAt,
  }, { nextInputMeta: { opportunityId, mode, combinedText: `${rawGeminiText}\n\n${boosterText}`, sourceCatalog: unique } });
}
