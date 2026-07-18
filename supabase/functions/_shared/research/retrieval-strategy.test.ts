import {
  buildAdversarialQueries,
  buildBroadQueries,
  buildProblemKeywords,
  buildTargetedQueries,
  classifyMarketSizeSource,
  classifySourceTier,
  clusterBySimilarity,
  deriveFollowUpSeeds,
  evaluateSufficiency,
  isVerifiableMarketSizeFigure,
} from "./retrieval-strategy.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

const idea = {
  ideaName: "Async Client Approval Tracker",
  ideaDescription:
    "Track client feedback and approvals across email and time zones",
  targetCustomer: "boutique creative agencies",
  marketType: "B2B",
  targetRegion: "United States",
  mode: "full_validation" as const,
};

Deno.test("constructs separate broad, evidence-triggered targeted, and adversarial passes", () => {
  const broad = buildBroadQueries(idea);
  assert(broad.some((q) => q.family === "problem"), "missing problem family");
  assert(broad.some((q) => q.family === "solution"), "missing solution family");
  assert(
    broad.some((q) => q.objective === "market-sizing"),
    "missing grounded sizing query",
  );
  assert(
    broad.filter((q) => q.family === "problem").every((q) =>
      !q.query.includes(idea.ideaName)
    ),
    "problem query leaked the solution name",
  );
  assert(
    buildProblemKeywords(idea).includes("feedback"),
    "problem keywords lost concrete pain language",
  );
  const seeds = [{
    entity: "Notion",
    evidenceIds: ["ev-1"],
    family: "problem" as const,
    painLanguage: "approval status gets lost in email",
    seedType: "entity" as const,
  }];
  const targeted = buildTargetedQueries(seeds);
  assert(
    targeted.every((q) => q.triggeredByEvidenceIds.includes("ev-1")),
    "follow-up lost its evidence trigger",
  );
  assert(
    targeted.some((q) => /Notion.*complaints.*pricing/i.test(q.query)),
    "missing entity complaint query",
  );
  assert(
    buildAdversarialQueries(idea, seeds).some((q) =>
      /failed OR shut down/i.test(q.query)
    ),
    "missing failure search",
  );
});

Deno.test("recurring complaint language becomes a first-class Pass 2 causal seed", () => {
  const seeds = deriveFollowUpSeeds([
    {
      id: "ev-1",
      evidence_family: "problem",
      pain_point: "approval status gets lost in email",
    },
    {
      id: "ev-2",
      evidence_family: "problem",
      pain_point: "approval status gets lost in email",
    },
  ]);
  const painSeed = seeds.find((seed) => seed.seedType === "pain");
  assert(!!painSeed, "recurring pain did not create a seed");
  assert(
    painSeed!.evidenceIds.length === 2,
    "pain seed lost its causal evidence chain",
  );
  assert(
    buildTargetedQueries(seeds).every((query) =>
      query.triggeredByEvidenceIds.length === 2
    ),
    "targeted pain query lost trigger ids",
  );
});

Deno.test("tiers willingness-to-pay above specific community pain and excludes listicles", () => {
  assert(
    classifySourceTier(
      "https://vendor.test/pricing",
      "Pricing",
      "Paid plan is $49 per user per month",
      "solution",
    ).tier === 1,
    "pricing page not Tier 1",
  );
  assert(
    classifySourceTier(
      "https://reddit.com/r/agency/x",
      "Approval mess",
      "Every week we lose 3 hours to this manual spreadsheet workaround",
      "problem",
    ).tier === 2,
    "specific pain not Tier 2",
  );
  const farm = classifySourceTier(
    "https://example.test/post",
    "10 Best Approval Tools",
    "Our solution helps every team. Book a demo",
    "problem",
  );
  assert(farm.tier === 4 && farm.excluded, "listicle not excluded");
});

Deno.test("market-size figures require both a qualified source class and a market-sized number", () => {
  const government = classifyMarketSizeSource(
    "https://www.census.gov/data/report",
    "Industry report",
    "The market includes 2.4 million businesses.",
  );
  const vendorBlog = classifyMarketSizeSource(
    "https://vendor.test/blog",
    "Market opportunity",
    "Our platform serves a $5 billion market. Book a demo.",
  );
  assert(government.qualified, "government statistical source was rejected");
  assert(
    !vendorBlog.qualified,
    "unsupported vendor claim qualified as market sizing",
  );
  assert(
    isVerifiableMarketSizeFigure("$2.4 billion"),
    "real market-sized figure was rejected",
  );
  assert(
    !isVerifiableMarketSizeFigure("2024"),
    "a year qualified as a market-size figure",
  );
});

Deno.test("semantic clusters expose independent corroboration to sufficiency", () => {
  const base = [
    {
      id: "p1",
      evidence_family: "problem" as const,
      research_pass: 1 as const,
      source_tier: 2 as const,
      excluded: false,
      signal_type: "Pain" as const,
      snippet: "approvals disappear in email",
      source_id: "s1",
      source_domain: "reddit.com",
      author: "alice",
      pain_point: "approval status loss",
    },
    {
      id: "p2",
      evidence_family: "problem" as const,
      research_pass: 2 as const,
      source_tier: 2 as const,
      excluded: false,
      signal_type: "Pain" as const,
      snippet: "feedback gets lost across inboxes",
      source_id: "s2",
      source_domain: "news.ycombinator.com",
      author: "bob",
      pain_point: "approval status loss",
    },
    {
      id: "s1",
      evidence_family: "solution" as const,
      research_pass: 1 as const,
      source_tier: 1 as const,
      excluded: false,
      signal_type: "Pricing" as const,
      snippet: "$49 paid plan",
      source_id: "s3",
      source_domain: "vendor.test",
      author: null,
      pain_point: "paid competitor",
    },
    {
      id: "s2",
      evidence_family: "solution" as const,
      research_pass: 2 as const,
      source_tier: 3 as const,
      excluded: false,
      signal_type: "Demand" as const,
      snippet: "Notion alternative",
      source_id: "s4",
      source_domain: "g2.com",
      author: "carol",
      pain_point: "incumbent complexity",
    },
    {
      id: "d1",
      evidence_family: "solution" as const,
      research_pass: 3 as const,
      source_tier: 3 as const,
      excluded: false,
      signal_type: "Risk" as const,
      snippet: "category is saturated",
      source_id: "s5",
      source_domain: "analysis.test",
      author: "dan",
      pain_point: "saturation",
      disconfirming: true,
    },
  ];
  const vectors = [[1, 0], [.99, .01], [0, 1], [-1, 0], [0, -1]];
  const cosine = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1];
  const clustered = clusterBySimilarity(base, vectors, cosine);
  const coverage = evaluateSufficiency(clustered);
  assert(
    clustered[0].independent_source_count === 2,
    "corroboration did not count independent sources",
  );
  assert(coverage.sufficient, `unexpected gaps: ${coverage.gaps.join(", ")}`);
  const tierThreeOnly = clustered.map((e) => ({
    ...e,
    source_tier: 3 as const,
  }));
  assert(
    evaluateSufficiency(tierThreeOnly).gaps.some((g) =>
      g.includes("willingness-to-pay")
    ),
    "Tier 3 volume hid missing WTP",
  );
  const sameDomain = clusterBySimilarity(
    [
      {
        ...base[0],
        source_id: "same-1",
        source_domain: "reddit.com",
        author: "alice",
      },
      {
        ...base[1],
        source_id: "same-2",
        source_domain: "reddit.com",
        author: "bob",
      },
    ],
    [[1, 0], [.99, .01]],
    cosine,
  );
  assert(
    sameDomain[0].independent_source_count === 1,
    "two authors on one domain were overcounted as independent sources",
  );
});

Deno.test("sufficiency remains false until solution coverage and disconfirmation attempt exist", () => {
  const passOne = [
    { id: "p1", evidence_family: "problem" as const, research_pass: 1 as const, source_tier: 2 as const, excluded: false, signal_type: "Pain" as const, snippet: "approval status is lost", source_id: "src-p1", source_domain: "reddit.com", author: "alice", independent_source_count: 2 },
    { id: "p2", evidence_family: "problem" as const, research_pass: 1 as const, source_tier: 2 as const, excluded: false, signal_type: "Pain" as const, snippet: "feedback disappears", source_id: "src-p2", source_domain: "news.ycombinator.com", author: "bob", independent_source_count: 2 },
    { id: "s1", evidence_family: "solution" as const, research_pass: 1 as const, source_tier: 1 as const, excluded: false, signal_type: "Pricing" as const, snippet: "$49 per month", source_id: "src-s1", source_domain: "frame.io", author: null },
  ];
  const afterOne = evaluateSufficiency(passOne, { attemptedPasses: [1] });
  assert(afterOne.gaps.some((gap) => gap.includes("solution-space")), "Pass 1 unexpectedly had enough solution coverage");
  assert(afterOne.gaps.some((gap) => gap.includes("disconfirmation")), "Pass 1 hid the missing adversarial attempt");

  const passTwo = [...passOne, { id: "s2", evidence_family: "solution" as const, research_pass: 2 as const, source_tier: 3 as const, excluded: false, signal_type: "Demand" as const, snippet: "teams compare alternatives", source_id: "src-s2", source_domain: "g2.com", author: "carol" }];
  const afterTwo = evaluateSufficiency(passTwo, { attemptedPasses: [1, 2] });
  assert(afterTwo.gaps.every((gap) => gap.includes("disconfirm")), `Pass 2 gaps were not isolated to disconfirmation: ${afterTwo.gaps.join(", ")}`);

  const passThree = [...passTwo, { id: "d1", evidence_family: "solution" as const, research_pass: 3 as const, source_tier: 2 as const, excluded: false, signal_type: "Risk" as const, snippet: "incumbent feature removes the proposed wedge", source_id: "src-d1", source_domain: "incumbent.example", author: null, disconfirming: true }];
  const afterThree = evaluateSufficiency(passThree, { attemptedPasses: [1, 2, 3] });
  assert(afterThree.sufficient, `Pass 3 attempt did not close retrieval coverage: ${afterThree.gaps.join(", ")}`);
});
