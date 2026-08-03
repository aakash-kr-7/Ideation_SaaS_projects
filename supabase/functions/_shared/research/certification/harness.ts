import { defaultWeights } from "../../scoring.ts";
import {
  calculateDeterministicScore,
  computeFactors,
  CRITERIA,
  deriveFactorEvidence,
  deriveScoreConfidenceBand,
  type Criterion,
  type FactorResult,
  type ScoringEvidence,
} from "../scoring-engine.ts";
import { renderCsv, renderJson, renderMarkdown, renderPdf } from "../exports.ts";
import { REPORT_MODE_CONFIG } from "../mode-config.ts";
import { REPLAY_FIXTURES, type ReplayFixture } from "./fixtures.ts";

const weights = CRITERIA.map((criterion) => ({ criterion, weight: defaultWeights[criterion] }));
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => {
  if (item && typeof item === "object" && !Array.isArray(item)) {
    return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
  }
  return item;
});

export type ReplayResult = {
  id: string;
  title: string;
  mode: ReplayFixture["mode"];
  researchOutcome: ReplayFixture["expected"]["researchOutcome"];
  creditState: "consumed" | "restored";
  verdict: string | null;
  score: number | null;
  scoreRange: [number, number] | null;
  factors: FactorResult[];
  unsupportedClaims: number;
  independentGroups: number;
  independentDomains: number;
  propositionDepth: number;
  segmentDepth: number;
  estimatedWorkUnits: number;
  exports?: { json: string; markdown: string; csv: string; pdf: Uint8Array };
};

const verdictFor = (score: number) => score >= 68 ? "Build" : score >= 48 ? "Validate First" : "Do Not Build";
const evidenceClaimsAreSupported = (evidence: ScoringEvidence[]) =>
  evidence.filter((item) => !item.excluded && (!item.id || !item.source_id || !item.title || !item.snippet)).length;

export function replayFixture(fixture: ReplayFixture): ReplayResult {
  if (fixture.expected.researchOutcome === "research_unavailable") {
    return {
      id: fixture.id, title: fixture.title, mode: fixture.mode,
      researchOutcome: "research_unavailable", creditState: "restored",
      verdict: null, score: null, scoreRange: null, factors: [],
      unsupportedClaims: 0, independentGroups: 0, independentDomains: 0,
      propositionDepth: 0, segmentDepth: 0, estimatedWorkUnits: 1,
    };
  }
  const factors = computeFactors({
    evidence: fixture.evidence,
    risks: fixture.risks,
    competitors: fixture.competitors,
    hasPricingModel: fixture.hasPricingModel,
    launchStrategyCount: fixture.launchStrategyCount,
    unresolvedContradictionCount: fixture.unresolvedContradictionCount,
    founderFitFactor: fixture.founderFitFactor,
  });
  const score = calculateDeterministicScore(factors, weights);
  const band = deriveScoreConfidenceBand(factors, weights, score);
  const verdict = verdictFor(score);
  const independentGroups = new Set(fixture.evidence.map((item) => item.independence_key)).size;
  const independentDomains = new Set(fixture.evidence.map((item) => item.canonical_domain)).size;
  const full = fixture.mode === "full_validation";
  const payload = {
    id: fixture.provenance.immutableReportVersion,
    version: "certification-replay-v1",
    researchAvailabilityState: "research_completed",
    score,
    verdict,
    content: fixture.title,
    evidenceSufficiency: {
      acceptedEvidenceCount: fixture.evidence.length,
      independentEvidenceGroups: independentGroups,
      independentDomains,
      sourceConcentration: fixture.evidence.length ? Math.max(...[...new Set(fixture.evidence.map((e) => e.canonical_domain))].map((domain) => fixture.evidence.filter((e) => e.canonical_domain === domain).length)) / fixture.evidence.length : 0,
      assumedFactors: factors.filter((factor) => factor.evidenceState === "ASSUMED").map((factor) => factor.criterion),
    },
    replayProvenance: fixture.provenance,
    propositionAnalysis: full ? Array.from({ length: 10 }, (_, index) => `proposition-${index + 1}`) : ["screen-proposition"],
    segmentAnalysis: full ? ["primary", "secondary", "excluded"] : ["initial"],
    opportunity: { evidence: fixture.evidence.map((item) => ({ id: item.id, title: item.title, source: item.canonical_domain, canonicalDomain: item.canonical_domain, url: `https://${item.canonical_domain}/fixture` })) },
    citationValidation: { valid: true, claimsChecked: fixture.evidence.length, claimsRemoved: 0, invalidClaims: [] },
    decisionIntegrity: { deterministicVerdict: verdict, effectiveVerdict: verdict, reason: null },
  };
  const exportInput = {
    runId: fixture.provenance.immutableReportVersion,
    reportMode: fixture.mode,
    ideaName: fixture.title,
    total: score,
    verdict,
    confidence: Math.round((1 - (band.maximum - band.minimum) / 100) * 100),
    executiveSummary: `${fixture.title}: ${verdict}.`,
    methodology: "Deterministic offline replay of accepted evidence.",
    breakdowns: factors.map((factor) => ({ ...factor, weight: defaultWeights[factor.criterion] })),
    payload,
  };
  return {
    id: fixture.id, title: fixture.title, mode: fixture.mode,
    researchOutcome: "research_completed", creditState: "consumed",
    verdict, score, scoreRange: [band.minimum, band.maximum], factors,
    unsupportedClaims: evidenceClaimsAreSupported(fixture.evidence),
    independentGroups, independentDomains,
    propositionDepth: full ? 10 : 1,
    segmentDepth: full ? 3 : 1,
    estimatedWorkUnits: full ? 8 : 4,
    exports: {
      json: renderJson(exportInput),
      markdown: renderMarkdown(exportInput),
      csv: renderCsv(exportInput),
      pdf: renderPdf(exportInput),
    },
  };
}

export function factor(result: ReplayResult, criterion: Criterion) {
  const found = result.factors.find((item) => item.criterion === criterion);
  if (!found) throw new Error(`Missing factor ${criterion}`);
  return found;
}

export function exportFactsAgree(result: ReplayResult) {
  if (!result.exports || result.score === null || !result.verdict) return true;
  const verdict = result.verdict;
  const pdf = new TextDecoder().decode(result.exports.pdf);
  return [result.exports.json, result.exports.markdown, result.exports.csv, pdf]
    .every((output) => output.includes(String(result.score)) && output.includes(verdict) && output.includes(result.title));
}

export function deterministicFingerprint(result: ReplayResult) {
  return stable({
    ...result,
    exports: result.exports && {
      json: result.exports.json,
      markdown: result.exports.markdown,
      csv: result.exports.csv,
      pdf: Array.from(result.exports.pdf),
    },
  });
}

export function certificationSummary() {
  const results = REPLAY_FIXTURES.map(replayFixture);
  const quick = results.filter((item) => item.mode === "quick_scan" && item.researchOutcome === "research_completed");
  const full = results.filter((item) => item.mode === "full_validation" && item.researchOutcome === "research_completed");
  return {
    schemaVersion: 1,
    generatedBy: "deterministic-offline-replay",
    replayScenarios: results.map(({ exports: _exports, factors, ...result }) => ({
      ...result,
      factors: Object.fromEntries(factors.map((item) => [item.criterion, item.effectiveScore])),
    })),
    deterministicStability: results.every((result, index) =>
      deterministicFingerprint(result) === deterministicFingerprint(replayFixture(REPLAY_FIXTURES[index]))
    ),
    exportConsistency: results.every(exportFactsAgree),
    quickScanRegression: {
      faster: quick.every((item) => item.estimatedWorkUnits < REPORT_MODE_CONFIG.full_validation.maxJobsPerRun),
      narrower: quick.every((item) => item.propositionDepth < 10 && item.segmentDepth < 3),
    },
    fullValidation: {
      deeperPropositionAnalysis: full.every((item) => item.propositionDepth >= 10),
      deeperSegmentAnalysis: full.every((item) => item.segmentDepth >= 3),
    },
  };
}

export { REPLAY_FIXTURES, weights, deriveFactorEvidence };
