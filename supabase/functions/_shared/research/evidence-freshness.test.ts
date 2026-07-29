import {
  buildReportDelta,
  buildShareableVerificationCard,
  checkTargetWithDiscovery,
  deriveDiscoveryUrls,
  deriveEvidenceFreshness,
  refreshLivingReport,
  sha256Content,
  type AffectedExtraction,
  type LivingReportRefreshDependencies,
  type RefreshScoreSnapshot,
  type RefreshTarget,
} from "./evidence-freshness.ts";
import {
  buildOutcomeCheckpointSchedule,
  OUTCOME_SCORING_POLICY,
  validateOutcomeCheckpoint,
} from "./founder-outcomes.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const now = "2026-07-30T00:00:00.000Z";
const previousScore: RefreshScoreSnapshot = {
  score: 68,
  verdict: "Validate First",
  evidenceConfidence: "Moderate",
  independentEvidenceGroups: 6,
  factorScores: { competitionGap: 70, regulatoryRisk: 20 },
};

async function target(
  overrides: Partial<RefreshTarget> = {},
): Promise<RefreshTarget> {
  const previousContent =
    "Pro plan includes audit exports and workflow approvals for $49 monthly.";
  return {
    sourceId: "source-1",
    canonicalUrl: "https://competitor.example/pricing",
    cited: true,
    decisionCritical: true,
    contentHash: await sha256Content(previousContent),
    contentHashScope: "normalized_page_sha256",
    evidenceFamily: "competitor_pricing_features",
    claimIds: ["claim-price", "claim-feature"],
    propositionLinks: ["alternative_inadequacy"],
    factorLinks: ["competitionGap", "willingnessToPay"],
    previousContent,
    ...overrides,
  };
}

function dependencies(input: {
  content: string;
  score?: RefreshScoreSnapshot;
  extraction?: Partial<AffectedExtraction>;
  counters?: { extractions: number; recalculations: number };
}): LivingReportRefreshDependencies {
  return {
    async checkPage(refreshTarget) {
      return {
        status: 200,
        canonicalUrl: refreshTarget.canonicalUrl,
        checkedAt: now,
        content: input.content,
        contentHash: await sha256Content(input.content),
        discoveryMethod: "conditional_get",
      };
    },
    async reextractAffectedClaims(refreshTarget, _page, kind) {
      if (input.counters) input.counters.extractions++;
      return {
        sourceId: refreshTarget.sourceId,
        changedClaimIds: refreshTarget.claimIds,
        removedClaimIds: kind === "competitor_feature_removed"
          ? ["claim-feature"]
          : [],
        propositionLinks: refreshTarget.propositionLinks,
        factorLinks: refreshTarget.factorLinks,
        explanation: input.extraction?.explanation ||
          `Material source change: ${kind}.`,
        ...input.extraction,
      };
    },
    async recalculateAffectedFactors() {
      if (input.counters) input.counters.recalculations++;
      return input.score || previousScore;
    },
  };
}

async function run(
  refreshTarget: RefreshTarget,
  deps: LivingReportRefreshDependencies,
) {
  return await refreshLivingReport({
    reportId: "report-1",
    previousVersionId: "version-1",
    previousVersionNumber: 1,
    previousPayload: { immutable: "original", opportunity: { name: "Test" } },
    previousScore,
    targets: [
      refreshTarget,
      { ...refreshTarget, sourceId: "ignored", cited: false, decisionCritical: false },
    ],
    currentAsOf: now,
    staleEvidenceCount: 0,
    immutableVerificationUrlForVersion: (id) =>
      `https://tryshouldbuild.netlify.app/verify/${id}`,
    nextVersionId: "version-2",
  }, deps);
}

Deno.test("unchanged cited page records no-change without extraction or a new version", async () => {
  const refreshTarget = await target();
  const counters = { extractions: 0, recalculations: 0 };
  const result = await run(
    refreshTarget,
    dependencies({ content: refreshTarget.previousContent!, counters }),
  );
  assert(result.status === "no_change", "unchanged page was treated as changed");
  assert(result.nextVersion === null, "unchanged page created a report version");
  assert(result.successfulNoChangeChecks === 1, "no-change check was not recorded");
  assert(result.llmCallsAvoided === 1, "LLM avoidance was not visible");
  assert(counters.extractions === 0 && counters.recalculations === 0, "unchanged page invoked downstream work");
});

Deno.test("migrated excerpt hashes establish a page baseline without re-extraction", async () => {
  const refreshTarget = await target({
    contentHash: "legacy-excerpt-hash",
    contentHashScope: "accepted_excerpt_md5",
  });
  const counters = { extractions: 0, recalculations: 0 };
  const result = await run(
    refreshTarget,
    dependencies({
      content:
        "A full fetched page whose hash is intentionally incomparable with the migrated excerpt hash.",
      counters,
    }),
  );
  assert(result.status === "no_change", "baseline upgrade was treated as a change");
  assert(result.successfulNoChangeChecks === 1, "baseline success was not recorded");
  assert(result.llmCallsAvoided === 1, "baseline upgrade invoked an LLM");
  assert(
    counters.extractions === 0 && counters.recalculations === 0,
    "baseline upgrade invoked downstream work",
  );
});

Deno.test("changed competitor price re-extracts only linked claims and moves score", async () => {
  const refreshTarget = await target();
  const result = await run(refreshTarget, dependencies({
    content: "Pro plan includes audit exports and workflow approvals for $99 monthly.",
    score: { ...previousScore, score: 64, factorScores: { competitionGap: 58 } },
    extraction: { explanation: "Competitor price increased from $49 to $99." },
  }));
  assert(result.changedSources[0].changeKind === "competitor_price_changed", "price change was not classified");
  assert(result.nextVersion?.delta.scoreMovement.delta === -4, "score delta is wrong");
  assert(result.extractions[0].changedClaimIds.length === 2, "affected claims were not bounded");
});

Deno.test("removed competitor feature is classified and linked to affected factors", async () => {
  const refreshTarget = await target();
  const result = await run(refreshTarget, dependencies({
    content: "Audit exports were removed. Pro plan is $49 monthly.",
  }));
  assert(result.changedSources[0].changeKind === "competitor_feature_removed", "feature removal was not classified");
  assert(result.extractions[0].removedClaimIds.includes("claim-feature"), "removed claim was not captured");
});

Deno.test("new regulation creates a regulation-specific material change", async () => {
  const refreshTarget = await target({
    canonicalUrl: "https://regulator.example/new-rule",
    evidenceFamily: "regulation",
    previousContent: "Draft guidance permits the workflow.",
    contentHash: await sha256Content("Draft guidance permits the workflow."),
    factorLinks: ["regulatoryRisk"],
    propositionLinks: ["delivery_feasibility"],
  });
  const result = await run(refreshTarget, dependencies({
    content: "Final regulation requires prior approval for the workflow.",
    score: { ...previousScore, score: 60, verdict: "Niche Down" },
  }));
  assert(result.changedSources[0].changeKind === "regulation_changed", "regulation change was not classified");
  assert(result.nextVersion?.delta.verdictMovement.changed, "verdict movement was not recorded");
});

Deno.test("stale evidence uses publication vintage and never retrieval date as publication date", () => {
  const stale = deriveEvidenceFreshness({
    policyKey: "competitor_pricing_features",
    publishedOrUpdatedAt: "2026-01-01",
    retrievedAt: "2026-07-29T00:00:00.000Z",
  }, new Date(now));
  assert(stale.freshnessState === "stale", "old publication was made fresh by recent retrieval");
  const unknown = deriveEvidenceFreshness({
    policyKey: "community",
    publishedOrUpdatedAt: null,
    retrievedAt: "2026-07-29T00:00:00.000Z",
  }, new Date(now));
  assert(unknown.freshnessState === "unknown_date", "missing publication date was fabricated");
  assert(unknown.publishedOrUpdatedAt === null, "retrieval date became publication date");
});

Deno.test("report delta records score and verdict movement independently", () => {
  const delta = buildReportDelta({
    previous: previousScore,
    current: { ...previousScore, score: 72, verdict: "Build" },
    currentAsOf: now,
    staleEvidenceCount: 2,
    changedSources: [],
    extractions: [],
  });
  assert(delta.scoreMovement.delta === 4, "score movement is wrong");
  assert(delta.verdictMovement.changed, "verdict movement is missing");
  assert(Boolean(delta.staleEvidenceWarning), "stale warning is missing");
});

Deno.test("material evidence can create a version while official score remains unchanged", async () => {
  const refreshTarget = await target();
  const result = await run(refreshTarget, dependencies({
    content: "Pro plan includes audit exports and workflow approvals for $59 monthly.",
    score: previousScore,
  }));
  assert(result.nextVersion !== null, "material change did not create a version");
  assert(result.nextVersion.delta.scoreMovement.delta === 0, "unchanged score moved");
  assert(!result.nextVersion.delta.scoreMovement.changed, "unchanged score was labeled changed");
});

Deno.test("new report version preserves immutable prior payload and history link", async () => {
  const refreshTarget = await target();
  const original = { immutable: "original", nested: { value: 1 } };
  const result = await refreshLivingReport({
    reportId: "report-1",
    previousVersionId: "version-1",
    previousVersionNumber: 7,
    previousPayload: original,
    previousScore,
    targets: [refreshTarget],
    currentAsOf: now,
    staleEvidenceCount: 0,
    immutableVerificationUrlForVersion: (id) => `/api/verify/${id}`,
    nextVersionId: "version-8",
  }, dependencies({ content: "Pro plan is now $79 monthly." }));
  assert(result.nextVersion?.versionNumber === 8, "version number is not monotonic");
  assert(result.nextVersion?.previousVersionId === "version-1", "history link is missing");
  assert(JSON.stringify(original) === '{"immutable":"original","nested":{"value":1}}', "prior payload was mutated");
});

Deno.test("verification card is accurate and cannot be read as success probability", () => {
  const card = buildShareableVerificationCard({
    score: 68,
    verdict: "Validate First",
    evidenceConfidence: "Moderate",
    independentEvidenceGroups: 6,
    currentAsOf: now,
    immutableVerificationUrl:
      "https://tryshouldbuild.netlify.app/verify/version-1",
  });
  assert(card.title === "ShouldBuild 68", "card identity is wrong");
  assert(card.evidenceConfidence === "Moderate", "confidence is wrong");
  assert(card.independentEvidenceGroups === 6, "independence count is wrong");
  assert(card.interpretation === "decision_readiness_not_success_probability", "probability disclaimer is missing");
});

Deno.test("outcome checkpoints are opt-in calibration data and never score inputs", () => {
  const checkpoints = buildOutcomeCheckpointSchedule("2026-07-30T00:00:00.000Z");
  assert(checkpoints.map((item) => item.checkpointDay).join(",") === "30,90,180", "checkpoint schedule is wrong");
  assert(!OUTCOME_SCORING_POLICY.affectsOfficialScore, "outcomes entered official scoring");
  const abandoned = validateOutcomeCheckpoint({
    ...checkpoints[0],
    ideaAbandoned: true,
    abandonmentReason: " No target buyer would commit to an interview. ",
  });
  assert(abandoned.abandonmentReason === "No target buyer would commit to an interview.", "abandonment reason was not normalized");
});

Deno.test("available discovery hints are bounded and never replace the cited page", async () => {
  const refreshTarget = await target({
    canonicalUrl: "https://competitor.example/pricing",
    evidenceFamily: "competitor_pricing_features",
    discoveryUrls: deriveDiscoveryUrls(
      "https://competitor.example/pricing",
      "competitor_pricing_features",
    ),
  });
  const requested: string[] = [];
  const checked = await checkTargetWithDiscovery(
    refreshTarget,
    now,
    async (input) => {
      const url = String(input);
      requested.push(url);
      if (url.endsWith("/sitemap.xml")) {
        return new Response(
          "<urlset><url><loc>https://competitor.example/pricing</loc></url></urlset>",
          { status: 200 },
        );
      }
      if (url.endsWith("/pricing")) {
        return new Response(refreshTarget.previousContent, {
          status: 200,
          headers: { ETag: '"pricing-v1"' },
        });
      }
      return new Response("", { status: 404 });
    },
  );
  assert(checked.discoveryMethod === "sitemap", "sitemap hint was not recorded");
  assert(requested.at(-1)?.endsWith("/pricing"), "cited page was not checked");
  assert(requested.length <= 3, "discovery probing was not bounded");
});

Deno.test("living refresh rejects private-network targets and redirects", async () => {
  const privateTarget = await target({
    canonicalUrl: "http://127.0.0.1/admin",
    discoveryUrls: {},
  });
  let blocked = false;
  try {
    await checkTargetWithDiscovery(privateTarget, now, fetch);
  } catch {
    blocked = true;
  }
  assert(blocked, "private-network refresh target was allowed");

  const redirectTarget = await target({
    canonicalUrl: "https://competitor.example/pricing",
    discoveryUrls: {},
  });
  blocked = false;
  try {
    await checkTargetWithDiscovery(redirectTarget, now, async () =>
      new Response("", {
        status: 302,
        headers: { Location: "http://169.254.169.254/latest/meta-data" },
      }));
  } catch {
    blocked = true;
  }
  assert(blocked, "private-network redirect was allowed");
});
