import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted, stageFailed } from "../../stages.ts";
import { updateState, costBudgetForRun } from "../../pipeline-utils.ts";
import { canonicalizeUrl } from "../../evidence-boosters.ts";
import { normalizeCurrency, normalizeBillingPeriod, clusterEvidence, evidenceConfidence } from "../../evidence-intelligence.ts";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    claims: { type: "array", minItems: 4, items: { type: "object", properties: {
      sourceId: { type: "string" }, sourceUrl: { type: "string" }, title: { type: "string" }, excerpt: { type: "string" },
      family: { type: "string", enum: ["problem", "solution"] },
      signalType: { type: "string", enum: ["Pain", "Demand", "Pricing", "Risk"] },
      strength: { type: "string", enum: ["High", "Medium", "Low"] },
      disconfirming: { type: "boolean" }, sourceTier: { type: "integer" }, numericValue: { type: "string" },
    }, required: ["sourceId", "sourceUrl", "title", "excerpt", "family", "signalType", "strength", "disconfirming", "sourceTier"] } },
    competitors: { type: "array", items: { type: "object", properties: {
      name: { type: "string" }, positioning: { type: "string" }, pricing: { type: "string" }, target: { type: "string" }, strength: { type: "string" }, gap: { type: "string" }, sourceIds: { type: "array", items: { type: "string" } },
    }, required: ["name", "positioning", "pricing", "target", "strength", "gap", "sourceIds"] } },
    risks: { type: "array", items: { type: "object", properties: {
      category: { type: "string", enum: ["Market", "Execution", "Platform", "Regulatory"] }, severity: { type: "string", enum: ["High", "Medium", "Low"] }, description: { type: "string" }, mitigation: { type: "string" }, sourceIds: { type: "array", items: { type: "string" } },
    }, required: ["category", "severity", "description", "mitigation", "sourceIds"] } },
    pricing: { type: "object", properties: { model: { type: "string" }, pricePoint: { type: "string" }, rationale: { type: "string" }, firstOffer: { type: "string" }, targetCustomers: { type: "integer" }, sourceIds: { type: "array", items: { type: "string" } } }, required: ["model", "pricePoint", "rationale", "firstOffer", "targetCustomers", "sourceIds"] },
    mvp: { type: "object", properties: { outcome: { type: "string" }, buildEstimate: { type: "string" }, buildComplexity: { type: "string", enum: ["Low", "Medium", "High"] }, scope: { type: "array", items: { type: "string" } }, exclusions: { type: "array", items: { type: "string" } } }, required: ["outcome", "buildEstimate", "buildComplexity", "scope", "exclusions"] },
    launch: { type: "object", properties: { firstCustomerChannel: { type: "string" }, outreachMessage: { type: "string" }, successMetric: { type: "string" }, weekOne: { type: "array", items: { type: "string" } }, firstTen: { type: "array", items: { type: "string" } } }, required: ["firstCustomerChannel", "outreachMessage", "successMetric", "weekOne", "firstTen"] },
    adversarial: { type: "object", properties: { outcome: { type: "string", enum: ["StrongObjection", "NoStrongDisproof", "InsufficientEvidence"] }, severity: { type: "string", enum: ["High", "Medium", "Low", "None"] }, objection: { type: "string" }, sourceIds: { type: "array", items: { type: "string" } } }, required: ["outcome", "severity", "objection", "sourceIds"] },
  },
  required: ["claims", "competitors", "risks", "pricing", "mvp", "launch", "adversarial"],
} as const;

const SPECIALIST_NAMES = ["competition", "market", "pricing", "risk", "demand", "gtm"] as const;
const FULL_VALIDATION_RESPONSE_SCHEMA = {
  ...RESPONSE_SCHEMA,
  properties: {
    ...RESPONSE_SCHEMA.properties,
    specialists: { type: "array", minItems: 6, maxItems: 6, items: { type: "object", properties: {
      name: { type: "string", enum: SPECIALIST_NAMES },
      direction: { type: "string", enum: ["SupportsOpportunity", "Mixed", "ChallengesOpportunity", "Insufficient"] },
      assessment: { type: "string" },
      findings: { type: "array", items: { type: "string" } },
      evidenceSourceIds: { type: "array", items: { type: "string" } },
    }, required: ["name", "direction", "assessment", "findings", "evidenceSourceIds"] } },
    targetSegments: { type: "array", items: { type: "object", properties: {
      name: { type: "string" },
      jobsToBeDone: { type: "array", items: { type: "string" } },
      evidenceSourceIds: { type: "array", items: { type: "string" } },
    }, required: ["name", "jobsToBeDone", "evidenceSourceIds"] } },
    willingnessToPay: { type: "object", properties: {
      finding: { type: "string" },
      strength: { type: "string", enum: ["Strong", "Moderate", "Weak", "Insufficient"] },
      evidenceSourceIds: { type: "array", items: { type: "string" } },
    }, required: ["finding", "strength", "evidenceSourceIds"] },
    marketContext: { type: "object", properties: {
      summary: { type: "string" },
      metrics: { type: "array", items: { type: "object", properties: {
        label: { type: "string" }, value: { type: "string" }, sourceId: { type: "string" },
      }, required: ["label", "value", "sourceId"] } },
    }, required: ["summary", "metrics"] },
    gtmFindings: { type: "array", items: { type: "object", properties: {
      finding: { type: "string" },
      evidenceSourceIds: { type: "array", items: { type: "string" } },
    }, required: ["finding", "evidenceSourceIds"] } },
  },
  required: [...RESPONSE_SCHEMA.required, "specialists", "targetSegments", "willingnessToPay", "marketContext", "gtmFindings"],
} as const;

export async function executeHybridValidateNormalize(ctx: StageContext): Promise<StageResult> {
  const { runId, db, config, startedAt, inputMeta } = ctx;
  const opportunityId = String(inputMeta.opportunityId || "");
  const combinedText = String(inputMeta.combinedText || "");
  const mode = String(inputMeta.mode || "quick_scan");
  const catalog = Array.isArray(inputMeta.sourceCatalog) ? inputMeta.sourceCatalog as Array<{ sourceId?: string; url?: string; title?: string; excerpt?: string; sourceTier?: number; domain?: string }> : [];
  if (!opportunityId || !combinedText || !catalog.length) return stageFailed("permanent", "Validation requires an opportunity and directly retrieved attributable source metadata.");

  try {
    await updateState(runId, "Normalizing", 65, "Validating and normalizing attributable evidence", db);
    const allowedSources = new Map<string, { sourceId: string; url: string; title: string; excerpt: string; sourceTier: number; domain: string }>();
    for (const source of catalog) {
      const url = source.url ? canonicalizeUrl(source.url) : null;
      if (url && source.sourceId) allowedSources.set(source.sourceId, {
        sourceId: source.sourceId,
        url,
        title: source.title || new URL(url).hostname,
        excerpt: source.excerpt || "",
        sourceTier: Number(source.sourceTier || 3),
        domain: source.domain || new URL(url).hostname,
      });
    }
    const result = await ctx.dependencies.createGemini().generate({
      runId, taskType: "validate_normalize", budget: await costBudgetForRun(runId, db, config), db,
      systemInstruction: mode === "full_validation"
        ? "Use only the directly retrieved evidence dossier. Every claim, competitor, risk, pricing finding, insight, and each of exactly six specialist assessments must cite SOURCE_ID values from the dossier. Specialists share this dossier and must not search independently. Never claim you searched or opened a page. Preserve weak, negative, contradictory, and insufficient findings as valid outcomes."
        : "Use only the directly retrieved evidence dossier. Every claim, competitor, risk, and pricing finding must cite SOURCE_ID values from the dossier. Never invent a source ID or URL and never claim you searched or opened a page. Include positive and negative findings; weak evidence is a valid outcome.",
      prompt: `Report mode: ${mode}\nAllowed source IDs and canonical URLs:\n${[...allowedSources.values()].map((source) => `${source.sourceId} | ${source.url}`).join("\n")}\n\nRetrieved evidence dossier:\n${combinedText.slice(0, mode === "full_validation" ? 48_000 : 26_000)}`,
      responseSchema: mode === "full_validation" ? FULL_VALIDATION_RESPONSE_SCHEMA : RESPONSE_SCHEMA,
    });
    const parsed = result.parsed as any;
    const validClaims: any[] = [];
    const fingerprints = new Set<string>();
    for (const claim of parsed.claims || []) {
      const source = allowedSources.get(String(claim.sourceId || ""));
      const url = canonicalizeUrl(claim.sourceUrl || "");
      const tier = Number(claim.sourceTier);
      if (!source || !url || url !== source.url || tier !== source.sourceTier || ![1, 2, 3, 4].includes(tier)) continue;
      const fingerprint = await sha256(`${source.sourceId}|${String(claim.title).trim().toLowerCase()}|${String(claim.excerpt).trim().toLowerCase()}`);
      if (fingerprints.has(fingerprint)) continue;
      fingerprints.add(fingerprint);
      let snippet = String(claim.excerpt).trim();
      if (claim.numericValue && claim.signalType === "Pricing") {
        const currency = normalizeCurrency(String(claim.numericValue));
        if (currency) snippet += ` (Normalized: ${currency.currency} ${currency.amount}/${normalizeBillingPeriod(String(claim.numericValue))})`;
      }
      validClaims.push({ ...claim, sourceId: source.sourceId, sourceUrl: url, sourceTier: tier, snippet, fingerprint });
    }
    if (!validClaims.length) return stageFailed("permanent", "Gemini returned no claims attributable to retrieved source IDs.");

    const evidenceItemIds: string[] = [];
    const sourceRecords: Array<{ id: string; url: string; title: string; domain: string; tier: number }> = [];
    for (const claim of validClaims) {
      const sourceMeta = allowedSources.get(claim.sourceId)!;
      sourceRecords.push({ id: sourceMeta.sourceId, url: sourceMeta.url, title: claim.title || sourceMeta.title, domain: sourceMeta.domain, tier: claim.sourceTier });
      const { data: item, error: itemError } = await db.from("evidence_items").upsert({
        run_id: runId, source_id: sourceMeta.sourceId, opportunity_id: opportunityId, title: claim.title,
        snippet: claim.snippet, signal_type: claim.signalType, strength: claim.strength,
        verified: true, evidence_family: claim.family, source_tier: claim.sourceTier,
        source_domain: new URL(claim.sourceUrl).hostname, disconfirming: claim.disconfirming,
        excluded: claim.sourceTier === 4, claim_fingerprint: claim.fingerprint,
      }, { onConflict: "run_id,claim_fingerprint" }).select("id").single();
      if (itemError || !item) throw new Error(`Evidence persistence failed: ${itemError?.message}`);
      evidenceItemIds.push(item.id);
    }
    if (!validClaims.some((claim) => claim.disconfirming)) {
      const citedAdversarialSourceId = (parsed.adversarial?.sourceIds || [])
        .map((value: unknown) => String(value || ""))
        .find((sourceId: string) => allowedSources.has(sourceId));
      const citedCompetitorSourceId = (parsed.competitors || [])
        .flatMap((competitor: any) => competitor.sourceIds || [])
        .map((value: unknown) => String(value || ""))
        .find((sourceId: string) => allowedSources.has(sourceId));
      const adversarialSourceId = citedAdversarialSourceId || citedCompetitorSourceId || [...allowedSources.keys()][0];
      const firstCompetitor = parsed.competitors?.[0];
      const rawObjection = String(parsed.adversarial?.objection || "").trim();
      const objection = (rawObjection && !/^(none|none identified|no strong disproof|insufficient evidence)/i.test(rawObjection) ? rawObjection : "")
        || (firstCompetitor
          ? `Existing alternative ${firstCompetitor.name} already targets ${firstCompetitor.target} with ${firstCompetitor.positioning}; this creates competitive and switching-risk pressure.`
          : "The retrieved dossier did not establish public pricing or willingness-to-pay proof; monetization remains unvalidated.");
      const sourceMeta = adversarialSourceId ? allowedSources.get(adversarialSourceId) : null;
      if (adversarialSourceId && sourceMeta && objection) {
        const fingerprint = await sha256(`${adversarialSourceId}|adversarial|${objection.toLowerCase()}`);
        const strength = parsed.adversarial?.severity === "High" ? "High" : parsed.adversarial?.severity === "Medium" ? "Medium" : "Low";
        const { data: item, error: itemError } = await db.from("evidence_items").upsert({
          run_id: runId,
          source_id: adversarialSourceId,
          opportunity_id: opportunityId,
          title: "Adversarial assessment",
          snippet: objection,
          signal_type: "Risk",
          strength,
          verified: true,
          evidence_family: "solution",
          source_tier: sourceMeta.sourceTier,
          source_domain: sourceMeta.domain,
          disconfirming: true,
          excluded: sourceMeta.sourceTier === 4,
          claim_fingerprint: fingerprint,
        }, { onConflict: "run_id,claim_fingerprint" }).select("id").single();
        if (itemError || !item) throw new Error(`Adversarial evidence persistence failed: ${itemError?.message}`);
        validClaims.push({
          sourceId: adversarialSourceId,
          sourceUrl: sourceMeta.url,
          sourceTier: sourceMeta.sourceTier,
          title: "Adversarial assessment",
          excerpt: objection,
          snippet: objection,
          signalType: "Risk",
          strength,
          family: "solution",
          disconfirming: true,
          fingerprint,
        });
        sourceRecords.push({
          id: adversarialSourceId,
          url: sourceMeta.url,
          title: sourceMeta.title,
          domain: sourceMeta.domain,
          tier: sourceMeta.sourceTier,
        });
        evidenceItemIds.push(item.id);
      }
    }

    const sourceIdToEvidence = new Map(validClaims.map((claim, index) => [claim.sourceId, evidenceItemIds[index]]));
    await persistArtifacts(db, opportunityId, parsed, sourceIdToEvidence);
    const { data: items } = await db.from("evidence_items").select("*").eq("run_id", runId).eq("excluded", false);
    const clusters = clusterEvidence(items || []);
    await db.from("evidence_clusters").delete().eq("run_id", runId);
    for (const cluster of clusters) {
      await db.from("evidence_clusters").insert({
        run_id: runId, opportunity_id: opportunityId, cluster_key: cluster.key, signal_type: cluster.kind,
        representative_claim: cluster.representativeClaim, supporting_evidence_ids: cluster.supportingEvidenceIds,
        contradicting_evidence_ids: cluster.contradictingEvidenceIds, independent_source_count: cluster.independentSourceCount,
        independent_domain_count: cluster.independentDomainCount, tier_distribution: cluster.tierDistribution,
        confidence: cluster.confidence, unresolved_disagreement: cluster.unresolvedDisagreement,
      });
    }
    const confidenceResult = evidenceConfidence(items || [], clusters);
    await db.from("evidence_confidence_results").upsert({
      run_id: runId,
      band: confidenceResult.band,
      score: confidenceResult.score,
      reasons: confidenceResult.reasons,
      updated_at: new Date().toISOString(),
    }, { onConflict: "run_id" });

    // Build the persisted Evidence Graph from attributable source and claim
    // records. Re-execution replaces only this run's derived graph.
    await db.from("evidence_graph_edges").delete().eq("run_id", runId);
    await db.from("evidence_graph_nodes").delete().eq("run_id", runId);
    const { data: opportunityNode, error: opportunityNodeError } = await db.from("evidence_graph_nodes").insert({
      run_id: runId,
      node_type: "opportunity",
      node_key: opportunityId,
      label: "Validated opportunity",
      attributes: { mode },
    }).select("id").single();
    if (opportunityNodeError || !opportunityNode) throw new Error(`Evidence Graph opportunity node failed: ${opportunityNodeError?.message}`);
    for (let index = 0; index < validClaims.length; index++) {
      const claim = validClaims[index];
      const sourceRecord = sourceRecords[index];
      const evidenceId = evidenceItemIds[index];
      const { data: sourceNode, error: sourceNodeError } = await db.from("evidence_graph_nodes").upsert({
        run_id: runId,
        node_type: "source",
        node_key: sourceRecord.id,
        label: sourceRecord.title,
        attributes: { url: sourceRecord.url, domain: sourceRecord.domain, tier: sourceRecord.tier },
      }, { onConflict: "run_id,node_type,node_key" }).select("id").single();
      const { data: claimNode, error: claimNodeError } = await db.from("evidence_graph_nodes").insert({
        run_id: runId,
        node_type: "claim",
        node_key: evidenceId,
        label: claim.title,
        attributes: { signalType: claim.signalType, strength: claim.strength, disconfirming: claim.disconfirming },
      }).select("id").single();
      if (sourceNodeError || claimNodeError || !sourceNode || !claimNode) {
        throw new Error(`Evidence Graph claim linkage failed: ${sourceNodeError?.message || claimNodeError?.message}`);
      }
      await db.from("evidence_graph_edges").insert([
        { run_id: runId, from_node_id: sourceNode.id, to_node_id: claimNode.id, relation: claim.disconfirming ? "contradicts" : "supports", evidence_ids: [evidenceId] },
        { run_id: runId, from_node_id: claimNode.id, to_node_id: opportunityNode.id, relation: "informs", evidence_ids: [evidenceId] },
      ]);
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

    let fullValidationInsights: Record<string, unknown> | undefined;
    if (mode === "full_validation") {
      const specialists = Array.isArray(parsed.specialists) ? parsed.specialists : [];
      const byName = new Map(specialists.map((specialist: any) => [specialist.name, specialist]));
      if (SPECIALIST_NAMES.some((name) => !byName.has(name))) {
        return stageFailed("transient", "Full Validation synthesis omitted one or more required specialist assessments.");
      }
      const mapIds = (ids: unknown) => Array.isArray(ids) ? ids.flatMap((raw) => {
        const sourceId = String(raw || "");
        const source = allowedSources.get(sourceId);
        const evidenceId = sourceIdToEvidence.get(sourceId);
        return source && evidenceId ? [{ sourceId, url: source.url, evidenceId }] : [];
      }) : [];
      for (const name of SPECIALIST_NAMES) {
        const specialist: any = byName.get(name);
        const citations = mapIds(specialist.evidenceSourceIds);
        if (!citations.length) return stageFailed("transient", `The ${name} specialist assessment was not bound to persisted evidence.`);
        const relatedInsights = name === "demand"
          ? { targetSegments: parsed.targetSegments || [], willingnessToPay: parsed.willingnessToPay || null }
          : name === "market"
          ? { marketContext: parsed.marketContext || null }
          : name === "gtm"
          ? { gtmFindings: parsed.gtmFindings || [] }
          : {};
        const { error: specialistError } = await db.from("reasoning_agent_outputs").upsert({
          run_id: runId,
          agent_name: name,
          status: "Complete",
          attempt_count: 1,
          payload: {
            direction: specialist.direction,
            assessment: specialist.assessment,
            findings: specialist.findings || [],
            evidence_urls: citations.map((citation: any) => citation.url),
            evidence_ids: citations.map((citation: any) => citation.evidenceId),
            ...relatedInsights,
          },
        }, { onConflict: "run_id,agent_name" });
        if (specialistError) throw new Error(`Failed to persist ${name} specialist: ${specialistError.message}`);
      }
      const mapInsightUrls = (value: any) => ({
        ...value,
        evidenceIds: mapIds(value?.evidenceSourceIds).map((citation: any) => citation.evidenceId),
      });
      fullValidationInsights = {
        targetSegments: (parsed.targetSegments || []).map(mapInsightUrls),
        willingnessToPay: mapInsightUrls(parsed.willingnessToPay || {}),
        marketContext: {
          summary: parsed.marketContext?.summary || "",
          metrics: (parsed.marketContext?.metrics || []).map((metric: any) => {
            const source = allowedSources.get(String(metric.sourceId || ""));
            const evidenceId = sourceIdToEvidence.get(String(metric.sourceId || ""));
            return { label: metric.label, value: metric.value, sourceUrl: source?.url || null, evidenceId: evidenceId || null };
          }).filter((metric: any) => metric.sourceUrl && metric.evidenceId),
        },
        gtmFindings: (parsed.gtmFindings || []).map(mapInsightUrls),
      };
    }
    const adversarialEvidenceIds = (parsed.adversarial?.sourceIds || [])
      .flatMap((sourceId: string) => sourceIdToEvidence.get(sourceId) ? [sourceIdToEvidence.get(sourceId)] : []);
    const adversarialResult = { ...parsed.adversarial, evidence_ids: adversarialEvidenceIds };
    await db.from("adversarial_verdict_gates").upsert({
      run_id: runId, emerging_verdict: "Validate First", outcome: adversarialResult.outcome,
      severity: adversarialResult.severity, objection: adversarialResult.objection,
      evidence_ids: adversarialEvidenceIds, unresolved: adversarialResult.outcome === "StrongObjection",
      status: "Complete", payload: adversarialResult,
    }, { onConflict: "run_id" });
    return stageCompleted("analyze_score", { extractedClaims: validClaims.length, coverageGaps: gaps, specialistAssessments: mode === "full_validation" ? 6 : 0 }, {
      evidence_extracted: validClaims.length, duration_ms: Date.now() - startedAt,
    }, { nextInputMeta: { opportunityId, mode, allowedEvidenceIds: evidenceItemIds, adversarialResult, fullValidationInsights } });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const errorClass = /timeout|429|quota|temporar|unavailable|5\d\d|JSON|unterminated|unexpected end/i.test(message) ? "transient" : "permanent";
    return stageFailed(errorClass, `Validation and normalization failed: ${message}`);
  }
}

async function persistArtifacts(db: any, opportunityId: string, parsed: any, sourceIdToEvidence: Map<string, string>) {
  const evidenceIds = (ids: unknown) => Array.isArray(ids)
    ? [...new Set(ids.flatMap((id) => sourceIdToEvidence.get(String(id)) ? [sourceIdToEvidence.get(String(id))] : []))]
    : [];
  for (const competitor of parsed.competitors || []) {
    const { sourceIds: cited, ...values } = competitor;
    await db.from("competitors").upsert({ opportunity_id: opportunityId, ...values, evidence_ids: evidenceIds(cited) }, { onConflict: "opportunity_id,name" });
  }
  for (const risk of parsed.risks || []) {
    const { sourceIds: cited, ...values } = risk;
    await db.from("risks").upsert({ opportunity_id: opportunityId, ...values, evidence_ids: evidenceIds(cited) }, { onConflict: "opportunity_id,category,description" });
  }
  await db.from("pricing_models").upsert({
    opportunity_id: opportunityId,
    model: parsed.pricing.model,
    price_point: parsed.pricing.pricePoint,
    rationale: parsed.pricing.rationale,
    first_offer: parsed.pricing.firstOffer,
    target_customers: Math.max(1, parsed.pricing.targetCustomers),
    evidence_ids: evidenceIds(parsed.pricing.sourceIds),
  }, { onConflict: "opportunity_id" });
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
