export const OUTCOME_CHECKPOINT_DAYS = [30, 90, 180] as const;
export type OutcomeCheckpointDay = typeof OUTCOME_CHECKPOINT_DAYS[number];

export interface FounderOutcomeCheckpoint {
  checkpointDay: OutcomeCheckpointDay;
  checkpointDueAt: string;
  interviewsCompleted: number | null;
  paidCommitments: number | null;
  mvpLaunched: boolean | null;
  firstRevenue: boolean | null;
  retainedCustomers: number | null;
  declaredMilestoneReached: boolean | null;
  ideaAbandoned: boolean | null;
  abandonmentReason: string | null;
}

export const OUTCOME_SCORING_POLICY = {
  affectsOfficialScore: false,
  purpose:
    "Opt-in historical calibration only. Founder outcomes do not alter the current official score.",
} as const;

export function buildOutcomeCheckpointSchedule(
  reportCreatedAt: string,
): FounderOutcomeCheckpoint[] {
  const createdAt = new Date(reportCreatedAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new Error("A valid report creation date is required.");
  }
  return OUTCOME_CHECKPOINT_DAYS.map((checkpointDay) => ({
    checkpointDay,
    checkpointDueAt: new Date(
      createdAt.getTime() + checkpointDay * 86_400_000,
    ).toISOString(),
    interviewsCompleted: null,
    paidCommitments: null,
    mvpLaunched: null,
    firstRevenue: null,
    retainedCustomers: null,
    declaredMilestoneReached: null,
    ideaAbandoned: null,
    abandonmentReason: null,
  }));
}

export function validateOutcomeCheckpoint(
  checkpoint: FounderOutcomeCheckpoint,
) {
  for (
    const [field, value] of [
      ["interviewsCompleted", checkpoint.interviewsCompleted],
      ["paidCommitments", checkpoint.paidCommitments],
      ["retainedCustomers", checkpoint.retainedCustomers],
    ] as const
  ) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      throw new Error(`${field} must be a non-negative integer or null.`);
    }
  }
  if (
    checkpoint.ideaAbandoned === true &&
    !checkpoint.abandonmentReason?.trim()
  ) {
    throw new Error("An abandonment reason is required when an idea is abandoned.");
  }
  return {
    ...checkpoint,
    abandonmentReason: checkpoint.abandonmentReason?.trim() || null,
  };
}
