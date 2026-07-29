import {
  FULL_VALIDATION_PACKS,
  type TestableProposition,
} from "./full-validation-research-strategy.ts";
import type { ResearchPackStatus } from "./quick-scan-reliability.ts";

export async function initializeFullValidationPackStatuses(
  db: any,
  runId: string,
) {
  await db.from("full_validation_research_pack_statuses").upsert(
    FULL_VALIDATION_PACKS.map((packKey) => ({
      run_id: runId,
      pack_key: packKey,
      status: "skipped",
      accepted_evidence_count: 0,
      failure_reason: null,
      conditional_trigger: null,
      started_at: null,
      completed_at: null,
      metadata: {},
    })),
    { onConflict: "run_id,pack_key" },
  );
}

export async function persistFullValidationPackStatus(
  db: any,
  input: {
    runId: string;
    packKey: string;
    status: ResearchPackStatus;
    acceptedEvidenceCount?: number;
    failureReason?: string | null;
    conditionalTrigger?: string | null;
    startedAt?: string | null;
    metadata?: Record<string, unknown>;
  },
) {
  await db.from("full_validation_research_pack_statuses").upsert({
    run_id: input.runId,
    pack_key: input.packKey,
    status: input.status,
    accepted_evidence_count: input.acceptedEvidenceCount || 0,
    failure_reason: input.failureReason || null,
    conditional_trigger: input.conditionalTrigger || null,
    started_at: input.startedAt || null,
    completed_at: input.status === "skipped" ? null : new Date().toISOString(),
    metadata: input.metadata || {},
    updated_at: new Date().toISOString(),
  }, { onConflict: "run_id,pack_key" });
}

export async function persistFullValidationPropositions(
  db: any,
  runId: string,
  propositions: TestableProposition[],
) {
  await db.from("research_propositions").upsert(
    propositions.map((proposition) => ({
      run_id: runId,
      proposition_key: proposition.key,
      statement: proposition.statement,
      buyer_segment: proposition.buyerSegment,
      factor_ids: proposition.factorIds,
      primary_pack_key: proposition.primaryPackKey,
      status: "untested",
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "run_id,proposition_key,buyer_segment" },
  );
}
