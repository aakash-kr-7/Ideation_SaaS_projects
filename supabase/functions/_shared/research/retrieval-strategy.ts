import type { ResearchRequest } from "./types.ts";
import type { EvidenceSufficiencyRules } from "./mode-config.ts";

export type EvidenceFamily = "problem" | "solution";
export type ResearchPass = 1 | 2 | 3;
export type SourceTier = 1 | 2 | 3 | 4;

export interface PlannedQuery {
  family: EvidenceFamily;
  query: string;
  objective: "broad" | "targeted" | "disconfirming" | "market-sizing";
  triggeredByEvidenceIds: string[];
}

export interface RetrievalEvidence {
  id?: string;
  evidence_family: EvidenceFamily;
  research_pass: ResearchPass;
  source_tier: SourceTier;
  excluded: boolean;
  signal_type: "Pain" | "Demand" | "Pricing" | "Risk";
  snippet: string;
  source_id?: string | null;
  source_domain?: string | null;
  author?: string | null;
  independent_source_count?: number;
  independent_domain_count?: number;
  disconfirming?: boolean;
}

export interface SufficiencyResult {
  sufficient: boolean;
  gaps: string[];
  usableEvidence: number;
  problemEvidence: number;
  solutionEvidence: number;
  disconfirmingEvidence: number;
  tierOneEvidence: number;
  tierTwoEvidence: number;
  maxIndependentCorroboration: number;
  disconfirmationAttempted: boolean;
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const quoted = (value: string) => `"${clean(value).replaceAll('"', "")}"`;
const PROBLEM_STOPWORDS = new Set([
  "about",
  "across",
  "and",
  "after",
  "are",
  "before",
  "being",
  "build",
  "building",
  "could",
  "from",
  "for",
  "have",
  "into",
  "make",
  "product",
  "solution",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "through",
  "tool",
  "using",
  "with",
  "your",
]);

/** Extract pain-language terms without leaking the proposed product name. */
export function buildProblemKeywords(input: ResearchRequest): string[] {
  const ideaTokens = new Set(
    clean(input.ideaName).toLowerCase().match(/[a-z0-9]+/g) || [],
  );
  const tokens =
    clean(input.ideaDescription).toLowerCase().match(/[a-z0-9][a-z0-9'-]+/g) ||
    [];
  return [
    ...new Set(
      tokens.filter((token) =>
        token.length >= 3 && !PROBLEM_STOPWORDS.has(token) &&
        !ideaTokens.has(token)
      ),
    ),
  ].slice(0, 9);
}

/** Deterministic query families: every run starts with both demand and supply. */
export function buildBroadQueries(input: ResearchRequest): PlannedQuery[] {
  const problemKeywords = buildProblemKeywords(input);
  const pain = problemKeywords.join(" ") ||
    clean(input.ideaDescription).slice(0, 160);
  const painAlternatives = problemKeywords.slice(0, 5).join(" OR ") ||
    quoted(pain);
  const customer = clean(input.targetCustomer);
  const idea = clean(input.ideaName);
  const region = clean(input.targetRegion);
  return [
    {
      family: "problem",
      objective: "broad",
      query: `${
        quoted(customer)
      } (${painAlternatives}) frustrating OR annoying OR workaround`,
      triggeredByEvidenceIds: [],
    },
    {
      family: "problem",
      objective: "broad",
      query: `site:reddit.com ${
        quoted(customer)
      } (${painAlternatives}) "how do I" OR "is there a tool" OR help`,
      triggeredByEvidenceIds: [],
    },
    {
      family: "problem",
      objective: "broad",
      query: `(site:news.ycombinator.com OR site:x.com OR site:twitter.com) ${
        quoted(pain)
      } workaround OR annoying OR manual`,
      triggeredByEvidenceIds: [],
    },
    {
      family: "solution",
      objective: "broad",
      query: `${quoted(idea)} software tools competitors pricing`,
      triggeredByEvidenceIds: [],
    },
    {
      family: "solution",
      objective: "broad",
      query: `${quoted(idea)} alternatives reviews G2 Capterra`,
      triggeredByEvidenceIds: [],
    },
    {
      family: "solution",
      objective: "market-sizing",
      query: `${quoted(idea)} ${
        quoted(region)
      } market size industry report revenue funding`,
      triggeredByEvidenceIds: [],
    },
  ];
}

export interface FollowUpSeed {
  entity: string;
  evidenceIds: string[];
  family: EvidenceFamily;
  painLanguage?: string;
  seedType: "entity" | "pain";
}

export function deriveFollowUpSeeds(
  evidence: Array<
    {
      id: string;
      evidence_family: EvidenceFamily;
      named_entities?: string[];
      pain_point?: string;
    }
  >,
): FollowUpSeed[] {
  const grouped = new Map<string, FollowUpSeed & { mentions: number }>();
  const painGroups = new Map<string, FollowUpSeed & { mentions: number }>();
  for (const item of evidence) {
    for (const raw of item.named_entities || []) {
      const entity = clean(raw);
      if (entity.length < 2 || entity.length > 80) continue;
      const key = entity.toLowerCase();
      const current = grouped.get(key) ||
        {
          entity,
          evidenceIds: [],
          family: item.evidence_family,
          painLanguage: item.pain_point,
          seedType: "entity" as const,
          mentions: 0,
        };
      current.mentions++;
      current.evidenceIds.push(item.id);
      if (!current.painLanguage && item.pain_point) {
        current.painLanguage = item.pain_point;
      }
      grouped.set(key, current);
    }
    const painLanguage = clean(item.pain_point || "");
    if (painLanguage.length >= 4) {
      const key = painLanguage.toLowerCase();
      const current = painGroups.get(key) || {
        entity: painLanguage,
        evidenceIds: [],
        family: "problem" as const,
        painLanguage,
        seedType: "pain" as const,
        mentions: 0,
      };
      current.mentions++;
      current.evidenceIds.push(item.id);
      painGroups.set(key, current);
    }
  }
  const recurringPain = [...painGroups.values()].filter((seed) =>
    seed.mentions >= 2
  );
  return [...grouped.values(), ...recurringPain]
    .sort((a, b) => b.mentions - a.mentions || a.entity.localeCompare(b.entity))
    .map(({ mentions: _mentions, ...seed }) => ({
      ...seed,
      evidenceIds: [...new Set(seed.evidenceIds)],
    }));
}

export function clusterBySimilarity<
  T extends RetrievalEvidence & { pain_point?: string },
>(
  items: T[],
  vectors: number[][],
  similarity: (a: number[], b: number[]) => number,
  threshold = .78,
) {
  const clusters: number[][] = [];
  for (let i = 0; i < items.length; i++) {
    let target = -1;
    let best = threshold;
    for (let c = 0; c < clusters.length; c++) {
      const score = Math.max(
        ...clusters[c].map((j) => similarity(vectors[i], vectors[j])),
      );
      if (score > best) {
        best = score;
        target = c;
      }
    }
    if (target < 0) clusters.push([i]);
    else clusters[target].push(i);
  }
  return clusters.flatMap((members, clusterIndex) => {
    const sourceKeys = new Set(
      members.map((i) => items[i].source_id).filter(Boolean),
    );
    const domains = new Set(
      members.map((i) => items[i].source_domain).filter(Boolean),
    );
    const independentIdentities = new Set(
      members.map((i) =>
        items[i].author
          ? `author:${String(items[i].author).toLowerCase()}`
          : `domain:${items[i].source_domain || items[i].source_id || i}`
      ),
    );
    // A repeated author or anonymous content on the same domain counts once.
    const independent = Math.min(
      sourceKeys.size || members.length,
      domains.size || members.length,
      independentIdentities.size,
    );
    return members.map((i) => ({
      ...items[i],
      cluster_key: `semantic-${clusterIndex + 1}`,
      supporting_count: members.length,
      independent_source_count: independent,
      independent_domain_count: domains.size,
    }));
  });
}

export function buildTargetedQueries(seeds: FollowUpSeed[]): PlannedQuery[] {
  const out: PlannedQuery[] = [];
  for (const seed of seeds.slice(0, 3)) {
    const entity = quoted(seed.entity);
    if (seed.seedType === "entity") {
      out.push({
        family: "solution",
        objective: "targeted",
        query:
          `${entity} reviews complaints pricing expensive churn alternative`,
        triggeredByEvidenceIds: seed.evidenceIds,
      });
      out.push({
        family: seed.family,
        objective: "targeted",
        query: `${entity} ${
          quoted(seed.painLanguage || "customer problem workaround")
        } site:reddit.com OR site:news.ycombinator.com`,
        triggeredByEvidenceIds: seed.evidenceIds,
      });
    } else {
      out.push({
        family: "problem",
        objective: "targeted",
        query:
          `${entity} workaround failed tried hours cost site:reddit.com OR site:news.ycombinator.com`,
        triggeredByEvidenceIds: seed.evidenceIds,
      });
      out.push({
        family: "problem",
        objective: "targeted",
        query: `${entity} "how do you" OR "how are you" OR "is there a tool"`,
        triggeredByEvidenceIds: seed.evidenceIds,
      });
    }
  }
  return dedupeQueries(out).slice(0, 6);
}

export function buildAdversarialQueries(
  input: ResearchRequest,
  seeds: FollowUpSeed[],
): PlannedQuery[] {
  const subject = quoted(clean(input.ideaName));
  const entities = seeds.filter((s) => s.seedType === "entity").slice(0, 2).map(
    (s) => quoted(s.entity),
  );
  const triggers = [...new Set(seeds.flatMap((s) => s.evidenceIds))];
  const querySubjects = entities.length ? entities : [subject];
  return dedupeQueries([
    ...querySubjects.flatMap((entity) => [
      {
        family: "solution" as const,
        objective: "disconfirming" as const,
        query: `${entity} failed OR shut down OR discontinued OR pivoted`,
        triggeredByEvidenceIds: triggers,
      },
      {
        family: "solution" as const,
        objective: "disconfirming" as const,
        query: `${entity} market saturated category leader funding revenue`,
        triggeredByEvidenceIds: triggers,
      },
    ]),
    {
      family: "problem",
      objective: "disconfirming",
      query: `${subject} not a problem unnecessary "good enough" workaround`,
      triggeredByEvidenceIds: triggers,
    },
    {
      family: "problem",
      objective: "disconfirming",
      query:
        `${subject} "would not pay" OR "not worth paying" OR solved manually`,
      triggeredByEvidenceIds: triggers,
    },
  ]).slice(0, 6);
}

export function buildEscalationQueries(
  input: ResearchRequest,
  gaps: string[],
  seeds: FollowUpSeed[],
): PlannedQuery[] {
  const queries: PlannedQuery[] = [];
  const subject = quoted(clean(input.ideaName));
  const triggers = [...new Set(seeds.flatMap((s) => s.evidenceIds))];
  if (gaps.some((g) => g.includes("problem-space"))) {
    queries.push({
      family: "problem",
      objective: "targeted",
      query:
        `site:reddit.com OR site:news.ycombinator.com ${subject} pain workaround hours cost`,
      triggeredByEvidenceIds: triggers,
    });
  }
  if (
    gaps.some((g) =>
      g.includes("solution-space") || g.includes("willingness-to-pay")
    )
  ) {
    queries.push({
      family: "solution",
      objective: "targeted",
      query: `${subject} pricing paid plan revenue verified reviews`,
      triggeredByEvidenceIds: triggers,
    });
  }
  if (
    gaps.some((g) =>
      g.includes("disconfirming") || g.includes("disconfirmation")
    )
  ) {
    queries.push(...buildAdversarialQueries(input, seeds).slice(0, 1));
  }
  if (gaps.some((g) => g.includes("corroboration"))) {
    queries.push({
      family: "problem",
      objective: "targeted",
      query: `${subject} exact problem forum complaints workflow`,
      triggeredByEvidenceIds: seeds.flatMap((s) => s.evidenceIds),
    });
  }
  return dedupeQueries(queries).slice(0, 3);
}

function dedupeQueries(queries: PlannedQuery[]) {
  const seen = new Set<string>();
  return queries.filter((q) => {
    const key = q.query.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const FARM_HOSTS = [
  "medium.com",
  "linkedin.com/pulse",
  "ezinearticles.com",
  "articlesfactory.com",
];
const PROMOTIONAL =
  /we (help|offer|provide)|our (platform|solution|product)|book a demo|start (a )?free trial|industry.leading/i;
const LISTICLE = /\b(top|best)\s+\d+\b|\d+\s+(best|tools|ways|solutions)\b/i;
const AI_LISTICLE =
  /\bin today'?s (fast-paced|digital) world\b|\bdelve into\b|\brevolutioni[sz]e your\b|\bcomprehensive guide\b/i;
const WTP =
  /\$\s?\d|pricing|paid plan|per (user|seat|month|year)|revenue|arr\b|funding|series [a-f]|i(?:'d| would) pay/i;
const REVIEW = /g2\.com|capterra\.com|trustradius\.com|getapp\.com/i;
const VERIFIED_REVIEW =
  /verified (purchaser|buyer|review|reviewer)|validated reviewer/i;
const COMMUNITY =
  /reddit\.com|news\.ycombinator\.com|stackoverflow\.com|forum|community|discord/i;
const SPECIFICITY =
  /\b(hours?|days?|weekly|monthly|manual|spreadsheet|workaround|cost|lost|failed|tried)\b|\$\s?\d/i;
const QUALIFIED_DATA_DOMAIN =
  /(^|\.)(census\.gov|bls\.gov|data\.gov|worldbank\.org|oecd\.org|europa\.eu|statista\.com|gartner\.com|forrester\.com)$/i;
const QUALIFIED_RESEARCH_DOMAIN =
  /(^|\.)(ibisworld\.com|pitchbook\.com|cbinsights\.com|grandviewresearch\.com)$/i;
const MARKET_CONTEXT =
  /market size|total addressable market|serviceable (available|addressable|obtainable) market|industry report|analyst estimate/i;
const COMMERCIAL_DISCLOSURE =
  /annual recurring revenue|\barr\b|revenue (of|reached|grew)|raised \$|funding round|series [a-f]/i;
const MARKET_FIGURE =
  /(?:[$€£]\s*)?\d[\d,.]*\s*(?:thousand|million|billion|trillion|k\b|m\b|bn\b|users?|businesses|companies|households|seats|accounts)/i;

export function isVerifiableMarketSizeFigure(value: string | null | undefined) {
  return !!value && MARKET_FIGURE.test(value);
}

/** A cited number is accepted only when the source class can legitimately support it. */
export function classifyMarketSizeSource(
  url: string,
  title: string,
  text: string,
) {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch {
      return "";
    }
  })();
  const sample = `${title} ${text.slice(0, 8000)}`;
  if (
    FARM_HOSTS.some((farm) => host.includes(farm)) || LISTICLE.test(title) ||
    AI_LISTICLE.test(sample)
  ) {
    return {
      qualified: false,
      reason: "SEO/listicle content is not a qualified market-size source.",
    };
  }
  if (
    QUALIFIED_DATA_DOMAIN.test(host) &&
    (MARKET_CONTEXT.test(sample) || MARKET_FIGURE.test(sample))
  ) {
    return {
      qualified: true,
      reason:
        "Government, statistical, or named analyst source with a cited market figure.",
    };
  }
  if (COMMERCIAL_DISCLOSURE.test(sample) && MARKET_FIGURE.test(sample)) {
    return {
      qualified: true,
      reason:
        "Named competitor funding or revenue disclosure with a concrete figure.",
    };
  }
  if (
    QUALIFIED_RESEARCH_DOMAIN.test(host) && MARKET_CONTEXT.test(sample) &&
    MARKET_FIGURE.test(sample) && /report|research|survey|estimate/i.test(sample)
  ) {
    return {
      qualified: true,
      reason:
        "Named industry research or analyst estimate with a concrete figure.",
    };
  }
  return {
    qualified: false,
    reason:
      "No qualified statistical, analyst, industry-report, or company-disclosure basis was found.",
  };
}

/** Conservative deterministic tiering. Tier 4 is excluded from verdict evidence. */
export function classifySourceTier(
  url: string,
  title: string,
  text: string,
  family: EvidenceFamily,
) {
  const haystack = `${url} ${title} ${text.slice(0, 6000)}`;
  const host = (() => {
    try {
      return new URL(url).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  if (
    FARM_HOSTS.some((farm) => haystack.toLowerCase().includes(farm)) ||
    LISTICLE.test(title) || AI_LISTICLE.test(text) ||
    (PROMOTIONAL.test(text) && family === "problem")
  ) {
    return {
      tier: 4 as const,
      excluded: true,
      reason:
        "SEO/listicle or vendor-promotional content cannot anchor a verdict.",
    };
  }
  const verifiedReview = REVIEW.test(url) && VERIFIED_REVIEW.test(text);
  if (
    WTP.test(haystack) &&
    (/\/pricing(?:\/|\?|$)/i.test(url) || verifiedReview ||
      COMMERCIAL_DISCLOSURE.test(text) || /i(?:'d| would) pay/i.test(text))
  ) {
    return {
      tier: 1 as const,
      excluded: false,
      reason:
        "Concrete willingness-to-pay, paid competitor, pricing, revenue, funding, or verified-review signal.",
    };
  }
  if (
    (COMMUNITY.test(host) || COMMUNITY.test(haystack)) && SPECIFICITY.test(text)
  ) {
    return {
      tier: 2 as const,
      excluded: false,
      reason: "Unprompted specific pain or workaround from a community source.",
    };
  }
  return {
    tier: 3 as const,
    excluded: false,
    reason:
      "General discussion, analysis, aggregator, or vendor category content.",
  };
}

export function evaluateSufficiency(
  evidence: RetrievalEvidence[],
  context: { attemptedPasses?: ResearchPass[] } = {},
  rules: EvidenceSufficiencyRules = {
    minimumUsableEvidence: 4,
    minimumProblemSources: 2,
    minimumSolutionSources: 2,
    minimumDisconfirmingEvidence: 1,
    requireDisconfirmingAttempt: true,
    requireTierOneEvidence: true,
    requireTierOneOrTwoEvidence: true,
    minimumIndependentCorroboration: 2,
  },
): SufficiencyResult {
  const usable = evidence.filter((e) => !e.excluded);
  const problem = usable.filter((e) => e.evidence_family === "problem");
  const solution = usable.filter((e) => e.evidence_family === "solution");
  const disconfirming = usable.filter((e) => e.disconfirming);
  const problemSources =
    new Set(problem.map((e) => e.source_id).filter(Boolean)).size;
  const solutionSources =
    new Set(solution.map((e) => e.source_id).filter(Boolean)).size;
  const maxCorroboration = problem.filter((e) =>
    e.signal_type === "Pain" || e.signal_type === "Demand"
  ).reduce((max, e) => Math.max(max, e.independent_source_count || 1), 0);
  const disconfirmationAttempted = context.attemptedPasses?.includes(3) ??
    evidence.some((e) => e.research_pass === 3);
  const gaps: string[] = [];
  if (usable.length < rules.minimumUsableEvidence) {
    gaps.push(`fewer than ${rules.minimumUsableEvidence} usable evidence items`);
  }
  if (problemSources < rules.minimumProblemSources) {
    gaps.push("insufficient problem-space evidence from independent sources");
  }
  if (solutionSources < rules.minimumSolutionSources) {
    gaps.push("insufficient solution-space evidence from independent sources");
  }
  if (rules.requireDisconfirmingAttempt && !disconfirmationAttempted) {
    gaps.push("disconfirmation has not yet been attempted");
  }
  if (disconfirming.length < rules.minimumDisconfirmingEvidence) {
    gaps.push("insufficient meaningful disconfirming evidence");
  }
  if (rules.requireTierOneEvidence && !usable.some((e) => e.source_tier === 1)) {
    gaps.push("no willingness-to-pay Tier 1 signal");
  }
  if (rules.requireTierOneOrTwoEvidence && !usable.some((e) => e.source_tier <= 2)) {
    gaps.push("no Tier 1/2 evidence");
  }
  if (maxCorroboration < rules.minimumIndependentCorroboration) {
    gaps.push(
      `no pain cluster corroborated by ${rules.minimumIndependentCorroboration} independent source${rules.minimumIndependentCorroboration === 1 ? "" : "s"}`,
    );
  }
  return {
    sufficient: gaps.length === 0,
    gaps,
    usableEvidence: usable.length,
    problemEvidence: problemSources,
    solutionEvidence: solutionSources,
    disconfirmingEvidence: disconfirming.length,
    tierOneEvidence: usable.filter((e) => e.source_tier === 1).length,
    tierTwoEvidence: usable.filter((e) => e.source_tier === 2).length,
    maxIndependentCorroboration: maxCorroboration,
    disconfirmationAttempted,
  };
}
