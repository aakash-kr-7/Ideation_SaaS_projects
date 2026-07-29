import type { CanonicalResearchBrief } from "./research-brief.ts";
import type { ResearchPack } from "./external-retrieval.ts";

export const RESEARCH_REVIEW_BUDGETS = {
  quick_scan: 25,
  full_validation: 75,
} as const;

export const SOURCE_ROUTING_PACK_KEYS = [
  "developer_tools",
  "b2b_saas",
  "consumer_products",
  "local_services",
  "marketplaces",
  "regulated_products",
  "india",
  "united_states",
  "european_union",
] as const;

export type SourceRoutingPackKey = typeof SOURCE_ROUTING_PACK_KEYS[number];

export interface SourceRegistryRoute {
  domain: string;
  evidence_families: string[];
  cannot_establish_claims?: string[];
  markets?: string[];
  industries: string[];
  geographies: string[];
  authority?: number;
  promotional_bias?: "low" | "medium" | "high";
  expected_freshness_days?: number | null;
  access_method?: string;
  retrieval_adapter?: string | null;
  adapter?: string | null;
  query_templates?: Record<string, string> | string[];
  historical_success_rate?: number;
  extraction_attempts?: number;
  extraction_successes?: number;
  last_successful_retrieval?: string | null;
  storage_restrictions?: string | null;
  access_restrictions?: string | null;
  auth_required?: boolean;
  enabled?: boolean;
  routing_pack_keys?: string[];
  quality_tier?: number;
  source_class?: string;
}

export interface RoutedSource {
  domain: string;
  adapter: string;
  score: number;
  reasons: string[];
  supportedEvidenceFamilies: string[];
  prohibitedClaims: string[];
  queryTemplates: string[];
  expectedFreshnessDays: number | null;
  storageRestrictions: string | null;
  accessRestrictions: string | null;
}

export interface EvidenceRoute {
  activePackKeys: SourceRoutingPackKey[];
  sources: RoutedSource[];
  maximumSourcesReviewed: number;
}

const PACK_MATCHERS: Record<SourceRoutingPackKey, RegExp> = {
  developer_tools:
    /\b(?:developer|software|api|sdk|code|devops|security|github)\b/i,
  b2b_saas: /\b(?:b2b|saas|enterprise|business|team|company|procurement)\b/i,
  consumer_products:
    /\b(?:consumer|household|individual|personal|mobile app)\b/i,
  local_services:
    /\b(?:local|neighborhood|home service|restaurant|clinic|salon)\b/i,
  marketplaces:
    /\b(?:marketplace|two-sided|buyers and sellers|supply and demand)\b/i,
  regulated_products:
    /\b(?:regulated|regulation|health|medical|finance|insurance|legal|privacy|biometric)\b/i,
  india: /\b(?:india|indian|inr)\b/i,
  united_states: /\b(?:united states|usa|u\.s\.|usd)\b/i,
  european_union: /\b(?:european union|europe|eu|eur|gdpr)\b/i,
};

export function routeEvidenceSources(
  registry: SourceRegistryRoute[],
  brief: CanonicalResearchBrief,
  researchPacks: ResearchPack[],
): EvidenceRoute {
  const context = [
    brief.exactProductProposition,
    brief.targetBuyer,
    brief.industry,
    brief.businessModel,
    brief.geography,
  ].join(" ");
  const activePackKeys = SOURCE_ROUTING_PACK_KEYS.filter((key) =>
    PACK_MATCHERS[key].test(context)
  );
  const requiredFamilies = new Set(
    researchPacks.flatMap((pack) => [
      pack.key,
      pack.purpose || "",
      ...pack.focus.toLowerCase().split(/[^a-z0-9]+/).filter((item) =>
        item.length > 5
      ),
    ]).filter(Boolean),
  );

  const sources = registry
    .filter((source) =>
      source.enabled !== false &&
      !source.auth_required &&
      !/\b(?:no[_ -]?store|storage prohibited|do not store)\b/i.test(
        source.storage_restrictions || "",
      )
    )
    .map((source) => {
      const supported = source.evidence_families || [];
      const sourcePacks = source.routing_pack_keys || [];
      const packMatches = activePackKeys.filter((key) =>
        sourcePacks.includes(key)
      );
      const familyMatches = supported.filter((family) =>
        [...requiredFamilies].some((required) =>
          normalizedOverlap(family, required)
        )
      );
      const geographyMatches = (source.geographies || []).filter((geography) =>
        normalizedOverlap(geography, brief.geography)
      );
      const marketMatches = (source.markets || []).filter((market) =>
        normalizedOverlap(market, brief.businessModel)
      );
      const industryMatches = (source.industries || []).filter((industry) =>
        normalizedOverlap(industry, brief.industry)
      );
      const historical = historicalExtractionSuccess(source);
      const authority = clamp(
        source.authority ?? authorityFromTier(source.quality_tier),
      );
      const biasPenalty = source.promotional_bias === "high"
        ? 0.12
        : source.promotional_bias === "medium"
        ? 0.05
        : 0;
      const restrictionPenalty = source.access_restrictions ? 0.08 : 0;
      const score = clamp(
        0.2 + authority * 0.28 + historical * 0.22 +
          Math.min(0.18, packMatches.length * 0.06) +
          Math.min(0.08, familyMatches.length * 0.02) +
          (geographyMatches.length ? 0.05 : 0) +
          (marketMatches.length ? 0.05 : 0) +
          (industryMatches.length ? 0.05 : 0) - biasPenalty -
          restrictionPenalty,
      );
      return {
        domain: source.domain,
        adapter: source.retrieval_adapter || source.adapter ||
          source.access_method || "direct_http",
        score,
        reasons: [
          ...packMatches.map((key) => `pack:${key}`),
          ...familyMatches.map((family) => `family:${family}`),
          ...(geographyMatches.length ? ["geography_match"] : []),
          ...(marketMatches.length ? ["market_match"] : []),
          ...(industryMatches.length ? ["industry_match"] : []),
          `historical_extraction_success:${historical.toFixed(2)}`,
        ],
        supportedEvidenceFamilies: supported,
        prohibitedClaims: source.cannot_establish_claims || [],
        queryTemplates: normalizeTemplates(source.query_templates),
        expectedFreshnessDays: source.expected_freshness_days ?? null,
        storageRestrictions: source.storage_restrictions || null,
        accessRestrictions: source.access_restrictions || null,
      };
    })
    .filter((source) =>
      source.reasons.some((reason) =>
        reason.startsWith("pack:") || reason.startsWith("family:")
      )
    )
    .sort((left, right) =>
      right.score - left.score || left.domain.localeCompare(right.domain)
    );

  return {
    activePackKeys,
    sources,
    maximumSourcesReviewed: RESEARCH_REVIEW_BUDGETS.full_validation,
  };
}

export function applyEvidenceRouteToPacks(
  packs: ResearchPack[],
  route: EvidenceRoute,
  brief: CanonicalResearchBrief,
): ResearchPack[] {
  const preferred = route.sources.slice(0, 3);
  if (!preferred.length) return packs;
  return packs.map((pack) => {
    const domainQueries = preferred.map((source) => `site:${source.domain}`);
    const templates = preferred.flatMap((source) =>
      source.queryTemplates.slice(0, 1).map((query) =>
        materializeTemplate(query, source.domain, brief)
      )
    ).slice(0, 2);
    return {
      ...pack,
      query: `${pack.query} ${domainQueries.join(" ")} ${templates.join(" ")}`
        .replace(/\s+/g, " ")
        .trim(),
    };
  });
}

export function historicalExtractionSuccess(source: SourceRegistryRoute) {
  if (
    Number.isFinite(source.extraction_attempts) &&
    Number(source.extraction_attempts) > 0
  ) {
    return clamp(
      Number(source.extraction_successes || 0) /
        Number(source.extraction_attempts),
    );
  }
  return clamp(source.historical_success_rate ?? 0.5);
}

function normalizeTemplates(
  templates: SourceRegistryRoute["query_templates"],
) {
  if (Array.isArray(templates)) return templates.map(String);
  if (templates && typeof templates === "object") {
    return Object.values(templates).map(String);
  }
  return [];
}

function materializeTemplate(
  value: string,
  domain: string,
  brief: CanonicalResearchBrief,
) {
  return value
    .replaceAll("{domain}", domain)
    .replaceAll("{buyer}", brief.targetBuyer)
    .replaceAll("{workflow}", brief.workflowChanged)
    .replaceAll("{category}", brief.directCompetitorCategory)
    .replaceAll("{geography}", brief.geography);
}

function authorityFromTier(tier?: number) {
  if (tier === 1) return 1;
  if (tier === 2) return 0.75;
  if (tier === 3) return 0.5;
  return 0.35;
}

function normalizedOverlap(left: string, right: string) {
  const a = tokens(left);
  const b = tokens(right);
  return [...a].some((token) => b.has(token));
}

function tokens(value: string) {
  return new Set(
    value.toLowerCase().match(/[a-z0-9]{2,}/g) || [],
  );
}

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}
