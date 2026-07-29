import type { Criterion } from "./scoring-engine.ts";
import { canonicalizeUrl } from "./evidence-boosters.ts";

export const FRESHNESS_POLICY_KEYS = [
  "competitor_pricing_features",
  "regulation",
  "community",
  "official_statistics",
  "foundational_research",
  "default",
] as const;

export type FreshnessPolicyKey = typeof FRESHNESS_POLICY_KEYS[number];
export type FreshnessState =
  | "fresh"
  | "aging"
  | "revalidation_due"
  | "stale"
  | "unknown_date";

export interface EvidenceFreshnessPolicy {
  key: FreshnessPolicyKey;
  label: string;
  maxAgeDays: number;
  revalidationIntervalDays: number;
  agingThreshold: number;
  useExpectedNextRelease: boolean;
  visibleVintage: boolean;
}

export const EVIDENCE_FRESHNESS_POLICIES: Record<
  FreshnessPolicyKey,
  EvidenceFreshnessPolicy
> = {
  competitor_pricing_features: {
    key: "competitor_pricing_features",
    label: "Competitor pricing and features",
    maxAgeDays: 45,
    revalidationIntervalDays: 14,
    agingThreshold: 0.67,
    useExpectedNextRelease: false,
    visibleVintage: true,
  },
  regulation: {
    key: "regulation",
    label: "Regulation and official guidance",
    maxAgeDays: 120,
    revalidationIntervalDays: 30,
    agingThreshold: 0.67,
    useExpectedNextRelease: false,
    visibleVintage: true,
  },
  community: {
    key: "community",
    label: "Community and buyer-voice evidence",
    maxAgeDays: 180,
    revalidationIntervalDays: 60,
    agingThreshold: 0.75,
    useExpectedNextRelease: false,
    visibleVintage: true,
  },
  official_statistics: {
    key: "official_statistics",
    label: "Official statistics",
    maxAgeDays: 450,
    revalidationIntervalDays: 90,
    agingThreshold: 0.8,
    useExpectedNextRelease: true,
    visibleVintage: true,
  },
  foundational_research: {
    key: "foundational_research",
    label: "Foundational research",
    maxAgeDays: 1_825,
    revalidationIntervalDays: 365,
    agingThreshold: 0.8,
    useExpectedNextRelease: false,
    visibleVintage: true,
  },
  default: {
    key: "default",
    label: "General web evidence",
    maxAgeDays: 270,
    revalidationIntervalDays: 90,
    agingThreshold: 0.75,
    useExpectedNextRelease: false,
    visibleVintage: true,
  },
};

const DAY_MS = 86_400_000;

function asDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function iso(value: Date) {
  return value.toISOString();
}

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

function earliest(...values: Array<Date | null>) {
  const present = values.filter((value): value is Date => Boolean(value));
  return present.length
    ? new Date(Math.min(...present.map((value) => value.getTime())))
    : null;
}

export function resolveFreshnessPolicyKey(input: {
  evidenceTopic?: string | null;
  sourceClass?: string | null;
  sourceFamily?: string | null;
  canonicalUrl?: string | null;
}): FreshnessPolicyKey {
  const text = [
    input.evidenceTopic,
    input.sourceClass,
    input.sourceFamily,
    input.canonicalUrl,
  ].filter(Boolean).join(" ").toLowerCase();
  if (/competitor|pricing|price|feature|alternative/.test(text)) {
    return "competitor_pricing_features";
  }
  if (/regulat|legal|law|compliance|guidance|enforcement/.test(text)) {
    return "regulation";
  }
  if (/community|forum|reddit|hacker news|buyer.voice|review/.test(text)) {
    return "community";
  }
  if (/statistic|census|dataset|data.gov|bls.gov|official.metric/.test(text)) {
    return "official_statistics";
  }
  if (/research|study|paper|journal|foundational/.test(text)) {
    return "foundational_research";
  }
  return "default";
}

export interface EvidenceFreshnessInput {
  policyKey: FreshnessPolicyKey;
  publishedOrUpdatedAt: string | null;
  retrievedAt: string;
  expectedNextReleaseAt?: string | null;
  lastMaterialChangeAt?: string | null;
}

export interface EvidenceFreshnessResult {
  policyKey: FreshnessPolicyKey;
  publishedOrUpdatedAt: string | null;
  retrievedAt: string;
  revalidationDueAt: string;
  freshnessState: FreshnessState;
  lastMaterialChangeAt: string | null;
  vintageDays: number | null;
  publicationDateKnown: boolean;
}

export function deriveEvidenceFreshness(
  input: EvidenceFreshnessInput,
  now = new Date(),
): EvidenceFreshnessResult {
  const policy = EVIDENCE_FRESHNESS_POLICIES[input.policyKey];
  const retrievedAt = asDate(input.retrievedAt);
  if (!retrievedAt) throw new Error("A valid retrieved date is required.");
  const publishedAt = asDate(input.publishedOrUpdatedAt);
  const expectedNextRelease = policy.useExpectedNextRelease
    ? asDate(input.expectedNextReleaseAt)
    : null;
  // Retrieval time controls when to check again; it never substitutes for the
  // source's publication/update date when determining evidence vintage.
  const intervalDue = addDays(retrievedAt, policy.revalidationIntervalDays);
  const ageExpiry = publishedAt ? addDays(publishedAt, policy.maxAgeDays) : null;
  const due = earliest(intervalDue, ageExpiry, expectedNextRelease) ?? intervalDue;
  const vintageDays = publishedAt
    ? Math.max(0, Math.floor((now.getTime() - publishedAt.getTime()) / DAY_MS))
    : null;
  let freshnessState: FreshnessState;
  if (!publishedAt) {
    freshnessState = now >= due ? "revalidation_due" : "unknown_date";
  } else if (vintageDays! > policy.maxAgeDays) {
    freshnessState = "stale";
  } else if (now >= due) {
    freshnessState = "revalidation_due";
  } else if (vintageDays! >= policy.maxAgeDays * policy.agingThreshold) {
    freshnessState = "aging";
  } else {
    freshnessState = "fresh";
  }
  return {
    policyKey: policy.key,
    publishedOrUpdatedAt: publishedAt ? publishedAt.toISOString().slice(0, 10) : null,
    retrievedAt: iso(retrievedAt),
    revalidationDueAt: iso(due),
    freshnessState,
    lastMaterialChangeAt: asDate(input.lastMaterialChangeAt)
      ? iso(asDate(input.lastMaterialChangeAt)!)
      : publishedAt
      ? iso(publishedAt)
      : null,
    vintageDays,
    publicationDateKnown: Boolean(publishedAt),
  };
}

export async function sha256Content(value: string): Promise<string> {
  const normalized = value.replace(/\s+/g, " ").trim();
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export interface RefreshTarget {
  sourceId: string;
  canonicalUrl: string;
  cited: boolean;
  decisionCritical: boolean;
  contentHash: string;
  contentHashScope?:
    | "normalized_page_sha256"
    | "accepted_claim_excerpt_sha256"
    | "accepted_excerpt_md5";
  etag?: string | null;
  lastModified?: string | null;
  evidenceFamily: FreshnessPolicyKey;
  claimIds: string[];
  propositionLinks: string[];
  factorLinks: Criterion[];
  previousContent?: string;
  discoveryUrls?: Partial<Record<"sitemap" | "rss" | "changelog", string>>;
}

export function selectRefreshTargets(targets: RefreshTarget[]) {
  const selected = targets.filter((target) =>
    target.cited || target.decisionCritical
  );
  const byUrl = new Map<string, RefreshTarget>();
  for (const target of selected) {
    const existing = byUrl.get(target.canonicalUrl);
    if (!existing) {
      byUrl.set(target.canonicalUrl, {
        ...target,
        claimIds: [...new Set(target.claimIds)].sort(),
        propositionLinks: [...new Set(target.propositionLinks)].sort(),
        factorLinks: [...new Set(target.factorLinks)].sort() as Criterion[],
      });
      continue;
    }
    existing.cited ||= target.cited;
    existing.decisionCritical ||= target.decisionCritical;
    existing.claimIds = [...new Set([...existing.claimIds, ...target.claimIds])]
      .sort();
    existing.propositionLinks = [
      ...new Set([...existing.propositionLinks, ...target.propositionLinks]),
    ].sort();
    existing.factorLinks = [
      ...new Set([...existing.factorLinks, ...target.factorLinks]),
    ].sort() as Criterion[];
  }
  return [...byUrl.values()].sort((left, right) =>
    left.canonicalUrl.localeCompare(right.canonicalUrl)
  );
}

export interface PageCheckResult {
  status: number;
  canonicalUrl: string;
  checkedAt: string;
  content?: string;
  contentHash?: string;
  etag?: string | null;
  lastModified?: string | null;
  publishedOrUpdatedAt?: string | null;
  discoveryMethod?: "conditional_get" | "content_hash" | "sitemap" | "rss" | "changelog";
}

export type RefreshFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

async function fetchWithSafeRedirects(
  fetcher: RefreshFetcher,
  url: string,
  init: RequestInit,
) {
  let current = canonicalizeUrl(url);
  if (!current) throw new Error("Refresh URL is not a public HTTP(S) target.");
  for (let redirects = 0; redirects <= 3; redirects++) {
    const response = await fetcher(current, { ...init, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    current = canonicalizeUrl(new URL(location, current).toString());
    if (!current) {
      throw new Error("Refresh redirect resolved to a non-public target.");
    }
  }
  throw new Error("Refresh target exceeded the redirect limit.");
}

export function deriveDiscoveryUrls(
  canonicalUrl: string,
  family: FreshnessPolicyKey,
): RefreshTarget["discoveryUrls"] {
  const origin = new URL(canonicalUrl).origin;
  return {
    sitemap: `${origin}/sitemap.xml`,
    ...(family === "regulation" || family === "community"
      ? { rss: `${origin}/feed` }
      : {}),
    ...(family === "competitor_pricing_features"
      ? { changelog: `${origin}/changelog` }
      : {}),
  };
}

function pageText(body: string) {
  return body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300_000);
}

export async function checkTargetWithDiscovery(
  target: RefreshTarget,
  checkedAt: string,
  fetcher: RefreshFetcher = fetch,
): Promise<PageCheckResult> {
  let discoveryMethod: PageCheckResult["discoveryMethod"];
  const targetUrl = new URL(target.canonicalUrl);
  const discovery = Object.entries(target.discoveryUrls ?? {}).slice(0, 2) as
    Array<["sitemap" | "rss" | "changelog", string]>;
  for (const [method, url] of discovery) {
    try {
      const response = await fetchWithSafeRedirects(fetcher, url, {
        headers: {
          "User-Agent": "ShouldBuildFreshness/1.0",
          Accept: "application/xml,text/xml,text/html,text/plain",
        },
        signal: AbortSignal.timeout(8_000),
      });
      if (!response.ok) continue;
      const body = (await response.text()).slice(0, 500_000);
      const pathAppears = targetUrl.pathname === "/" ||
        body.includes(targetUrl.pathname) ||
        (method === "changelog" && body.length > 0);
      if (pathAppears) {
        discoveryMethod = method;
        break;
      }
    } catch {
      // Discovery endpoints are optional hints. The cited page remains the
      // authoritative refresh target and is still checked below.
    }
  }
  const page = await checkTargetWithHttpValidators(
    target,
    checkedAt,
    fetcher,
  );
  return discoveryMethod ? { ...page, discoveryMethod } : page;
}

export async function checkTargetWithHttpValidators(
  target: RefreshTarget,
  checkedAt: string,
  fetcher: RefreshFetcher = fetch,
): Promise<PageCheckResult> {
  const headers = new Headers({
    "User-Agent": "ShouldBuildFreshness/1.0",
    Accept: "text/html,text/plain,application/json,application/xml,text/xml",
  });
  if (target.etag) headers.set("If-None-Match", target.etag);
  if (target.lastModified) {
    headers.set("If-Modified-Since", target.lastModified);
  }
  const response = await fetchWithSafeRedirects(fetcher, target.canonicalUrl, {
    headers,
    signal: AbortSignal.timeout(12_000),
  });
  if (response.status === 304) {
    return {
      status: 304,
      canonicalUrl: target.canonicalUrl,
      checkedAt,
      etag: response.headers.get("etag") || target.etag,
      lastModified: response.headers.get("last-modified") || target.lastModified,
      discoveryMethod: "conditional_get",
    };
  }
  if (!response.ok) {
    return {
      status: response.status,
      canonicalUrl: target.canonicalUrl,
      checkedAt,
      discoveryMethod: "conditional_get",
    };
  }
  const content = pageText(await response.text());
  return {
    status: response.status,
    canonicalUrl: response.url || target.canonicalUrl,
    checkedAt,
    content,
    contentHash: await sha256Content(content),
    etag: response.headers.get("etag"),
    lastModified: response.headers.get("last-modified"),
    publishedOrUpdatedAt: response.headers.get("last-modified"),
    discoveryMethod: target.etag || target.lastModified
      ? "conditional_get"
      : "content_hash",
  };
}

export type MaterialChangeKind =
  | "competitor_price_changed"
  | "competitor_feature_removed"
  | "regulation_changed"
  | "material_content_changed";

export function classifyMaterialChange(
  target: RefreshTarget,
  nextContent: string,
): MaterialChangeKind {
  const previous = target.previousContent || "";
  if (target.evidenceFamily === "competitor_pricing_features") {
    const previousPrices = previous.match(/[$€£₹]\s?\d[\d,.]*/g) || [];
    const nextPrices = nextContent.match(/[$€£₹]\s?\d[\d,.]*/g) || [];
    if (previousPrices.join("|") !== nextPrices.join("|")) {
      return "competitor_price_changed";
    }
    const removalLanguage = /\b(?:removed|retired|deprecated|no longer|discontinued)\b/i;
    if (removalLanguage.test(nextContent) || nextContent.length < previous.length * 0.75) {
      return "competitor_feature_removed";
    }
  }
  if (target.evidenceFamily === "regulation") return "regulation_changed";
  return "material_content_changed";
}

export interface AffectedExtraction {
  sourceId: string;
  changedClaimIds: string[];
  removedClaimIds: string[];
  propositionLinks: string[];
  factorLinks: Criterion[];
  explanation: string;
}

export interface RefreshScoreSnapshot {
  score: number;
  verdict: string;
  evidenceConfidence: string;
  independentEvidenceGroups: number;
  factorScores: Partial<Record<Criterion, number>>;
}

export interface ReportDelta {
  currentAsOf: string;
  staleEvidenceWarning: string | null;
  changedSources: Array<{
    sourceId: string;
    canonicalUrl: string;
    changeKind: MaterialChangeKind;
  }>;
  affectedPropositions: string[];
  affectedFactors: Criterion[];
  scoreMovement: {
    previous: number;
    current: number;
    delta: number;
    changed: boolean;
  };
  verdictMovement: {
    previous: string;
    current: string;
    changed: boolean;
  };
  materialChanges: string[];
}

export interface VerificationCardV2 {
  version: 2;
  title: string;
  verdict: string;
  evidenceConfidence: string;
  independentEvidenceGroups: number;
  currentAsOf: string;
  immutableVerificationUrl: string;
  methodologyUrl: string;
  interpretation: "decision_readiness_not_success_probability";
}

export function buildShareableVerificationCard(input: {
  score: number;
  verdict: string;
  evidenceConfidence: string;
  independentEvidenceGroups: number;
  currentAsOf: string;
  immutableVerificationUrl: string;
  methodologyUrl?: string;
}): VerificationCardV2 {
  const score = Math.max(0, Math.min(100, Math.round(input.score * 10) / 10));
  return {
    version: 2,
    title: `ShouldBuild ${score}`,
    verdict: input.verdict,
    evidenceConfidence: input.evidenceConfidence,
    independentEvidenceGroups: Math.max(
      0,
      Math.floor(input.independentEvidenceGroups),
    ),
    currentAsOf: input.currentAsOf.slice(0, 10),
    immutableVerificationUrl: input.immutableVerificationUrl,
    methodologyUrl: input.methodologyUrl ||
      "/methodology/shouldbuild-readiness-score",
    interpretation: "decision_readiness_not_success_probability",
  };
}

export function buildReportDelta(input: {
  previous: RefreshScoreSnapshot;
  current: RefreshScoreSnapshot;
  currentAsOf: string;
  staleEvidenceCount: number;
  changedSources: ReportDelta["changedSources"];
  extractions: AffectedExtraction[];
}): ReportDelta {
  const affectedPropositions = [
    ...new Set(input.extractions.flatMap((item) => item.propositionLinks)),
  ].sort();
  const affectedFactors = [
    ...new Set(input.extractions.flatMap((item) => item.factorLinks)),
  ].sort() as Criterion[];
  const delta = Math.round(
    (input.current.score - input.previous.score) * 10,
  ) / 10;
  return {
    currentAsOf: input.currentAsOf.slice(0, 10),
    staleEvidenceWarning: input.staleEvidenceCount > 0
      ? `${input.staleEvidenceCount} accepted evidence item${
        input.staleEvidenceCount === 1 ? " is" : "s are"
      } stale or due for revalidation.`
      : null,
    changedSources: [...input.changedSources].sort((left, right) =>
      left.canonicalUrl.localeCompare(right.canonicalUrl)
    ),
    affectedPropositions,
    affectedFactors,
    scoreMovement: {
      previous: input.previous.score,
      current: input.current.score,
      delta,
      changed: delta !== 0,
    },
    verdictMovement: {
      previous: input.previous.verdict,
      current: input.current.verdict,
      changed: input.previous.verdict !== input.current.verdict,
    },
    materialChanges: input.extractions.map((item) => item.explanation),
  };
}

export interface LivingReportRefreshInput {
  reportId: string;
  previousVersionId: string;
  previousVersionNumber: number;
  previousPayload: Record<string, unknown>;
  previousScore: RefreshScoreSnapshot;
  targets: RefreshTarget[];
  currentAsOf: string;
  staleEvidenceCount: number;
  immutableVerificationUrlForVersion: (versionId: string) => string;
  nextVersionId: string;
}

export interface LivingReportRefreshDependencies {
  checkPage(target: RefreshTarget): Promise<PageCheckResult>;
  reextractAffectedClaims(
    target: RefreshTarget,
    page: PageCheckResult,
    changeKind: MaterialChangeKind,
  ): Promise<AffectedExtraction>;
  recalculateAffectedFactors(
    affectedFactors: Criterion[],
    extractions: AffectedExtraction[],
  ): Promise<RefreshScoreSnapshot>;
}

export interface LivingReportRefreshResult {
  status: "no_change" | "changed";
  checkedSources: number;
  successfulNoChangeChecks: number;
  llmCallsAvoided: number;
  changedSources: ReportDelta["changedSources"];
  extractions: AffectedExtraction[];
  nextVersion: {
    id: string;
    reportId: string;
    versionNumber: number;
    previousVersionId: string;
    payload: Record<string, unknown>;
    delta: ReportDelta;
    verificationCard: VerificationCardV2;
  } | null;
}

export async function refreshLivingReport(
  input: LivingReportRefreshInput,
  dependencies: LivingReportRefreshDependencies,
): Promise<LivingReportRefreshResult> {
  const targets = selectRefreshTargets(input.targets);
  const changed: Array<{
    target: RefreshTarget;
    page: PageCheckResult;
    kind: MaterialChangeKind;
  }> = [];
  let noChange = 0;
  const pageCheckBatchSize = 5;
  for (let offset = 0; offset < targets.length; offset += pageCheckBatchSize) {
    const checks = await Promise.all(
      targets.slice(offset, offset + pageCheckBatchSize).map(async (target) => {
        const page = await dependencies.checkPage(target);
        const observedHash = page.contentHash ||
          (page.content === undefined
            ? undefined
            : await sha256Content(page.content));
        return { target, page, observedHash };
      }),
    );
    for (const { target, page, observedHash } of checks) {
      // Existing rows begin with a hash of the accepted excerpt. The first
      // successful page retrieval upgrades that baseline without treating the
      // incomparable full-page hash as a material content change.
      const establishingPageBaseline =
        target.contentHashScope !== "normalized_page_sha256";
      const unchanged = page.status === 304 ||
        (Boolean(observedHash) && observedHash === target.contentHash) ||
        establishingPageBaseline;
      if (unchanged) {
        noChange++;
        continue;
      }
      if (!page.content || !observedHash) {
        // A failed or inconclusive retrieval is not evidence of a material change.
        continue;
      }
      changed.push({
        target,
        page: { ...page, contentHash: observedHash },
        kind: classifyMaterialChange(target, page.content),
      });
    }
  }
  if (!changed.length) {
    return {
      status: "no_change",
      checkedSources: targets.length,
      successfulNoChangeChecks: noChange,
      llmCallsAvoided: noChange,
      changedSources: [],
      extractions: [],
      nextVersion: null,
    };
  }
  const extractions: AffectedExtraction[] = [];
  for (const item of changed) {
    extractions.push(
      await dependencies.reextractAffectedClaims(
        item.target,
        item.page,
        item.kind,
      ),
    );
  }
  const affectedFactors = [
    ...new Set(extractions.flatMap((item) => item.factorLinks)),
  ] as Criterion[];
  const currentScore = await dependencies.recalculateAffectedFactors(
    affectedFactors,
    extractions,
  );
  const changedSources = changed.map((item) => ({
    sourceId: item.target.sourceId,
    canonicalUrl: item.target.canonicalUrl,
    changeKind: item.kind,
  }));
  const delta = buildReportDelta({
    previous: input.previousScore,
    current: currentScore,
    currentAsOf: input.currentAsOf,
    staleEvidenceCount: input.staleEvidenceCount,
    changedSources,
    extractions,
  });
  const verificationCard = buildShareableVerificationCard({
    score: currentScore.score,
    verdict: currentScore.verdict,
    evidenceConfidence: currentScore.evidenceConfidence,
    independentEvidenceGroups: currentScore.independentEvidenceGroups,
    currentAsOf: input.currentAsOf,
    immutableVerificationUrl: input.immutableVerificationUrlForVersion(
      input.nextVersionId,
    ),
  });
  const payload = structuredClone(input.previousPayload);
  payload.currentAsOf = input.currentAsOf.slice(0, 10);
  payload.staleEvidenceWarning = delta.staleEvidenceWarning;
  payload.reportDelta = delta;
  payload.verificationCard = verificationCard;
  return {
    status: "changed",
    checkedSources: targets.length,
    successfulNoChangeChecks: noChange,
    llmCallsAvoided: noChange,
    changedSources,
    extractions,
    nextVersion: {
      id: input.nextVersionId,
      reportId: input.reportId,
      versionNumber: input.previousVersionNumber + 1,
      previousVersionId: input.previousVersionId,
      payload,
      delta,
      verificationCard,
    },
  };
}
