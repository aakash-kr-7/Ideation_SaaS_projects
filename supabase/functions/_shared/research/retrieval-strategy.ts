import type { ResearchRequest } from "./types.ts";

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
  problemEvidence: number;
  solutionEvidence: number;
  disconfirmingEvidence: number;
  tierOneEvidence: number;
  tierTwoEvidence: number;
  maxIndependentCorroboration: number;
}

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const quoted = (value: string) => `"${clean(value).replaceAll('"', "")}"`;

/** Deterministic query families: every run starts with both demand and supply. */
export function buildBroadQueries(input: ResearchRequest): PlannedQuery[] {
  const pain = clean(input.ideaDescription).slice(0, 160);
  const customer = clean(input.targetCustomer);
  const idea = clean(input.ideaName);
  const region = clean(input.targetRegion);
  return [
    { family: "problem", objective: "broad", query: `${quoted(customer)} ${quoted(pain)} frustrating OR annoying OR workaround`, triggeredByEvidenceIds: [] },
    { family: "problem", objective: "broad", query: `site:reddit.com ${quoted(customer)} ${idea} problem OR help OR "how do you"`, triggeredByEvidenceIds: [] },
    { family: "problem", objective: "broad", query: `(site:news.ycombinator.com OR site:stackoverflow.com) ${quoted(pain)} workaround`, triggeredByEvidenceIds: [] },
    { family: "solution", objective: "broad", query: `${quoted(idea)} software tools competitors pricing`, triggeredByEvidenceIds: [] },
    { family: "solution", objective: "broad", query: `${quoted(idea)} alternatives reviews G2 Capterra`, triggeredByEvidenceIds: [] },
    { family: "solution", objective: "market-sizing", query: `${quoted(idea)} ${quoted(region)} market size industry report revenue funding`, triggeredByEvidenceIds: [] },
  ];
}

export interface FollowUpSeed {
  entity: string;
  evidenceIds: string[];
  family: EvidenceFamily;
  painLanguage?: string;
}

export function deriveFollowUpSeeds(evidence: Array<{ id: string; evidence_family: EvidenceFamily; named_entities?: string[]; pain_point?: string }>): FollowUpSeed[] {
  const grouped = new Map<string, FollowUpSeed & { mentions: number }>();
  for (const item of evidence) {
    for (const raw of item.named_entities || []) {
      const entity = clean(raw);
      if (entity.length < 2 || entity.length > 80) continue;
      const key = entity.toLowerCase();
      const current = grouped.get(key) || { entity, evidenceIds: [], family: item.evidence_family, painLanguage: item.pain_point, mentions: 0 };
      current.mentions++;
      current.evidenceIds.push(item.id);
      if (!current.painLanguage && item.pain_point) current.painLanguage = item.pain_point;
      grouped.set(key, current);
    }
  }
  return [...grouped.values()]
    .sort((a, b) => b.mentions - a.mentions || a.entity.localeCompare(b.entity))
    .map(({ mentions: _mentions, ...seed }) => ({ ...seed, evidenceIds: [...new Set(seed.evidenceIds)] }));
}

export function clusterBySimilarity<T extends RetrievalEvidence & { pain_point?: string }>(items: T[], vectors: number[][], similarity: (a: number[], b: number[]) => number, threshold = .78) {
  const clusters: number[][] = [];
  for (let i = 0; i < items.length; i++) {
    let target = -1;
    let best = threshold;
    for (let c = 0; c < clusters.length; c++) {
      const score = Math.max(...clusters[c].map((j) => similarity(vectors[i], vectors[j])));
      if (score > best) { best = score; target = c; }
    }
    if (target < 0) clusters.push([i]); else clusters[target].push(i);
  }
  return clusters.flatMap((members, clusterIndex) => {
    const sourceKeys = new Set(members.map((i) => items[i].source_id).filter(Boolean));
    const domains = new Set(members.map((i) => items[i].source_domain).filter(Boolean));
    const independentIdentities = new Set(members.map((i) => items[i].author
      ? `author:${String(items[i].author).toLowerCase()}`
      : `domain:${items[i].source_domain || items[i].source_id || i}`));
    // A repeated author or anonymous content on the same domain counts once.
    const independent = Math.min(sourceKeys.size || members.length, independentIdentities.size);
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
    out.push({ family: "solution", objective: "targeted", query: `${entity} reviews complaints pricing expensive churn alternative`, triggeredByEvidenceIds: seed.evidenceIds });
    out.push({ family: seed.family, objective: "targeted", query: `${entity} ${quoted(seed.painLanguage || "customer problem workaround")} site:reddit.com OR site:news.ycombinator.com`, triggeredByEvidenceIds: seed.evidenceIds });
  }
  return dedupeQueries(out).slice(0, 6);
}

export function buildAdversarialQueries(input: ResearchRequest, seeds: FollowUpSeed[]): PlannedQuery[] {
  const subject = quoted(clean(input.ideaName));
  const entities = seeds.slice(0, 2).map((s) => quoted(s.entity));
  const triggers = [...new Set(seeds.flatMap((s) => s.evidenceIds))];
  const querySubjects = entities.length ? entities : [subject];
  return dedupeQueries([
    ...querySubjects.flatMap((entity) => [
      { family: "solution" as const, objective: "disconfirming" as const, query: `${entity} failed OR shut down OR discontinued OR pivoted`, triggeredByEvidenceIds: triggers },
      { family: "solution" as const, objective: "disconfirming" as const, query: `${entity} market saturated category leader funding revenue`, triggeredByEvidenceIds: triggers },
    ]),
    { family: "problem", objective: "disconfirming", query: `${subject} not a problem unnecessary "good enough" workaround`, triggeredByEvidenceIds: triggers },
    { family: "problem", objective: "disconfirming", query: `${subject} "would not pay" OR "not worth paying" OR solved manually`, triggeredByEvidenceIds: triggers },
  ]).slice(0, 6);
}

export function buildEscalationQueries(input: ResearchRequest, gaps: string[], seeds: FollowUpSeed[]): PlannedQuery[] {
  const queries: PlannedQuery[] = [];
  const subject = quoted(clean(input.ideaName));
  const triggers = [...new Set(seeds.flatMap((s) => s.evidenceIds))];
  if (gaps.some((g) => g.includes("problem-space"))) queries.push({ family: "problem", objective: "targeted", query: `site:reddit.com OR site:news.ycombinator.com ${subject} pain workaround hours cost`, triggeredByEvidenceIds: triggers });
  if (gaps.some((g) => g.includes("solution-space") || g.includes("willingness-to-pay"))) queries.push({ family: "solution", objective: "targeted", query: `${subject} pricing paid plan revenue verified reviews`, triggeredByEvidenceIds: triggers });
  if (gaps.some((g) => g.includes("disconfirming"))) queries.push(...buildAdversarialQueries(input, seeds).slice(0, 1));
  if (gaps.some((g) => g.includes("corroboration"))) queries.push({ family: "problem", objective: "targeted", query: `${subject} exact problem forum complaints workflow`, triggeredByEvidenceIds: seeds.flatMap((s) => s.evidenceIds) });
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

const FARM_HOSTS = ["medium.com", "linkedin.com/pulse", "ezinearticles.com", "articlesfactory.com"];
const PROMOTIONAL = /we (help|offer|provide)|our (platform|solution|product)|book a demo|start (a )?free trial|industry.leading/i;
const LISTICLE = /\b(top|best)\s+\d+\b|\d+\s+(best|tools|ways|solutions)\b/i;
const WTP = /\$\s?\d|pricing|paid plan|per (user|seat|month|year)|revenue|arr\b|funding|series [a-f]|i(?:'d| would) pay/i;
const REVIEW = /g2\.com|capterra\.com|trustradius\.com|getapp\.com/i;
const COMMUNITY = /reddit\.com|news\.ycombinator\.com|stackoverflow\.com|forum|community|discord/i;
const SPECIFICITY = /\b(hours?|days?|weekly|monthly|manual|spreadsheet|workaround|cost|lost|failed|tried)\b|\$\s?\d/i;

/** Conservative deterministic tiering. Tier 4 is excluded from verdict evidence. */
export function classifySourceTier(url: string, title: string, text: string, family: EvidenceFamily) {
  const haystack = `${url} ${title} ${text.slice(0, 6000)}`;
  const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } })();
  if (FARM_HOSTS.some((farm) => haystack.toLowerCase().includes(farm)) || LISTICLE.test(title) || (PROMOTIONAL.test(text) && family === "problem")) {
    return { tier: 4 as const, excluded: true, reason: "SEO/listicle or vendor-promotional content cannot anchor a verdict." };
  }
  if (WTP.test(haystack) && (/\/pricing\b/i.test(url) || REVIEW.test(url) || /revenue|arr\b|funding|series [a-f]|i(?:'d| would) pay/i.test(text))) {
    return { tier: 1 as const, excluded: false, reason: "Concrete willingness-to-pay, paid competitor, pricing, revenue, funding, or verified-review signal." };
  }
  if ((COMMUNITY.test(host) || COMMUNITY.test(haystack)) && SPECIFICITY.test(text)) {
    return { tier: 2 as const, excluded: false, reason: "Unprompted specific pain or workaround from a community source." };
  }
  return { tier: 3 as const, excluded: false, reason: "General discussion, analysis, aggregator, or vendor category content." };
}

export function evaluateSufficiency(evidence: RetrievalEvidence[]): SufficiencyResult {
  const usable = evidence.filter((e) => !e.excluded);
  const problem = usable.filter((e) => e.evidence_family === "problem");
  const solution = usable.filter((e) => e.evidence_family === "solution");
  const disconfirming = usable.filter((e) => e.disconfirming);
  const problemSources = new Set(problem.map((e) => e.source_id).filter(Boolean)).size;
  const solutionSources = new Set(solution.map((e) => e.source_id).filter(Boolean)).size;
  const maxCorroboration = problem.filter((e) => e.signal_type === "Pain" || e.signal_type === "Demand").reduce((max, e) => Math.max(max, e.independent_source_count || 1), 0);
  const gaps: string[] = [];
  if (problemSources < 2) gaps.push("insufficient problem-space evidence from independent sources");
  if (solutionSources < 2) gaps.push("insufficient solution-space evidence from independent sources");
  if (!disconfirming.length) gaps.push("no usable disconfirming evidence");
  if (!usable.some((e) => e.source_tier === 1)) gaps.push("no willingness-to-pay Tier 1 signal");
  if (!usable.some((e) => e.source_tier <= 2)) gaps.push("no Tier 1/2 evidence");
  if (maxCorroboration < 2) gaps.push("no pain cluster corroborated by two independent sources");
  return { sufficient: gaps.length === 0, gaps, problemEvidence: problemSources, solutionEvidence: solutionSources, disconfirmingEvidence: disconfirming.length, tierOneEvidence: usable.filter((e) => e.source_tier === 1).length, tierTwoEvidence: usable.filter((e) => e.source_tier === 2).length, maxIndependentCorroboration: maxCorroboration };
}
