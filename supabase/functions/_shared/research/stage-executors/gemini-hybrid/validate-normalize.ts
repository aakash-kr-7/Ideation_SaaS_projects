import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted, stageFailed } from "../../stages.ts";
import { updateState, costBudgetForRun } from "../../pipeline-utils.ts";
import { canonicalizeUrl } from "../../evidence-boosters.ts";
import { normalizeCurrency, normalizeBillingPeriod, clusterEvidence } from "../../evidence-intelligence.ts";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    claims: { type: "array", items: { type: "object", properties: {
      sourceUrl: { type: "string" }, title: { type: "string" }, excerpt: { type: "string" },
      family: { type: "string", enum: ["problem", "solution"] },
      signalType: { type: "string", enum: ["Pain", "Demand", "Pricing", "Risk"] },
      strength: { type: "string", enum: ["High", "Medium", "Low"] },
      disconfirming: { type: "boolean" }, sourceTier: { type: "integer" }, numericValue: { type: "string" },
    }, required: ["sourceUrl", "title", "excerpt", "family", "signalType", "strength", "disconfirming", "sourceTier"] } },
    competitors: { type: "array", items: { type: "object", properties: {
      name: { type: "string" }, positioning: { type: "string" }, pricing: { type: "string" }, target: { type: "string" }, strength: { type: "string" }, gap: { type: "string" },
    }, required: ["name", "positioning", "pricing", "target", "strength", "gap"] } },
    risks: { type: "array", items: { type: "object", properties: {
      category: { type: "string", enum: ["Market", "Execution", "Platform", "Regulatory"] }, severity: { type: "string", enum: ["High", "Medium", "Low"] }, description: { type: "string" }, mitigation: { type: "string" },
    }, required: ["category", "severity", "description", "mitigation"] } },
    pricing: { type: "object", properties: { model: { type: "string" }, pricePoint: { type: "string" }, rationale: { type: "string" }, firstOffer: { type: "string" }, targetCustomers: { type: "integer" } }, required: ["model", "pricePoint", "rationale", "firstOffer", "targetCustomers"] },
    mvp: { type: "object", properties: { outcome: { type: "string" }, buildEstimate: { type: "string" }, buildComplexity: { type: "string", enum: ["Low", "Medium", "High"] }, scope: { type: "array", items: { type: "string" } }, exclusions: { type: "array", items: { type: "string" } } }, required: ["outcome", "buildEstimate", "buildComplexity", "scope", "exclusions"] },
    launch: { type: "object", properties: { firstCustomerChannel: { type: "string" }, outreachMessage: { type: "string" }, successMetric: { type: "string" }, weekOne: { type: "array", items: { type: "string" } }, firstTen: { type: "array", items: { type: "string" } } }, required: ["firstCustomerChannel", "outreachMessage", "successMetric", "weekOne", "firstTen"] },
    adversarial: { type: "object", properties: { outcome: { type: "string", enum: ["StrongObjection", "NoStrongDisproof", "InsufficientEvidence"] }, severity: { type: "string", enum: ["High", "Medium", "Low", "None"] }, objection: { type: "string" }, sourceUrls: { type: "array", items: { type: "string" } } }, required: ["outcome", "severity", "objection", "sourceUrls"] },
  },
  required: ["claims", "competitors", "risks", "pricing", "mvp", "launch", "adversarial"],
} as const;

export async function executeHybridValidateNormalize(ctx: StageContext): Promise<StageResult> {
  const { runId, db, config, startedAt, inputMeta } = ctx;
  const opportunityId = String(inputMeta.opportunityId || "");
  const combinedText = String(inputMeta.combinedText || "");
  const mode = String(inputMeta.mode || "quick_scan");
  const catalog = Array.isArray(inputMeta.sourceCatalog) ? inputMeta.sourceCatalog as Array<{ url?: string; title?: string; excerpt?: string }> : [];
  if (!opportunityId || !combinedText || !catalog.length) return stageFailed("permanent", "Validation requires an opportunity, grounded text, and attributable source metadata.");

  try {
    await updateState(runId, "Normalizing", 65, "Validating and normalizing attributable evidence", db);
    const allowedSources = new Map<string, { title: string; excerpt: string }>();
    for (const source of catalog) {
      const url = source.url ? canonicalizeUrl(source.url) : null;
      if (url) allowedSources.set(url, { title: source.title || new URL(url).hostname, excerpt: source.excerpt || "" });
    }
    const result = await ctx.dependencies.createGemini().generate({
      runId, taskType: "validate_normalize", budget: await costBudgetForRun(runId, db, config), db,
      systemInstruction: "Extract only claims attributable to the provided source catalog. Never invent a URL. Produce normalized product artifacts using only the supplied evidence.",
      prompt: `Report mode: ${mode}\nAllowed source URLs:\n${[...allowedSources.keys()].join("\n")}\n\nResearch text:\n${combinedText.slice(0, mode === "full_validation" ? 32_000 : 18_000)}`,
      responseSchema: RESPONSE_SCHEMA,
    });
    const parsed = result.parsed as any;
    const validClaims: any[] = [];
    const fingerprints = new Set<string>();
    for (const claim of parsed.claims || []) {
      const url = canonicalizeUrl(claim.sourceUrl || "");
      const tier = Number(claim.sourceTier);
      if (!url || !allowedSources.has(url) || ![1, 2, 3, 4].includes(tier)) continue;
      const fingerprint = await sha256(`${url}|${String(claim.title).trim().toLowerCase()}|${String(claim.excerpt).trim().toLowerCase()}`);
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      let snippet = String(claim.excerpt).trim();
      if (claim.numericValue && claim.signalType === "Pricing") {
        const currency = normalizeCurrency(String(claim.numericValue));
        if (currency) snippet += ` (Normalized: ${currency.currency} ${currency.amount}/${normalizeBillingPeriod(String(claim.numericValue))})`;
      }
      validClaims.push({ ...claim, sourceUrl: url, sourceTier: tier, snippet, fingerprint });
    }
    if (!validClaims.length) return stageFailed("permanent", "Gemini returned no claims attributable to grounded sources.");

    const evidenceItemIds: string[] = [];
    for (const claim of validClaims) {
      const sourceMeta = allowedSources.get(claim.sourceUrl)!;
      const { data: source, error: sourceError } = await db.from("sources").upsert({
        run_id: runId, title: claim.title || sourceMeta.title, url: claim.sourceUrl,
        source_type: "GeminiGroundedWeb", text_content: sourceMeta.excerpt || claim.snippet,
        canonical_url: claim.sourceUrl, source_domain: new URL(claim.sourceUrl).hostname,
        source_tier: claim.sourceTier, excluded: claim.sourceTier === 4,
      }, { onConflict: "run_id,url" }).select("id").single();
      if (sourceError || !source) throw new Error(`Source persistence failed: ${sourceError?.message}`);
      const { data: item, error: itemError } = await db.from("evidence_items").upsert({
        run_id: runId, source_id: source.id, opportunity_id: opportunityId, title: claim.title,
        snippet: claim.snippet, signal_type: claim.signalType, strength: claim.strength,
        verified: true, evidence_family: claim.family, source_tier: claim.sourceTier,
        source_domain: new URL(claim.sourceUrl).hostname, disconfirming: claim.disconfirming,
        excluded: claim.sourceTier === 4, claim_fingerprint: claim.fingerprint,
      }, { onConflict: "run_id,claim_fingerprint" }).select("id").single();
      if (itemError || !item) throw new Error(`Evidence persistence failed: ${itemError?.message}`);
      evidenceItemIds.push(item.id);
    }

    await persistArtifacts(db, opportunityId, parsed);
    const { data: items } = await db.from("evidence_items").select("*").eq("run_id", runId).eq("excluded", false);
    await db.from("evidence_clusters").delete().eq("run_id", runId);
    for (const cluster of clusterEvidence(items || [])) {
      await db.from("evidence_clusters").insert({
        run_id: runId, opportunity_id: opportunityId, cluster_key: cluster.key, signal_type: cluster.kind,
        representative_claim: cluster.representativeClaim, supporting_evidence_ids: cluster.supportingEvidenceIds,
        contradicting_evidence_ids: cluster.contradictingEvidenceIds, independent_source_count: cluster.independentSourceCount,
        independent_domain_count: cluster.independentDomainCount, tier_distribution: cluster.tierDistribution,
        confidence: cluster.confidence, unresolved_disagreement: cluster.unresolvedDisagreement,
      });
    }
    const usable = items || [];
    const rules = config.evidenceSufficiency;
    const gaps = [
      ...(usable.length < rules.minimumUsableEvidence ? [`need ${rules.minimumUsableEvidence} usable evidence items`] : []),
      ...(usable.filter((item: any) => item.evidence_family === "problem").length < rules.minimumProblemSources ? ["insufficient problem evidence"] : []),
      ...(usable.filter((item: any) => item.evidence_family === "solution").length < rules.minimumSolutionSources ? ["insufficient solution evidence"] : []),
      ...(usable.filter((item: any) => item.disconfirming).length < rules.minimumDisconfirmingEvidence ? ["insufficient disconfirming evidence"] : []),
      ...(rules.requireTierOneEvidence && !usable.some((item: any) => item.source_tier === 1) ? ["Tier 1 evidence missing"] : []),
      ...(rules.requireTierOneOrTwoEvidence && !usable.some((item: any) => item.source_tier <= 2) ? ["Tier 1/2 evidence missing"] : []),
    ];
    await db.from("research_runs").update({ retrieval_sufficient: gaps.length === 0, retrieval_coverage_gaps: gaps }).eq("id", runId);

    const sourceToEvidence = new Map(validClaims.map((claim, index) => [claim.sourceUrl, evidenceItemIds[index]]));
    const adversarialEvidenceIds = (parsed.adversarial?.sourceUrls || []).flatMap((url: string) => {
      const canonical = canonicalizeUrl(url); const id = canonical ? sourceToEvidence.get(canonical) : null; return id ? [id] : [];
    });
    const adversarialResult = { ...parsed.adversarial, evidence_ids: adversarialEvidenceIds };
    await db.from("adversarial_verdict_gates").upsert({
      run_id: runId, emerging_verdict: "Validate First", outcome: adversarialResult.outcome,
      severity: adversarialResult.severity, objection: adversarialResult.objection,
      evidence_ids: adversarialEvidenceIds, unresolved: adversarialResult.outcome === "StrongObjection",
      status: "Complete", payload: adversarialResult,
    }, { onConflict: "run_id" });
    return stageCompleted("analyze_score", { extractedClaims: validClaims.length, coverageGaps: gaps }, {
      evidence_extracted: validClaims.length, duration_ms: Date.now() - startedAt,
    }, { nextInputMeta: { opportunityId, mode, allowedEvidenceIds: evidenceItemIds, adversarialResult } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorClass = /timeout|429|quota|temporar|unavailable|5\d\d|JSON|unterminated|unexpected end/i.test(message) ? "transient" : "permanent";
    return stageFailed(errorClass, `Validation and normalization failed: ${message}`);
  }
}

async function persistArtifacts(db: any, opportunityId: string, parsed: any) {
  for (const competitor of parsed.competitors || []) await db.from("competitors").upsert({ opportunity_id: opportunityId, ...competitor }, { onConflict: "opportunity_id,name" });
  for (const risk of parsed.risks || []) await db.from("risks").upsert({ opportunity_id: opportunityId, ...risk }, { onConflict: "opportunity_id,category,description" });
  await db.from("pricing_models").upsert({ opportunity_id: opportunityId, model: parsed.pricing.model, price_point: parsed.pricing.pricePoint, rationale: parsed.pricing.rationale, first_offer: parsed.pricing.firstOffer, target_customers: Math.max(1, parsed.pricing.targetCustomers) }, { onConflict: "opportunity_id" });
  const { data: mvp } = await db.from("mvp_plans").upsert({ opportunity_id: opportunityId, outcome: parsed.mvp.outcome, build_estimate: parsed.mvp.buildEstimate, build_complexity: parsed.mvp.buildComplexity }, { onConflict: "opportunity_id" }).select("id").single();
  if (mvp) {
    await db.from("mvp_scope_items").delete().eq("mvp_plan_id", mvp.id);
    await db.from("mvp_scope_items").insert([...(parsed.mvp.scope || []).map((description: string) => ({ mvp_plan_id: mvp.id, item_type: "Scope", description })), ...(parsed.mvp.exclusions || []).map((description: string) => ({ mvp_plan_id: mvp.id, item_type: "Exclusion", description }))]);
  }
  const { data: launch } = await db.from("launch_plans").upsert({ opportunity_id: opportunityId, first_customer_channel: parsed.launch.firstCustomerChannel, outreach_message: parsed.launch.outreachMessage, success_metric: parsed.launch.successMetric }, { onConflict: "opportunity_id" }).select("id").single();
  if (launch) {
    await db.from("launch_strategies").delete().eq("launch_plan_id", launch.id);
    await db.from("launch_strategies").insert([...(parsed.launch.weekOne || []).map((description: string) => ({ launch_plan_id: launch.id, strategy_type: "WeekOne", description })), ...(parsed.launch.firstTen || []).map((description: string) => ({ launch_plan_id: launch.id, strategy_type: "FirstTen", description }))]);
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
