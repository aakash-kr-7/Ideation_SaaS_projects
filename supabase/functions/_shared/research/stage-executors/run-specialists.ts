/**
 * Stage: run_specialists
 *
 * Executes specialist agents, independent checkers, and adversarial gate.
 * Reuses the specialist schemas, prompt contracts, and checker comparison
 * logic from the existing reasoning.ts and reasoning-integrity.ts modules.
 */

import type { StageContext, StageResult } from "../stages.ts";
import { stageCompleted, stageFailed } from "../stages.ts";
import { createAnalysisProvider } from "../providers.ts";
import {
  specialistSchemas,
  type SpecialistName,
  adversarialGateSchema,
  independentCheckerSchema,
  assertCitationsBelongToRun,
} from "../reasoning.ts";
import { compareSpecialistAndChecker } from "../reasoning-integrity.ts";
import { callProvider, costBudgetForRun, updateState, logError, wait } from "../pipeline-utils.ts";
import { hasTimeBudget, hasCostBudget } from "../job-queue.ts";
import { getEnv } from "../providers.ts";

/** Specialist prompt builder — extracted from pipeline.ts specialistPrompt/specialistContract. */
function specialistPrompt(
  name: SpecialistName,
  structured: any,
  allowedIds: string[],
): { system: string; user: string } {
  const idList = allowedIds.join(", ");
  const evidenceSummary = (structured.evidence || [])
    .filter((e: any) => allowedIds.includes(e.id))
    .map((e: any) => `[${e.id}] ${e.signal_type}/${e.strength}: ${e.snippet?.slice(0, 200)}`)
    .join("\n");

  const system = `You are the ${name} specialist for startup idea validation. Analyze ONLY the evidence provided. Every claim must cite evidence_ids from this set: [${idList}]. Return JSON matching the ${name} schema.`;
  const user = `Idea: ${structured.opportunity?.name}\nCustomer: ${structured.opportunity?.target_customer}\nPain: ${structured.opportunity?.core_pain}\n\nEvidence:\n${evidenceSummary}\n\nCompetitors: ${JSON.stringify(structured.competitors?.slice(0, 3))}\nRisks: ${JSON.stringify(structured.risks?.slice(0, 3))}`;

  return { system, user };
}

export async function executeRunSpecialists(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, config, startedAt, inputMeta } = ctx;

  // --- Reconstruct context ---
  const opportunityId = inputMeta.opportunityId as string;
  const allowedIds = (inputMeta.allowedEvidenceIds as string[]) || [];

  if (!opportunityId || !allowedIds.length) {
    return stageFailed("permanent", "Missing opportunityId or allowedEvidenceIds from previous stage");
  }

  // --- Load structured context ---
  const { data: opp } = await db.from("opportunities").select("*").eq("id", opportunityId).single();
  const { data: evidence } = await db.from("evidence_items").select("*, sources(url, title)").eq("run_id", runId);
  const { data: competitors } = await db.from("competitors").select("*").eq("opportunity_id", opportunityId);
  const { data: risks } = await db.from("risks").select("*").eq("opportunity_id", opportunityId);

  const structured = {
    opportunity: opp,
    evidence: evidence || [],
    competitors: competitors || [],
    risks: risks || [],
  };

  const allowed = new Set(allowedIds);
  const budget = await costBudgetForRun(runId, db, config);
  const reasoner = createAnalysisProvider();
  const agentPacingMs = Number(getEnv("REASONING_AGENT_PACING_MS") || "8000");

  // --- Run specialist agents ---
  const names = [...config.specialists] as SpecialistName[];
  const specialistOutputs: Record<string, any> = {};
  const checkerComparisons: any[] = [];

  for (let i = 0; i < names.length; i++) {
    const name = names[i];

    if (!hasTimeBudget(startedAt, config.timeLimits.reasoningMs)) {
      await logError(runId, `specialist:${name}`, new Error("Time budget exhausted"), db);
      specialistOutputs[name] = { status: "Incomplete", output: { claims: [], limitations: ["Time budget exhausted"] } };
      continue;
    }

    if (!hasCostBudget(
      budget.spent(),
      config.costLimits.totalUsd,
      config.costLimits.reasoningReserveUsd,
    )) {
      await logError(runId, `specialist:${name}`, new Error("Cost budget exhausted"), db);
      specialistOutputs[name] = { status: "Incomplete", output: { claims: [], limitations: ["Cost budget exhausted"] } };
      continue;
    }

    await updateState(
      runId,
      "Scoring",
      78 + i * 2,
      `Running ${name[0].toUpperCase() + name.slice(1)} specialist`,
      db,
    );

    const schema = specialistSchemas[name];
    const { system, user } = specialistPrompt(name, structured, allowedIds);

    try {
      const result = await callProvider(
        runId, reasoner, `specialist:${name}`, budget, db,
        () => reasoner.generateStructured(system, user, schema),
      );

      assertCitationsBelongToRun(result, allowed);
      specialistOutputs[name] = { status: "Complete", output: result };

      // Persist specialist output
      await db.from("reasoning_agent_outputs").upsert(
        { run_id: runId, agent_name: name, status: "Complete", attempt_count: 1, payload: result },
        { onConflict: "run_id,agent_name" },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await logError(runId, `specialist:${name}`, error, db);
      specialistOutputs[name] = { status: "Incomplete", output: { claims: [], limitations: [message] } };

      await db.from("reasoning_agent_outputs").upsert(
        { run_id: runId, agent_name: name, status: "Incomplete", attempt_count: 1, payload: { error: message } },
        { onConflict: "run_id,agent_name" },
      );
    }

    if (i < names.length - 1 && agentPacingMs > 0) await wait(agentPacingMs);
  }

  // --- Run independent checkers ---
  if (config.checkers.length > 0) {
    await updateState(runId, "Scoring", 86, "Running independent checks", db);

    for (const name of config.checkers as SpecialistName[]) {
      if (!hasTimeBudget(startedAt, config.timeLimits.reasoningMs, 30_000)) break;
      if (!hasCostBudget(
        budget.spent(),
        config.costLimits.totalUsd,
        config.costLimits.reasoningReserveUsd,
      )) break;

      const { system, user } = specialistPrompt(name, structured, allowedIds);
      let checkerResult: any = null;

      try {
        const result = await callProvider(
          runId, reasoner, `checker:${name}`, budget, db,
          () => reasoner.generateStructured(
            system.replace("specialist", "independent checker"),
            user,
            independentCheckerSchema,
          ),
        );
        assertCitationsBelongToRun(result, allowed);
        checkerResult = { status: "Complete", output: result };
      } catch (error) {
        await logError(runId, `checker:${name}`, error, db);
        checkerResult = { status: "Incomplete", output: null };
      }

      const comparison = compareSpecialistAndChecker(
        name,
        specialistOutputs[name],
        checkerResult,
      );
      checkerComparisons.push(comparison);

      // Persist checker result
      await db.from("specialist_checks").upsert(
        {
          run_id: runId,
          specialist_name: name,
          status: checkerResult?.status || "Incomplete",
          attempt_count: 1,
          specialist_direction: comparison.specialistDirection,
          checker_direction: comparison.checkerDirection,
          disputed: comparison.disputed,
          dispute_reason: comparison.reason,
          checker_payload: checkerResult?.output || {},
        },
        { onConflict: "run_id,specialist_name" },
      );
    }
  }

  // --- Run adversarial gate ---
  let adversarialResult: any = {
    outcome: "InsufficientEvidence",
    severity: "None",
    objection: "Not run in this mode",
    evidence_ids: [],
    unresolved: false,
    status: "Incomplete",
  };

  if (
    config.useAdversarialGate &&
    hasTimeBudget(startedAt, config.timeLimits.reasoningMs, 20_000) &&
    hasCostBudget(
      budget.spent(),
      config.costLimits.totalUsd,
      config.costLimits.reasoningReserveUsd,
    )
  ) {
    await updateState(runId, "Scoring", 88, "Running adversarial verdict gate", db);

    try {
      const result = await callProvider(
        runId, reasoner, "adversarial_gate", budget, db,
        () => reasoner.generateStructured(
          `You are an adversarial examiner. Look for the strongest objection against this opportunity. Return JSON with outcome, severity, objection, and evidence_ids.`,
          JSON.stringify({ opportunity: opp, evidence: evidence?.filter((e: any) => allowedIds.includes(e.id)).slice(0, 20) }),
          adversarialGateSchema,
        ),
      );

      assertCitationsBelongToRun(result, allowed);
      adversarialResult = { ...result, unresolved: result.outcome === "StrongObjection", status: "Complete" };
    } catch (error) {
      await logError(runId, "adversarial_gate", error, db);
    }

    // Persist adversarial gate result
    await db.from("adversarial_verdict_gates").upsert(
      {
        run_id: runId,
        emerging_verdict: "Validate First", // Placeholder — will be updated by scoring
        outcome: adversarialResult.outcome,
        severity: adversarialResult.severity,
        objection: adversarialResult.objection,
        evidence_ids: adversarialResult.evidence_ids || [],
        unresolved: adversarialResult.unresolved,
        status: adversarialResult.status,
        payload: adversarialResult,
      },
      { onConflict: "run_id" },
    );
  }

  return stageCompleted(
    "compute_scoring",
    {
      specialistOutputs: Object.keys(specialistOutputs),
      checkerComparisons: checkerComparisons.length,
      adversarialGateRun: adversarialResult.status === "Complete",
    },
    { duration_ms: Date.now() - startedAt },
    {
      nextInputMeta: {
        opportunityId,
        allowedEvidenceIds: allowedIds,
        adversarialResult,
        checkerComparisons,
      },
    },
  );
}
