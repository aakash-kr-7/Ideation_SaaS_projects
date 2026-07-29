import type { StageContext, StageResult } from "../../stages.ts";
import { stageCompleted, stageFailed } from "../../stages.ts";
import { costBudgetForRun, updateState } from "../../pipeline-utils.ts";
import { canonicalizeUrl } from "../../evidence-boosters.ts";
import {
  clusterEvidence,
  evidenceConfidence,
  normalizeBillingPeriod,
  normalizeCurrency,
} from "../../evidence-intelligence.ts";
import { isDirectWillingnessToPayEvidence } from "../../scoring-engine.ts";
import {
  labelStatistic,
  type NumericClaimType,
  validateNumericClaim,
} from "../../numeric-claims.ts";
import { materializeAcceptedFamilyGaps } from "../../evidence-family-gap.ts";
import {
  assessSemanticRelevance,
  BRIEF_DIMENSIONS,
  type BriefDimension,
  type CanonicalResearchBrief,
} from "../../research-brief.ts";
import { persistResearchCallMetric } from "../../research-call-metrics.ts";
import { classifyWithOptionalGroq } from "../../groq-classifier.ts";
import { researchUnavailableMessage } from "../../quick-scan-reliability.ts";
import {
  evidenceAppliesToProposition,
  type TestableProposition,
} from "../../full-validation-research-strategy.ts";

const EVIDENCE_TOPICS = [
  "customer_pain",
  "behavior_demand",
  "segments",
  "alternatives",
  "competitors",
  "pricing",
  "willingness_to_pay",
  "market_context",
  "gtm",
  "risks",
  "contradiction",
] as const;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    claims: {
      type: "array",
      minItems: 4,
      items: {
        type: "object",
        properties: {
          sourceId: { type: "string" },
          sourceUrl: { type: "string" },
          title: { type: "string" },
          excerpt: { type: "string" },
          family: { type: "string", enum: ["problem", "solution"] },
          signalType: {
            type: "string",
            enum: ["Pain", "Demand", "Pricing", "Risk"],
          },
          strength: { type: "string", enum: ["High", "Medium", "Low"] },
          disconfirming: { type: "boolean" },
          sourceTier: { type: "integer" },
          numericValue: { type: "string" },
          evidenceTopic: { type: "string", enum: EVIDENCE_TOPICS },
          relevanceClassification: {
            type: "string",
            enum: [
              "directly_relevant",
              "contextually_relevant",
              "adjacent",
              "out_of_scope",
            ],
          },
          relevanceScore: { type: "number" },
          matchedBriefDimensions: {
            type: "array",
            items: { type: "string", enum: BRIEF_DIMENSIONS },
          },
          mismatchReasons: { type: "array", items: { type: "string" } },
        },
        required: [
          "sourceId",
          "sourceUrl",
          "title",
          "excerpt",
          "family",
          "signalType",
          "strength",
          "disconfirming",
          "sourceTier",
          "evidenceTopic",
          "relevanceClassification",
          "relevanceScore",
          "matchedBriefDimensions",
          "mismatchReasons",
        ],
      },
    },
    competitors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          positioning: { type: "string" },
          pricing: { type: "string" },
          target: { type: "string" },
          strength: { type: "string" },
          gap: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
          classification: {
            type: "string",
            enum: ["direct", "adjacent", "substitute", "workflow_workaround"],
          },
          comparabilityJustification: { type: "string" },
        },
        required: [
          "name",
          "positioning",
          "pricing",
          "target",
          "strength",
          "gap",
          "sourceIds",
        ],
      },
    },
    risks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["Market", "Execution", "Platform", "Regulatory"],
          },
          severity: { type: "string", enum: ["High", "Medium", "Low"] },
          description: { type: "string" },
          mitigation: { type: "string" },
          sourceIds: { type: "array", items: { type: "string" } },
        },
        required: [
          "category",
          "severity",
          "description",
          "mitigation",
          "sourceIds",
        ],
      },
    },
    pricing: {
      type: "object",
      properties: {
        model: { type: "string" },
        pricePoint: { type: "string" },
        rationale: { type: "string" },
        firstOffer: { type: "string" },
        targetCustomers: { type: "integer" },
        sourceIds: { type: "array", items: { type: "string" } },
      },
      required: [
        "model",
        "pricePoint",
        "rationale",
        "firstOffer",
        "targetCustomers",
        "sourceIds",
      ],
    },
    mvp: {
      type: "object",
      properties: {
        outcome: { type: "string" },
        buildEstimate: { type: "string" },
        buildComplexity: { type: "string", enum: ["Low", "Medium", "High"] },
        scope: { type: "array", items: { type: "string" } },
        exclusions: { type: "array", items: { type: "string" } },
      },
      required: [
        "outcome",
        "buildEstimate",
        "buildComplexity",
        "scope",
        "exclusions",
      ],
    },
    launch: {
      type: "object",
      properties: {
        firstCustomerChannel: { type: "string" },
        outreachMessage: { type: "string" },
        successMetric: { type: "string" },
        weekOne: { type: "array", items: { type: "string" } },
        firstTen: { type: "array", items: { type: "string" } },
      },
      required: [
        "firstCustomerChannel",
        "outreachMessage",
        "successMetric",
        "weekOne",
        "firstTen",
      ],
    },
    adversarial: {
      type: "object",
      properties: {
        outcome: {
          type: "string",
          enum: ["StrongObjection", "NoStrongDisproof", "InsufficientEvidence"],
        },
        severity: { type: "string", enum: ["High", "Medium", "Low", "None"] },
        objection: { type: "string" },
        sourceIds: { type: "array", items: { type: "string" } },
      },
      required: ["outcome", "severity", "objection", "sourceIds"],
    },
    contradictions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          testedClaim: { type: "string" },
          supportingSourceIds: { type: "array", items: { type: "string" } },
          challengingSourceIds: { type: "array", items: { type: "string" } },
          relationship: { type: "string" },
          resolutionStatus: {
            type: "string",
            enum: ["resolved", "unresolved", "segment_specific"],
          },
          resolutionNote: { type: "string" },
        },
        required: [
          "testedClaim",
          "supportingSourceIds",
          "challengingSourceIds",
          "relationship",
          "resolutionStatus",
          "resolutionNote",
        ],
      },
    },
  },
  required: [
    "claims",
    "competitors",
    "risks",
    "pricing",
    "mvp",
    "launch",
    "adversarial",
    "contradictions",
  ],
} as const;

const SPECIALIST_NAMES = [
  "competition",
  "market",
  "pricing",
  "risk",
  "demand",
  "gtm",
] as const;
const FULL_DEPTH_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    specialists: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      items: {
        type: "object",
        properties: {
          name: { type: "string", enum: SPECIALIST_NAMES },
          direction: {
            type: "string",
            enum: [
              "SupportsOpportunity",
              "Mixed",
              "ChallengesOpportunity",
              "Insufficient",
            ],
          },
          assessment: { type: "string" },
          findings: { type: "array", items: { type: "string" } },
          evidenceSourceIds: { type: "array", items: { type: "string" } },
          opposingEvidenceSourceIds: {
            type: "array",
            items: { type: "string" },
          },
          confidence: {
            type: "string",
            enum: ["High", "Moderate", "Low", "Insufficient"],
          },
          relevantBriefDimensions: {
            type: "array",
            items: { type: "string", enum: BRIEF_DIMENSIONS },
          },
          unresolvedGaps: { type: "array", items: { type: "string" } },
        },
        required: [
          "name",
          "direction",
          "assessment",
          "findings",
          "evidenceSourceIds",
          "opposingEvidenceSourceIds",
          "confidence",
          "relevantBriefDimensions",
          "unresolvedGaps",
        ],
      },
    },
    targetSegments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          jobsToBeDone: { type: "array", items: { type: "string" } },
          evidenceSourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["name", "jobsToBeDone", "evidenceSourceIds"],
      },
    },
    willingnessToPay: {
      type: "object",
      properties: {
        finding: { type: "string" },
        strength: {
          type: "string",
          enum: ["Strong", "Moderate", "Weak", "Insufficient"],
        },
        evidenceSourceIds: { type: "array", items: { type: "string" } },
      },
      required: ["finding", "strength", "evidenceSourceIds"],
    },
    marketContext: {
      type: "object",
      properties: {
        summary: { type: "string" },
        metrics: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "string" },
              sourceId: { type: "string" },
            },
            required: ["label", "value", "sourceId"],
          },
        },
      },
      required: ["summary", "metrics"],
    },
    gtmFindings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          finding: { type: "string" },
          evidenceSourceIds: { type: "array", items: { type: "string" } },
        },
        required: ["finding", "evidenceSourceIds"],
      },
    },
  },
  required: [
    "specialists",
    "targetSegments",
    "willingnessToPay",
    "marketContext",
    "gtmFindings",
  ],
} as const;

const FOCUSED_EVIDENCE_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    claims: { ...RESPONSE_SCHEMA.properties.claims, minItems: 4 },
    contradictions: RESPONSE_SCHEMA.properties.contradictions,
  },
  required: ["claims", "contradictions"],
} as const;

const PRICING_VALIDATION_SCHEMA = {
  type: "object",
  properties: {
    findings: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        properties: {
          sourceId: { type: "string" },
          title: { type: "string" },
          exactExcerpt: { type: "string" },
          applicability: { type: "string" },
          relevanceScore: { type: "number" },
          matchedBriefDimensions: {
            type: "array",
            items: { type: "string", enum: BRIEF_DIMENSIONS },
          },
        },
        required: [
          "sourceId",
          "title",
          "exactExcerpt",
          "applicability",
          "relevanceScore",
          "matchedBriefDimensions",
        ],
      },
    },
  },
  required: ["findings"],
} as const;

const CONTRADICTION_VALIDATION_SCHEMA = {
  type: "object",
  properties: {
    pairs: {
      type: "array",
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          testedClaim: { type: "string" },
          supportingSourceId: { type: "string" },
          supportingExcerpt: { type: "string" },
          challengingSourceId: { type: "string" },
          challengingExcerpt: { type: "string" },
          relationship: { type: "string" },
          resolutionStatus: {
            type: "string",
            enum: ["resolved", "unresolved", "segment_specific"],
          },
          resolutionNote: { type: "string" },
        },
        required: [
          "testedClaim",
          "supportingSourceId",
          "supportingExcerpt",
          "challengingSourceId",
          "challengingExcerpt",
          "relationship",
          "resolutionStatus",
          "resolutionNote",
        ],
      },
    },
  },
  required: ["pairs"],
} as const;

export async function executeHybridValidateNormalize(
  ctx: StageContext,
): Promise<StageResult> {
  const { runId, db, config, startedAt, inputMeta } = ctx;
  const opportunityId = String(inputMeta.opportunityId || "");
  const combinedText = String(inputMeta.combinedText || "");
  const mode = String(inputMeta.mode || "quick_scan");
  const researchBrief = inputMeta.researchBrief as
    | CanonicalResearchBrief
    | undefined;
  const catalog = Array.isArray(inputMeta.sourceCatalog)
    ? inputMeta.sourceCatalog as Array<{
      sourceId?: string;
      url?: string;
      title?: string;
      excerpt?: string;
      sourceTier?: number;
      domain?: string;
      publisher?: string;
      sourceClass?: string;
      extractionMethod?: string;
      retrievalDate?: string;
      relevanceScore?: number;
      relevanceClass?: string;
      matchedBriefDimensions?: string[];
      mismatchReasons?: string[];
      acceptanceDecision?: string;
      pageType?: string;
      authorityScore?: number;
      directnessScore?: number;
      promotionalBias?: string;
      sourceTierReason?: string;
      retrievedText?: string;
      queryFamily?: string;
    }>
    : [];
  if (
    !opportunityId || !combinedText || !researchBrief ||
    (!catalog.length && mode === "full_validation")
  ) {
    return stageFailed(
      "permanent",
      "Validation requires an opportunity, canonical research brief, and directly retrieved attributable source metadata.",
    );
  }

  try {
    await updateState(
      runId,
      "Normalizing",
      65,
      "Validating and normalizing attributable evidence",
      db,
    );
    const allowedSources = new Map<string, {
      sourceId: string;
      url: string;
      title: string;
      excerpt: string;
      sourceTier: number;
      domain: string;
      publisher: string;
      sourceClass: string;
      extractionMethod: string;
      retrievalDate: string;
      relevanceScore: number;
      relevanceClass: string;
      matchedBriefDimensions: BriefDimension[];
      mismatchReasons: string[];
      acceptanceDecision: string;
      pageType: string;
      authorityScore: number;
      directnessScore: number;
      promotionalBias: string;
      sourceTierReason: string;
      retrievedText: string;
      queryFamily: string;
    }>();
    for (const source of catalog) {
      const url = source.url ? canonicalizeUrl(source.url) : null;
      if (url && source.sourceId) {
        allowedSources.set(source.sourceId, {
          sourceId: source.sourceId,
          url,
          title: source.title || new URL(url).hostname,
          excerpt: source.excerpt || "",
          sourceTier: Number(source.sourceTier || 3),
          domain: source.domain || new URL(url).hostname,
          publisher: source.publisher || source.domain || new URL(url).hostname,
          sourceClass: source.sourceClass ||
            (Number(source.sourceTier || 3) <= 2 ? "primary" : "secondary"),
          extractionMethod: source.extractionMethod || "direct_http",
          retrievalDate: validRetrievalDate(source.retrievalDate),
          relevanceScore: Number(source.relevanceScore || 0),
          relevanceClass: String(source.relevanceClass || "out_of_scope"),
          matchedBriefDimensions: (source.matchedBriefDimensions || []).filter((
            dimension,
          ): dimension is BriefDimension =>
            BRIEF_DIMENSIONS.includes(dimension as BriefDimension)
          ),
          mismatchReasons: source.mismatchReasons || [],
          acceptanceDecision: String(source.acceptanceDecision || "rejected"),
          pageType: String(source.pageType || "secondary_article"),
          authorityScore: Number(source.authorityScore || 0),
          directnessScore: Number(source.directnessScore || 0),
          promotionalBias: String(source.promotionalBias || "medium"),
          sourceTierReason: String(
            source.sourceTierReason ||
              "No page-level authority reason was recorded.",
          ),
          retrievedText: String(source.retrievedText || source.excerpt || ""),
          queryFamily: String((source as any).queryFamily || ""),
        });
      }
    }
    const gemini = ctx.dependencies.createGemini();
    const budget = await costBudgetForRun(runId, db, config);
    const sourceIndex = [...allowedSources.values()].map((source) =>
      `${source.sourceId} | ${source.url} | ${source.pageType} | tier ${source.sourceTier} | relevance ${source.relevanceScore}`
    ).join("\n");
    const evidenceBoundContext =
      mode === "quick_scan" || mode === "full_validation"
      ? {
        rejectedEvidenceSummary: inputMeta.rejectedEvidenceSummary || {},
        contradictionObjects: inputMeta.contradictionObjects || [],
        validatedPricingObservations:
          inputMeta.validatedPricingObservations || [],
        factorEvidenceStates: inputMeta.factorEvidenceStates || [],
        missingEvidence: inputMeta.missingEvidence || [],
        sourceConcentration: inputMeta.sourceConcentration || null,
        fullValidationCoverage: inputMeta.fullValidationCoverage || null,
        fullConditionalPacks: inputMeta.fullConditionalPacks || [],
      }
      : null;
    const sharedPrompt = `Report mode: ${mode}\nCanonical research brief:\n${
      JSON.stringify(researchBrief)
    }\n\nAllowed source IDs and canonical URLs:\n${sourceIndex}\n\n${
      mode === "full_validation"
        ? "Extract 12 to 18 non-duplicative claims spanning as many evidence topics and independent sources as the dossier supports. Preserve negative results and do not pad unsupported topics.\\n\\n"
        : ""
    }${evidenceBoundContext
      ? `Code-owned research context (descriptive only; do not override evidence gates):\n${
        JSON.stringify(evidenceBoundContext)
      }\n\n`
      : ""}Retrieved evidence dossier:\n${
      combinedText.slice(0, mode === "full_validation" ? 30_000 : 34_000)
    }`;
    const coreResult = await gemini.generate({
      runId,
      taskType: mode === "full_validation"
        ? "validate_normalize_core"
        : "validate_normalize",
      budget,
      db,
      systemInstruction:
        "The canonical research brief is the binding semantic boundary. Synthesize only the accepted evidence explicitly supplied in the prompt; do not search, browse, or rely on outside knowledge. Cross-check every claim against the cited page and brief. Every factual claim, competitor, risk, price, inference, and contradiction must cite SOURCE_ID values or explicitly say Insufficient evidence. A numeric price and plan name must appear in the retrieved page. Public list pricing is not buyer payment evidence. Contradictions must test one exact proposition-specific claim with separate supporting and challenging sources. Unsupported output is a hypothesis, never a finding. Never invent a value or source.",
      prompt: sharedPrompt,
      responseSchema: RESPONSE_SCHEMA,
    });
    if (mode === "quick_scan" || mode === "full_validation") {
      await persistResearchCallMetric(db, {
        runId,
        callPurpose: "evidence_bound_synthesis",
        queryFamily: "validate_normalize",
        grounded: false,
        sourcesDiscovered: allowedSources.size,
        sourcesAccepted: allowedSources.size,
        independentEvidenceGroupsAdded: 0,
        evidenceFamiliesAdded: unique(
          [...allowedSources.values()].map((source) => source.queryFamily),
        ),
        pricingClaimsValidated: Array.isArray(
            inputMeta.validatedPricingObservations,
          )
          ? inputMeta.validatedPricingObservations.length
          : 0,
      });
    }
    let parsed = coreResult.parsed as any;
    if (mode === "full_validation") {
      const focusedSources = [...allowedSources.values()].filter((source) =>
        [
          "official_pricing",
          "official_documentation",
          "official_product",
          "buyer_review",
          "community_discussion",
        ].includes(source.pageType) ||
        /buyer_behavior|buyer_problem|segments|alternatives|competitor|pricing|documentation|reviews|willingness|contradiction|adversarial|case_studies|market_regulatory_gtm|reachability|feasibility/
          .test(source.queryFamily)
      ).slice(0, 24);
      const initiallyCovered = new Set(
        (parsed.claims || []).map((claim: any) => claim.evidenceTopic),
      );
      const targetGaps = EVIDENCE_TOPICS.filter((topic) =>
        !initiallyCovered.has(topic)
      );
      const focusedPrompt = `Canonical research brief:\n${
        JSON.stringify(researchBrief)
      }\n\nOne bounded targeted gap pass. Missing evidence families after the core pass: ${
        targetGaps.join(", ") || "none"
      }. Extract only directly supported, non-duplicative claims that close those gaps, prioritizing primary pages, buyer/payment behaviour, comparable competitors, verified pricing, complaints/failed alternatives, risk, GTM, and proposition-specific contradiction evidence. Competitive availability may challenge a differentiation claim, but broad market facts are not contradictions. Public list price is pricing context, not willingness-to-pay proof. Use exact SOURCE_ID values.\n\n${
        focusedSources.map((source) =>
          `SOURCE_ID: ${source.sourceId}\nQUERY_FAMILY: ${source.queryFamily}\nURL: ${source.url}\nPAGE_TYPE: ${source.pageType}\nTIER: ${source.sourceTier}\nTEXT:\n${
            source.retrievedText.slice(0, 1_350)
          }`
        ).join("\n\n---\n\n")
      }`;
      const focusedResult = await gemini.generate({
        runId,
        taskType: "validate_normalize_targeted_gap_pass",
        budget,
        db,
        systemInstruction:
          "Perform exactly one skeptical, proposition-specific gap pass. Every claim must be supported by cited page text and remain inside the canonical brief. Prefer authoritative primary evidence, direct buyer voice, comparable products, payment behaviour, and meaningful negative evidence. Mark a claim disconfirming only when it challenges the exact proposition in the contradiction object. Omit unsupported families; never pad volume or invent values.",
        prompt: focusedPrompt.slice(0, 30_000),
        responseSchema: FOCUSED_EVIDENCE_RESPONSE_SCHEMA,
      });
      parsed = {
        ...parsed,
        claims: [
          ...(parsed.claims || []),
          ...((focusedResult.parsed as any)?.claims || []),
        ],
        contradictions: [
          ...(parsed.contradictions || []),
          ...((focusedResult.parsed as any)?.contradictions || []),
        ],
      };
      const pricingSources = [...allowedSources.values()].filter((source) =>
        source.pageType === "official_pricing"
      ).slice(0, 6);
      if (pricingSources.length) {
        const pricingResult = await gemini.generate({
          runId,
          taskType: "validate_normalize_pricing",
          budget,
          db,
          systemInstruction:
            "Validate public competitor pricing for the canonical brief. Copy a short exact excerpt that contains the plan, numeric price, currency symbol, and billing period. Do not treat list price as willingness-to-pay proof. Omit any page whose offer is not applicable to client/customer approval for service teams.",
          prompt: `Canonical brief:\n${JSON.stringify(researchBrief)}\n\n${
            pricingSources.map((source) =>
              `SOURCE_ID: ${source.sourceId}\nURL: ${source.url}\nTEXT:\n${
                source.retrievedText.slice(0, 3_000)
              }`
            ).join("\n\n---\n\n")
          }`,
          responseSchema: PRICING_VALIDATION_SCHEMA,
        });
        const pricingFindings = ((pricingResult.parsed as any)?.findings || [])
          .filter((finding: any) => {
            const source = allowedSources.get(String(finding.sourceId || ""));
            const excerptRelevance = assessSemanticRelevance(
              researchBrief,
              `${String(finding.title || "")}\n${
                String(finding.exactExcerpt || "")
              }`,
              "pricing_official",
            );
            return source &&
              source.pageType === "official_pricing" &&
              excerptRelevance.acceptanceDecision === "accepted_core" &&
              claimSupportedByPage(
                String(finding.exactExcerpt || ""),
                source.retrievedText,
              );
          });
        parsed.claims = [
          ...(parsed.claims || []),
          ...pricingFindings.map((finding: any) => {
            const source = allowedSources.get(String(finding.sourceId))!;
            return {
              sourceId: source.sourceId,
              sourceUrl: source.url,
              title: finding.title,
              excerpt: finding.exactExcerpt,
              family: "solution",
              signalType: "Pricing",
              strength: "High",
              disconfirming: false,
              sourceTier: source.sourceTier,
              numericValue: finding.exactExcerpt,
              evidenceTopic: "pricing",
              relevanceClassification:
                Number(finding.relevanceScore || 0) >= 0.72
                  ? "directly_relevant"
                  : "contextually_relevant",
              relevanceScore: finding.relevanceScore,
              matchedBriefDimensions: finding.matchedBriefDimensions,
              mismatchReasons: [],
            };
          }),
        ];
        if (pricingFindings.length) {
          const first = pricingFindings[0];
          parsed.pricing = {
            model: "Published competitor subscription pricing",
            pricePoint: first.exactExcerpt,
            rationale:
              `${first.applicability} This is competitor price context, not willingness-to-pay proof.`,
            firstOffer: parsed.pricing?.firstOffer || "Paid pilot hypothesis",
            targetCustomers: null,
            sourceIds: unique([
              ...(parsed.pricing?.sourceIds || []),
              ...pricingFindings.map((finding: any) => finding.sourceId),
            ]),
          };
        }
      }
      const supportingSources = [...allowedSources.values()].filter((source) =>
        /customer_pain|buyer_behavior/.test(source.queryFamily)
      ).slice(0, 6);
      const challengingSources = [...allowedSources.values()].filter((source) =>
        ["official_product", "official_documentation"].includes(
          source.pageType,
        ) ||
        /competitor_official|alternatives|contradiction/.test(
          source.queryFamily,
        )
      ).slice(0, 8);
      if (supportingSources.length && challengingSources.length) {
        const contradictionResult = await gemini.generate({
          runId,
          taskType: "validate_normalize_contradiction",
          budget,
          db,
          systemInstruction:
            "Find only precise contradictions about the submitted proposition and canonical brief. A valid pair must test one exact proposition-specific claim using one supporting and one challenging source. Existing alternatives may challenge novelty or unmet-need claims only when they serve the same buyer and workflow. Copy source-supported excerpts. Return no pair when the exact relationship is not supported. Never pair unrelated generic market facts.",
          prompt: `Canonical brief:\n${
            JSON.stringify(researchBrief)
          }\n\nSUPPORTING CANDIDATES:\n${
            supportingSources.map((source) =>
              `SOURCE_ID: ${source.sourceId}\n${
                source.retrievedText.slice(0, 1_800)
              }`
            ).join("\n\n")
          }\n\nCHALLENGING CANDIDATES:\n${
            challengingSources.map((source) =>
              `SOURCE_ID: ${source.sourceId}\n${
                source.retrievedText.slice(0, 1_800)
              }`
            ).join("\n\n")
          }`,
          responseSchema: CONTRADICTION_VALIDATION_SCHEMA,
        });
        const pairs = ((contradictionResult.parsed as any)?.pairs || []).filter(
          (pair: any) => {
            const supporting = allowedSources.get(
              String(pair.supportingSourceId || ""),
            );
            const challenging = allowedSources.get(
              String(pair.challengingSourceId || ""),
            );
            return supporting && challenging &&
              claimSupportedByPage(
                String(pair.supportingExcerpt || ""),
                supporting.retrievedText,
              ) &&
              claimSupportedByPage(
                String(pair.challengingExcerpt || ""),
                challenging.retrievedText,
              ) &&
              contradictionExcerptMatchesBrief(
                researchBrief,
                String(pair.testedClaim || ""),
                String(pair.supportingExcerpt || ""),
              ) &&
              contradictionExcerptMatchesBrief(
                researchBrief,
                String(pair.testedClaim || ""),
                String(pair.challengingExcerpt || ""),
              );
          },
        );
        const approvalAuditBrief = /approval|sign-?off|audit trail/i.test(
          `${researchBrief.exactProductProposition} ${researchBrief.directCompetitorCategory}`,
        );
        if (!pairs.length && approvalAuditBrief) {
          const testedClaim =
            "Service teams lack an adequate way to collect client sign-off or retain attributable approval history.";
          const supporting = supportingSources.map((source) => ({
            source,
            excerpt: propositionContradictionExcerpt(
              source.retrievedText,
              "support",
            ),
          })).find((candidate) =>
            candidate.excerpt &&
            contradictionExcerptMatchesBrief(
              researchBrief,
              testedClaim,
              candidate.excerpt,
            )
          );
          const challenging = challengingSources.map((source) => ({
            source,
            excerpt: propositionContradictionExcerpt(
              source.retrievedText,
              "challenge",
            ),
          })).find((candidate) =>
            candidate.source.sourceId !== supporting?.source.sourceId &&
            candidate.excerpt &&
            contradictionExcerptMatchesBrief(
              researchBrief,
              testedClaim,
              candidate.excerpt,
            )
          );
          if (supporting?.excerpt && challenging?.excerpt) {
            pairs.push({
              testedClaim,
              supportingSourceId: supporting.source.sourceId,
              supportingExcerpt: supporting.excerpt,
              challengingSourceId: challenging.source.sourceId,
              challengingExcerpt: challenging.excerpt,
              relationship:
                "The supporting page documents missing attributable customer approval records; the challenging page documents an applicable product that supplies attributable approval history.",
              resolutionStatus: "unresolved",
              resolutionNote:
                "The workflow pain is directly documented, but an existing applicable product challenges whether the proposed capability is meaningfully unmet.",
            });
          }
        }
        for (const pair of pairs) {
          const supporting = allowedSources.get(
            String(pair.supportingSourceId),
          )!;
          const challenging = allowedSources.get(
            String(pair.challengingSourceId),
          )!;
          parsed.claims.push(
            {
              sourceId: supporting.sourceId,
              sourceUrl: supporting.url,
              sourceTier: supporting.sourceTier,
              title: `Support for: ${pair.testedClaim}`,
              excerpt: pair.supportingExcerpt,
              family: "problem",
              signalType: "Pain",
              strength: "Medium",
              disconfirming: false,
              numericValue: "",
              evidenceTopic: "customer_pain",
              relevanceClassification: supporting.relevanceClass,
              relevanceScore: supporting.relevanceScore,
              matchedBriefDimensions: supporting.matchedBriefDimensions,
              mismatchReasons: [],
            },
            {
              sourceId: challenging.sourceId,
              sourceUrl: challenging.url,
              sourceTier: challenging.sourceTier,
              title: `Challenge to: ${pair.testedClaim}`,
              excerpt: pair.challengingExcerpt,
              family: "solution",
              signalType: "Risk",
              strength: "Medium",
              disconfirming: true,
              numericValue: "",
              evidenceTopic: "contradiction",
              relevanceClassification: challenging.relevanceClass,
              relevanceScore: challenging.relevanceScore,
              matchedBriefDimensions: challenging.matchedBriefDimensions,
              mismatchReasons: [],
            },
          );
          parsed.contradictions.push({
            testedClaim: pair.testedClaim,
            supportingSourceIds: [supporting.sourceId],
            challengingSourceIds: [challenging.sourceId],
            relationship: pair.relationship,
            resolutionStatus: pair.resolutionStatus,
            resolutionNote: pair.resolutionNote,
          });
        }
      }
      const depthResult = await gemini.generate({
        runId,
        taskType: "validate_normalize_specialists",
        budget,
        db,
        systemInstruction:
          "Act as six evidence-bound specialists sharing one accepted dossier. The canonical brief is the semantic boundary. Each specialist must cite accepted SOURCE_ID values or state Insufficient evidence; report confidence, relevant brief dimensions, opposing evidence, and unresolved gaps. Segments, willingness to pay, market context, and GTM findings must also cite the dossier. Never invent a price, market fact, buyer behaviour, or recommendation.",
        prompt: sharedPrompt,
        responseSchema: FULL_DEPTH_RESPONSE_SCHEMA,
      });
      parsed = { ...parsed, ...(depthResult.parsed as any) };
      parsed.claims = [
        ...(parsed.claims || []),
        ...materializeAcceptedFamilyGaps(
          [...allowedSources.values()],
          parsed.claims || [],
        ),
      ];
    }
    // A negative flag is meaningful only when it belongs to the challenging
    // side of a persisted proposition-specific pair. Directory density,
    // category popularity, and generic saturation remain contextual evidence.
    const propositionChallengeSources = new Set(
      (parsed.contradictions || []).flatMap((item: any) =>
        item.challengingSourceIds || []
      ),
    );
    parsed.claims = (parsed.claims || []).map((claim: any) => {
      const propositionSpecific =
        propositionChallengeSources.has(claim.sourceId) &&
        allowedSources.get(String(claim.sourceId || ""))?.queryFamily ===
          "quick_adversarial" &&
        genuineChallengeLanguage(
          `${String(claim.title || "")} ${String(claim.excerpt || "")}`,
        );
      if (!claim.disconfirming || propositionSpecific) return claim;
      return {
        ...claim,
        disconfirming: false,
        evidenceTopic: claim.evidenceTopic === "contradiction"
          ? "alternatives"
          : claim.evidenceTopic,
      };
    });
    const validClaims: any[] = [];
    const numericAudit: Array<
      {
        fingerprint: string;
        validation: ReturnType<typeof validateNumericClaim>;
      }
    > = [];
    const fingerprints = new Set<string>();
    const rejectedClaims: Record<string, number> = {};
    const rejectClaim = (reason: string) => {
      rejectedClaims[reason] = (rejectedClaims[reason] || 0) + 1;
    };
    for (const claim of parsed.claims || []) {
      const source = allowedSources.get(String(claim.sourceId || ""));
      if (!source) {
        rejectClaim("unknown_source_id");
        continue;
      }
      const url = source.url;
      const tier = source.sourceTier;
      if (![1, 2, 3].includes(tier)) {
        rejectClaim("weak_source_tier");
        continue;
      }
      if (
        source.acceptanceDecision !== "accepted_core" ||
        !["directly_relevant", "contextually_relevant"].includes(
          source.relevanceClass,
        )
      ) {
        rejectClaim("source_not_core");
        continue;
      }
      if (
        !["directly_relevant", "contextually_relevant"].includes(
          String(claim.relevanceClassification || ""),
        )
      ) {
        rejectClaim("gemini_relevance_rejected");
        continue;
      }
      if (
        !claimSupportedByPage(String(claim.excerpt || ""), source.retrievedText)
      ) {
        rejectClaim("excerpt_not_supported_by_page");
        continue;
      }
      const deterministicClaimRelevance = assessSemanticRelevance(
        researchBrief,
        `${String(claim.title || "")}\n${
          String(claim.excerpt || "")
        }\n${source.retrievedText}`,
      );
      if (deterministicClaimRelevance.acceptanceDecision !== "accepted_core") {
        rejectClaim("deterministic_relevance_rejected");
        continue;
      }
      const geminiRelevanceScore = Math.max(
        0,
        Math.min(1, Number(claim.relevanceScore || 0)),
      );
      if (geminiRelevanceScore < 0.55) {
        rejectClaim("gemini_relevance_too_low");
        continue;
      }
      const effectiveRelevanceScore = Math.min(
        source.relevanceScore,
        deterministicClaimRelevance.score,
        geminiRelevanceScore,
      );
      if (effectiveRelevanceScore < 0.55) {
        rejectClaim("effective_relevance_too_low");
        continue;
      }
      const matchedBriefDimensions = unique([
        ...source.matchedBriefDimensions,
        ...deterministicClaimRelevance.matchedDimensions,
        ...(Array.isArray(claim.matchedBriefDimensions)
          ? claim.matchedBriefDimensions
          : []),
      ]).filter((dimension): dimension is BriefDimension =>
        BRIEF_DIMENSIONS.includes(dimension as BriefDimension)
      );
      if (matchedBriefDimensions.length < 2) {
        rejectClaim("brief_dimensions_too_weak");
        continue;
      }
      const evidenceTopic = EVIDENCE_TOPICS.includes(claim.evidenceTopic)
        ? claim.evidenceTopic
        : null;
      if (!evidenceTopic) {
        rejectClaim("invalid_evidence_topic");
        continue;
      }
      if (
        evidenceTopic === "willingness_to_pay" &&
        !isDirectWillingnessToPayEvidence({
          title: String(claim.title || ""),
          snippet: String(claim.excerpt || ""),
          evidence_topic: evidenceTopic,
        })
      ) {
        rejectClaim("list_price_is_not_willingness_to_pay");
        continue;
      }
      if (
        claim.signalType === "Pricing" &&
        /\d/.test(String(claim.numericValue || "")) &&
        !["official_pricing", "official_documentation", "buyer_review"]
          .includes(source.pageType)
      ) {
        rejectClaim("pricing_page_not_authoritative");
        continue;
      }
      const fingerprint = await sha256(
        `${normalizeClaimIdentity(claim.title)}|${
          normalizeClaimIdentity(claim.excerpt)
        }`,
      );
      if (fingerprints.has(fingerprint)) {
        rejectClaim("duplicate_source_claim");
        continue;
      }
      fingerprints.add(fingerprint);
      let snippet = String(claim.excerpt).trim();
      let structuredValue: ReturnType<typeof validateStructuredValue>;
      try {
        structuredValue = validateStructuredValue(
          claim.numericValue,
          claim.signalType,
        );
      } catch {
        // A malformed numeric or price claim is rejected without poisoning the
        // rest of an attributable dossier.
        rejectClaim("invalid_numeric_value");
        continue;
      }
      const numericValidation =
        numericTokensPresent(String(claim.numericValue || ""))
          ? validateNumericClaim({
            narrativeValue: String(claim.numericValue),
            sourceText: String(source.retrievedText || ""),
            sourceUrl: String(claim.sourceUrl || source.url),
            claimType: numericClaimType(claim),
            sourceClass: `${source.sourceClass || ""} ${source.pageType || ""}`,
          })
          : null;
      if (numericValidation) {
        numericAudit.push({ fingerprint, validation: numericValidation });
      }
      if (numericValidation?.status === "rejected") {
        rejectClaim(
          `numeric_claim_rejected:${
            numericValidation.reason || "source_mismatch"
          }`,
        );
        continue;
      }
      if (structuredValue?.currency) {
        snippet +=
          ` (Normalized: ${structuredValue.currency} ${structuredValue.numericValue}/${structuredValue.billingPeriod})`;
      } else if (numericValidation?.status === "flagged") {
        snippet = labelStatistic(snippet, numericValidation);
      }
      validClaims.push({
        ...claim,
        sourceId: source.sourceId,
        sourceUrl: url,
        sourceTier: tier,
        snippet,
        fingerprint,
        structuredValue,
        evidenceTopic,
        matchedBriefDimensions,
        sourceText: source.retrievedText,
        sourceClass: source.sourceClass,
        pageType: source.pageType,
        relevanceScore: effectiveRelevanceScore,
        geminiRelevanceScore,
        relevanceClass: effectiveRelevanceScore >= 0.72
          ? "directly_relevant"
          : "contextually_relevant",
        mismatchReasons: unique([
          ...source.mismatchReasons,
          ...deterministicClaimRelevance.mismatchReasons,
          ...(Array.isArray(claim.mismatchReasons)
            ? claim.mismatchReasons
            : []),
        ]),
        numericValidation,
      });
    }
    if (
      (mode === "quick_scan" || mode === "full_validation") &&
      Array.isArray(inputMeta.validatedPricingObservations)
    ) {
      for (const observation of inputMeta.validatedPricingObservations as Array<
        {
          sourceUrl?: string;
          exactExcerpt?: string;
          planName?: string | null;
          pricePoint?: string;
        }
      >) {
        const canonicalUrl = canonicalizeUrl(
          String(observation.sourceUrl || ""),
        );
        const source = [...allowedSources.values()].find((candidate) =>
          canonicalUrl && candidate.url === canonicalUrl
        );
        if (
          !source ||
          source.pageType !== "official_pricing" ||
          !observation.exactExcerpt ||
          !observation.pricePoint ||
          !claimSupportedByPage(
            observation.exactExcerpt,
            source.retrievedText,
          )
        ) continue;
        const numericValidation = validateNumericClaim({
          narrativeValue: observation.pricePoint,
          sourceText: source.retrievedText,
          sourceUrl: source.url,
          claimType: "price",
          sourceClass: `${source.sourceClass} ${source.pageType}`,
        });
        if (numericValidation.status !== "verified") continue;
        const fingerprint = await sha256(
          `${normalizeClaimIdentity(
            `${observation.planName || source.title} verified public price`,
          )}|${normalizeClaimIdentity(observation.exactExcerpt)}`,
        );
        if (fingerprints.has(fingerprint)) continue;
        let structuredValue: ReturnType<typeof validateStructuredValue>;
        try {
          structuredValue = validateStructuredValue(
            observation.pricePoint,
            "Pricing",
          );
        } catch {
          continue;
        }
        fingerprints.add(fingerprint);
        numericAudit.push({ fingerprint, validation: numericValidation });
        validClaims.push({
          sourceId: source.sourceId,
          sourceUrl: source.url,
          sourceTier: source.sourceTier,
          title: `${observation.planName || source.title} verified public price`,
          excerpt: observation.exactExcerpt,
          snippet: observation.exactExcerpt,
          family: "solution",
          signalType: "Pricing",
          strength: "High",
          disconfirming: false,
          numericValue: observation.pricePoint,
          evidenceTopic: "pricing",
          matchedBriefDimensions: source.matchedBriefDimensions,
          sourceText: source.retrievedText,
          sourceClass: source.sourceClass,
          pageType: source.pageType,
          relevanceScore: source.relevanceScore,
          geminiRelevanceScore: source.relevanceScore,
          relevanceClass: source.relevanceClass,
          mismatchReasons: source.mismatchReasons,
          structuredValue,
          numericValidation,
          fingerprint,
        });
      }
    }
    let persistedPropositions: Array<{
      id: string;
      proposition_key: string;
      statement: string;
      buyer_segment: string;
      factor_ids: string[];
      primary_pack_key: string;
    }> = [];
    // A synthesis miss is not a research-system failure. Reuse only exact,
    // semantically accepted excerpts from the directly retrieved catalog. This
    // keeps every evidence gate intact while avoiding a false terminal failure
    // caused solely by a model paraphrase or malformed numeric field.
    if (!validClaims.length) {
      const deterministicClaims = await materializeCatalogClaims(
        [...allowedSources.values()],
        researchBrief,
      );
      for (const claim of deterministicClaims) {
        if (fingerprints.has(claim.fingerprint)) continue;
        fingerprints.add(claim.fingerprint);
        validClaims.push(claim);
      }
    }
    if (
      mode === "quick_scan" &&
      !(parsed.contradictions || []).length &&
      Array.isArray(inputMeta.contradictionObjects)
    ) {
      const candidate = inputMeta.contradictionObjects[0] as {
        proposition?: string;
        supportingEvidenceIds?: string[];
        challengingEvidenceIds?: string[];
        unresolvedImplication?: string;
      } | undefined;
      const supportingSourceIds = unique(
        (candidate?.supportingEvidenceIds || []).filter((sourceId) =>
          validClaims.some((claim) =>
            claim.sourceId === sourceId && !claim.disconfirming
          )
        ),
      );
      const challengingSourceIds = unique(
        (candidate?.challengingEvidenceIds || []).filter((sourceId) =>
          validClaims.some((claim) =>
            claim.sourceId === sourceId && claim.disconfirming &&
            genuineChallengeLanguage(
              `${claim.title || ""} ${claim.snippet || claim.excerpt || ""}`,
            )
          )
        ),
      );
      if (
        candidate?.proposition && supportingSourceIds.length &&
        challengingSourceIds.length
      ) {
        parsed.contradictions = [{
          testedClaim: candidate.proposition,
          supportingSourceIds,
          challengingSourceIds,
          relationship:
            "Accepted primary evidence supports the proposition while accepted adversarial evidence documents a same-workflow workaround, resistance, or low-urgency condition.",
          resolutionStatus: "unresolved",
          resolutionNote: candidate.unresolvedImplication ||
            "The proposition-specific conflict remains unresolved.",
        }];
      }
    }
    const insufficientEvidence = validClaims.length === 0;
    if (insufficientEvidence) {
      parsed = insufficientEvidenceArtifacts(mode);
    }
    const secondModelClassifications =
      mode === "quick_scan" || mode === "full_validation"
      ? await classifyWithOptionalGroq({
        runId,
        db,
        brief: researchBrief,
        claims: validClaims.map((claim) => ({
          fingerprint: claim.fingerprint,
          title: claim.title,
          snippet: claim.snippet,
          sourceId: claim.sourceId,
        })),
      })
      : new Map();

    const evidenceItemIds: string[] = [];
    const sourceRecords: Array<
      { id: string; url: string; title: string; domain: string; tier: number }
    > = [];
    for (const claim of validClaims) {
      const sourceMeta = allowedSources.get(claim.sourceId)!;
      sourceRecords.push({
        id: sourceMeta.sourceId,
        url: sourceMeta.url,
        title: claim.title || sourceMeta.title,
        domain: sourceMeta.domain,
        tier: claim.sourceTier,
      });
      const { data: item, error: itemError } = await db.from("evidence_items")
        .upsert({
          run_id: runId,
          source_id: sourceMeta.sourceId,
          opportunity_id: opportunityId,
          title: claim.title,
          snippet: claim.snippet,
          signal_type: claim.signalType,
          strength: claim.strength,
          verified: true,
          evidence_family: claim.family,
          source_tier: claim.sourceTier,
          source_domain: new URL(claim.sourceUrl).hostname,
          disconfirming: claim.disconfirming,
          excluded: claim.sourceTier === 4,
          claim_fingerprint: claim.fingerprint,
          canonical_url: sourceMeta.url,
          source_title: sourceMeta.title,
          publisher: sourceMeta.publisher,
          retrieval_date: sourceMeta.retrievalDate,
          relevant_excerpt: claim.snippet,
          structured_value: claim.structuredValue,
          support_classification: claim.disconfirming
            ? "contradiction"
            : "support",
          source_class: sourceMeta.sourceClass,
          segment: String(inputMeta.targetCustomer || "").trim() || null,
          geography: String(inputMeta.targetRegion || "").trim() || null,
          extraction_method: sourceMeta.extractionMethod,
          associated_claim_ids: [`claim:${claim.fingerprint}`],
          numeric_value: claim.structuredValue?.numericValue ?? null,
          currency: claim.structuredValue?.currency ?? null,
          relevance_score: claim.relevanceScore,
          gemini_relevance_score: claim.geminiRelevanceScore,
          relevance_class: claim.relevanceClass,
          matched_brief_dimensions: claim.matchedBriefDimensions,
          mismatch_reasons: claim.mismatchReasons,
          acceptance_decision: "accepted_core",
          evidence_topic: claim.evidenceTopic,
          claim_id: `claim:${claim.fingerprint}`,
          canonical_source_id: sourceMeta.sourceId,
          canonical_domain: sourceMeta.domain.replace(/^www\./, "").toLowerCase(),
          source_family: sourceMeta.queryFamily || claim.evidenceTopic,
          source_authority: sourceMeta.authorityScore ||
            (claim.sourceTier === 1 ? 1 : claim.sourceTier === 2 ? 0.8 : 0.45),
          evidence_directness: sourceMeta.directnessScore ||
            (claim.sourceTier === 1 ? 0.85 : claim.sourceTier === 2 ? 0.65 : 0.4),
          semantic_relevance: claim.relevanceScore,
          independence_key: claim.fingerprint,
          syndication_group: claim.fingerprint,
          evidence_role: claim.disconfirming ? "challenging" : "supporting",
          associated_factor_ids: factorIdsForClaim(
            claim.evidenceTopic,
            claim.signalType,
          ),
          extraction_confidence: Math.min(
            1,
            Math.max(0, Number(claim.geminiRelevanceScore || claim.relevanceScore)),
          ),
          numeric_validation_state: claim.numericValidation?.status ||
            (claim.structuredValue ? "not_checked" : "not_applicable"),
          model_classification_metadata: {
            geminiRelevanceScore: claim.geminiRelevanceScore,
            relevanceClass: claim.relevanceClass,
            matchedBriefDimensions: claim.matchedBriefDimensions,
            acceptanceDecision: "accepted_core",
            optionalGroqClassification:
              secondModelClassifications.get(claim.fingerprint) || null,
            officialEvidenceStateAuthority: "code",
          },
        }, { onConflict: "run_id,claim_fingerprint" }).select("id").single();
      if (itemError || !item) {
        throw new Error(`Evidence persistence failed: ${itemError?.message}`);
      }
      evidenceItemIds.push(item.id);
    }
    const sourceIdToEvidence = new Map<string, string>();
    const willingnessToPayEvidenceBySource = new Map<string, string>();
    validClaims.forEach((claim, index) => {
      if (!sourceIdToEvidence.has(claim.sourceId)) {
        sourceIdToEvidence.set(claim.sourceId, evidenceItemIds[index]);
      }
      if (claim.evidenceTopic === "willingness_to_pay") {
        willingnessToPayEvidenceBySource.set(
          claim.sourceId,
          evidenceItemIds[index],
        );
      }
    });
    if (mode === "full_validation") {
      const { data: propositionRows, error: propositionError } = await db
        .from("research_propositions")
        .select(
          "id,proposition_key,statement,buyer_segment,factor_ids,primary_pack_key",
        )
        .eq("run_id", runId);
      if (propositionError) {
        throw new Error(
          `Proposition graph load failed: ${propositionError.message}`,
        );
      }
      persistedPropositions = propositionRows || [];
      await db.from("research_claim_graph_edges").delete().eq("run_id", runId);
      const edgeRows: Array<Record<string, unknown>> = [];
      validClaims.forEach((claim, index) => {
        const source = allowedSources.get(claim.sourceId)!;
        const factorIds = factorIdsForClaim(
          claim.evidenceTopic,
          claim.signalType,
        );
        const buyerSegment = String(inputMeta.targetCustomer || "").trim();
        for (const row of persistedPropositions) {
          const proposition: TestableProposition = {
            key: row.proposition_key as TestableProposition["key"],
            statement: row.statement,
            buyerSegment: row.buyer_segment,
            factorIds: row.factor_ids,
            primaryPackKey:
              row.primary_pack_key as TestableProposition["primaryPackKey"],
          };
          if (!evidenceAppliesToProposition(proposition, {
            buyerSegment,
            researchPack: source.queryFamily,
            factorIds,
          })) continue;
          for (const factorId of factorIds.filter((factorId) =>
            proposition.factorIds.includes(factorId)
          )) {
            edgeRows.push({
              run_id: runId,
              proposition_id: row.id,
              evidence_id: evidenceItemIds[index],
              source_id: source.sourceId,
              buyer_segment: buyerSegment,
              factor_id: factorId,
              research_pack: source.queryFamily,
              evidence_role: claim.disconfirming
                ? "challenging"
                : "supporting",
              source_family: source.queryFamily || claim.evidenceTopic,
              independence_key: claim.fingerprint,
            });
          }
        }
      });
      if (edgeRows.length) {
        const { error: edgeError } = await db.from("research_claim_graph_edges")
          .upsert(edgeRows, {
            onConflict: "proposition_id,evidence_id,factor_id",
          });
        if (edgeError) {
          throw new Error(`Claim graph persistence failed: ${edgeError.message}`);
        }
      }
      for (const proposition of persistedPropositions) {
        const edges = edgeRows.filter((edge) =>
          edge.proposition_id === proposition.id
        );
        const supporting = edges.some((edge) =>
          edge.evidence_role === "supporting"
        );
        const challenging = edges.some((edge) =>
          edge.evidence_role === "challenging"
        );
        const status = supporting && challenging
          ? "mixed"
          : supporting
          ? "supported"
          : challenging
          ? "challenged"
          : "insufficient_evidence";
        await db.from("research_propositions").update({
          status,
          updated_at: new Date().toISOString(),
        }).eq("id", proposition.id);
      }
    }
    if (mode === "quick_scan" || mode === "full_validation") {
      const { data: seededCompetitors } = await db.from("competitors")
        .select("id,canonical_homepage,candidate_type,verification_status")
        .eq("opportunity_id", opportunityId)
        .in("verification_status", [
          "unverified_seed",
          "discovered_candidate",
        ]);
      for (const competitor of seededCompetitors || []) {
        const competitorDomain = safeDomain(
          String(competitor.canonical_homepage || ""),
        );
        const source = [...allowedSources.values()].find((candidate) =>
          candidate.domain.replace(/^www\./, "").toLowerCase() ===
              competitorDomain &&
          ["official_product", "official_documentation", "official_pricing"]
            .includes(candidate.pageType) &&
          sourceIdToEvidence.has(candidate.sourceId)
        );
        const evidenceId = source
          ? sourceIdToEvidence.get(source.sourceId)
          : null;
        if (source && evidenceId) {
          await db.from("competitors").update({
            verification_status: competitor.candidate_type === "adjacent"
              ? "adjacent_alternative"
              : "live_verified_competitor",
            verified_at: new Date().toISOString(),
            evidence_ids: [evidenceId],
            updated_at: new Date().toISOString(),
          }).eq("id", competitor.id);
        }
      }
    }
    await persistArtifacts(
      db,
      opportunityId,
      parsed,
      sourceIdToEvidence,
      validClaims,
      researchBrief,
    );
    await db.from("numeric_claim_validations").delete().eq("run_id", runId);
    const evidenceIdByFingerprint = new Map(
      validClaims.map((
        claim,
        index,
      ) => [claim.fingerprint, evidenceItemIds[index]]),
    );
    for (const audit of numericAudit) {
      const validation = audit.validation;
      await db.from("numeric_claim_validations").insert({
        run_id: runId,
        evidence_item_id: evidenceIdByFingerprint.get(audit.fingerprint) ||
          null,
        claim_type: validation.claimType,
        narrative_value: validation.narrativeValue,
        extracted_source_value: validation.extractedSourceValue,
        normalized_value: validation.normalizedValue,
        source_url: validation.sourceUrl,
        status: validation.status,
        reason: validation.reason,
        methodology_status: validation.methodologyStatus,
      });
    }
    await db.from("evidence_contradictions").delete().eq("run_id", runId);
    const supportingBySource = new Map<string, string[]>();
    const challengingBySource = new Map<string, string[]>();
    const contradictionSupportSources = new Set<string>(
      (parsed.contradictions || []).flatMap((item: any) =>
        item.supportingSourceIds || []
      ),
    );
    const contradictionChallengeSources = new Set<string>(
      (parsed.contradictions || []).flatMap((item: any) =>
        item.challengingSourceIds || []
      ),
    );
    validClaims.forEach((claim, index) => {
      const title = String(claim.title || "");
      const sourceFamily = allowedSources.get(claim.sourceId)?.queryFamily;
      if (
        title.startsWith("Support for:") ||
        (contradictionSupportSources.has(claim.sourceId) &&
          sourceFamily !== "quick_adversarial" &&
          sourceFamily !== "full_adversarial" &&
          !String(sourceFamily || "").includes("unresolved_contradictions"))
      ) {
        supportingBySource.set(claim.sourceId, [
          ...(supportingBySource.get(claim.sourceId) || []),
          evidenceItemIds[index],
        ]);
      } else if (
        title.startsWith("Challenge to:") ||
        (contradictionChallengeSources.has(claim.sourceId) &&
          (sourceFamily === "quick_adversarial" ||
            sourceFamily === "full_adversarial" ||
            String(sourceFamily || "").includes("unresolved_contradictions")) &&
          genuineChallengeLanguage(`${title} ${claim.snippet || ""}`))
      ) {
        challengingBySource.set(claim.sourceId, [
          ...(challengingBySource.get(claim.sourceId) || []),
          evidenceItemIds[index],
        ]);
      }
    });
    let persistedContradictionCount = 0;
    let persistedContradictionTotal = 0;
    for (const contradiction of parsed.contradictions || []) {
      const supportingEvidenceIds = unique(
        (contradiction.supportingSourceIds || []).flatMap((sourceId: string) =>
          supportingBySource.get(sourceId) || []
        ),
      );
      const challengingEvidenceIds = unique(
        (contradiction.challengingSourceIds || []).flatMap((sourceId: string) =>
          challengingBySource.get(sourceId) || []
        ),
      );
      const testedClaim = String(contradiction.testedClaim || "").trim();
      const relationship = String(contradiction.relationship || "").trim();
      if (
        !testedClaim || testedClaim.split(/\s+/).length < 5 || !relationship ||
        !supportingEvidenceIds.length || !challengingEvidenceIds.length
      ) continue;
      const proposition = mode === "full_validation"
        ? bestMatchingProposition(testedClaim, persistedPropositions)
        : null;
      await db.from("evidence_contradictions").insert({
        run_id: runId,
        opportunity_id: opportunityId,
        tested_claim: testedClaim,
        supporting_evidence_ids: supportingEvidenceIds,
        challenging_evidence_ids: challengingEvidenceIds,
        relationship,
        resolution_status: contradiction.resolutionStatus,
        resolution_note: String(contradiction.resolutionNote || "").trim() ||
          null,
        proposition: testedClaim,
        segment_applicability: String(inputMeta.targetCustomer || "").trim() ||
          null,
        geography_applicability: String(inputMeta.targetRegion || "").trim() ||
          null,
        contradiction_status: contradiction.resolutionStatus,
        unresolved_implication:
          String(contradiction.resolutionNote || "").trim() || null,
        proposition_id: proposition?.id || null,
        buyer_segment: proposition?.buyer_segment ||
          String(inputMeta.targetCustomer || "").trim() || null,
      });
      persistedContradictionTotal++;
      if (contradiction.resolutionStatus === "unresolved") {
        persistedContradictionCount++;
      }
    }
    const { data: items } = await db.from("evidence_items").select("*").eq(
      "run_id",
      runId,
    ).eq("excluded", false);
    const clusters = clusterEvidence(items || []);
    await db.from("evidence_clusters").delete().eq("run_id", runId);
    for (const cluster of clusters) {
      await db.from("evidence_clusters").insert({
        run_id: runId,
        opportunity_id: opportunityId,
        cluster_key: cluster.key,
        signal_type: cluster.kind,
        representative_claim: cluster.representativeClaim,
        supporting_evidence_ids: cluster.supportingEvidenceIds,
        contradicting_evidence_ids: cluster.contradictingEvidenceIds,
        independent_source_count: cluster.independentSourceCount,
        independent_domain_count: cluster.independentDomainCount,
        tier_distribution: cluster.tierDistribution,
        confidence: cluster.confidence,
        unresolved_disagreement: cluster.unresolvedDisagreement,
      });
    }
    const confidenceResult = evidenceConfidence(
      items || [],
      clusters,
      persistedContradictionCount,
      persistedContradictionTotal,
    );
    await db.from("evidence_confidence_results").upsert({
      run_id: runId,
      band: confidenceResult.band,
      score: confidenceResult.score,
      reasons: confidenceResult.reasons,
      deductions: confidenceResult.deductions,
      updated_at: new Date().toISOString(),
    }, { onConflict: "run_id" });

    // Build the persisted Evidence Graph from attributable source and claim
    // records. Re-execution replaces only this run's derived graph.
    await db.from("evidence_graph_edges").delete().eq("run_id", runId);
    await db.from("evidence_graph_nodes").delete().eq("run_id", runId);
    const { data: opportunityNode, error: opportunityNodeError } = await db
      .from("evidence_graph_nodes").insert({
        run_id: runId,
        node_type: "opportunity",
        node_key: opportunityId,
        label: "Validated opportunity",
        attributes: { mode },
      }).select("id").single();
    if (opportunityNodeError || !opportunityNode) {
      throw new Error(
        `Evidence Graph opportunity node failed: ${opportunityNodeError?.message}`,
      );
    }
    for (let index = 0; index < validClaims.length; index++) {
      const claim = validClaims[index];
      const sourceRecord = sourceRecords[index];
      const evidenceId = evidenceItemIds[index];
      const { data: sourceNode, error: sourceNodeError } = await db.from(
        "evidence_graph_nodes",
      ).upsert({
        run_id: runId,
        node_type: "source",
        node_key: sourceRecord.id,
        label: sourceRecord.title,
        attributes: {
          url: sourceRecord.url,
          domain: sourceRecord.domain,
          tier: sourceRecord.tier,
        },
      }, { onConflict: "run_id,node_type,node_key" }).select("id").single();
      const { data: claimNode, error: claimNodeError } = await db.from(
        "evidence_graph_nodes",
      ).insert({
        run_id: runId,
        node_type: "claim",
        node_key: evidenceId,
        label: claim.title,
        attributes: {
          signalType: claim.signalType,
          strength: claim.strength,
          disconfirming: claim.disconfirming,
        },
      }).select("id").single();
      if (sourceNodeError || claimNodeError || !sourceNode || !claimNode) {
        throw new Error(
          `Evidence Graph claim linkage failed: ${
            sourceNodeError?.message || claimNodeError?.message
          }`,
        );
      }
      await db.from("evidence_graph_edges").insert([
        {
          run_id: runId,
          from_node_id: sourceNode.id,
          to_node_id: claimNode.id,
          relation: claim.disconfirming ? "contradicts" : "supports",
          evidence_ids: [evidenceId],
        },
        {
          run_id: runId,
          from_node_id: claimNode.id,
          to_node_id: opportunityNode.id,
          relation: "informs",
          evidence_ids: [evidenceId],
        },
      ]);
    }
    const usable = items || [];
    const rules = config.evidenceSufficiency;
    const gaps = [
      ...(usable.length < rules.minimumUsableEvidence
        ? [`need ${rules.minimumUsableEvidence} usable evidence items`]
        : []),
      ...(usable.filter((item: any) => item.evidence_family === "problem")
          .length < rules.minimumProblemSources
        ? ["insufficient problem evidence"]
        : []),
      ...(usable.filter((item: any) => item.evidence_family === "solution")
          .length < rules.minimumSolutionSources
        ? ["insufficient solution evidence"]
        : []),
      ...(usable.filter((item: any) => item.disconfirming).length <
          rules.minimumDisconfirmingEvidence
        ? ["insufficient disconfirming evidence"]
        : []),
      ...(rules.requireTierOneEvidence &&
          !usable.some((item: any) => item.source_tier === 1)
        ? ["Tier 1 evidence missing"]
        : []),
      ...(rules.requireTierOneOrTwoEvidence &&
          !usable.some((item: any) => item.source_tier <= 2)
        ? ["Tier 1/2 evidence missing"]
        : []),
      ...(mode === "full_validation"
        ? EVIDENCE_TOPICS
          .filter((topic) =>
            !usable.some((item: any) => item.evidence_topic === topic)
          )
          .map((topic) => `evidence-family gap: ${topic.replaceAll("_", " ")}`)
        : []),
    ];
    await db.from("research_runs").update({
      retrieval_sufficient: gaps.length === 0,
      retrieval_coverage_gaps: gaps,
    }).eq("id", runId);

    let fullValidationInsights: Record<string, unknown> | undefined;
    if (mode === "full_validation") {
      const specialists = Array.isArray(parsed.specialists)
        ? parsed.specialists
        : [];
      const byName = new Map(
        specialists.map((specialist: any) => [specialist.name, specialist]),
      );
      const mapIds = (ids: unknown) =>
        Array.isArray(ids)
          ? ids.flatMap((raw) => {
            const sourceId = String(raw || "");
            const source = allowedSources.get(sourceId);
            const evidenceId = sourceIdToEvidence.get(sourceId);
            return source
              ? [{ sourceId, url: source.url, evidenceId: evidenceId || null }]
              : [];
          })
          : [];
      const mapWillingnessToPayIds = (ids: unknown) =>
        Array.isArray(ids)
          ? ids.flatMap((raw) => {
            const sourceId = String(raw || "");
            const source = allowedSources.get(sourceId);
            const evidenceId = willingnessToPayEvidenceBySource.get(sourceId);
            return source && evidenceId
              ? [{ sourceId, url: source.url, evidenceId }]
              : [];
          })
          : [];
      const willingnessToPayCitations = mapWillingnessToPayIds(
        parsed.willingnessToPay?.evidenceSourceIds,
      );
      const safeWillingnessToPay = willingnessToPayCitations.length
        ? {
          ...parsed.willingnessToPay,
          evidenceSourceIds: willingnessToPayCitations.map((citation: any) =>
            citation.sourceId
          ),
        }
        : {
          finding: "Insufficient evidence",
          strength: "Insufficient",
          evidenceSourceIds: [],
        };
      for (const name of SPECIALIST_NAMES) {
        const specialist: any = byName.get(name) || {
          name,
          direction: "Insufficient",
          assessment: "Insufficient evidence",
          findings: ["Insufficient evidence"],
          evidenceSourceIds: [],
          opposingEvidenceSourceIds: [],
          confidence: "Insufficient",
          relevantBriefDimensions: [],
          unresolvedGaps: [
            "No attributable evidence survived validation for this specialist desk.",
          ],
        };
        const citations = mapIds(specialist.evidenceSourceIds).filter((
          citation: any,
        ) => citation.evidenceId);
        const opposingCitations = mapIds(specialist.opposingEvidenceSourceIds)
          .filter((citation: any) => citation.evidenceId);
        const hasEvidence = citations.length > 0;
        const direction = hasEvidence ? specialist.direction : "Insufficient";
        const assessment = hasEvidence
          ? cleanSpecialistText(specialist.assessment)
          : "Insufficient evidence";
        const findings = hasEvidence
          ? unique(
            (specialist.findings || []).map(cleanSpecialistText).filter(
              Boolean,
            ),
          )
          : ["Insufficient evidence"];
        const relevantBriefDimensions = unique(
          (specialist.relevantBriefDimensions || [])
            .filter((dimension: string) =>
              BRIEF_DIMENSIONS.includes(dimension as BriefDimension)
            ),
        );
        const confidence = !hasEvidence
          ? "Insufficient"
          : citations.filter((citation: any) => citation.evidenceId).length >= 3
          ? (specialist.confidence === "High"
            ? "Moderate"
            : specialist.confidence)
          : ["High", "Moderate"].includes(specialist.confidence)
          ? "Low"
          : specialist.confidence;
        const unresolvedGaps = unique([
          ...(specialist.unresolvedGaps || []),
          ...(!hasEvidence
            ? [`No accepted evidence supports the ${name} assessment.`]
            : []),
          ...(!relevantBriefDimensions.length
            ? ["Relevant research-brief dimensions were not established."]
            : []),
        ]);
        const relatedInsights = name === "demand"
          ? {
            targetSegments: parsed.targetSegments || [],
            willingnessToPay: safeWillingnessToPay,
          }
          : name === "market"
          ? { marketContext: parsed.marketContext || null }
          : name === "gtm"
          ? { gtmFindings: parsed.gtmFindings || [] }
          : {};
        const { error: specialistError } = await db.from(
          "reasoning_agent_outputs",
        ).upsert({
          run_id: runId,
          agent_name: name,
          status: "Complete",
          attempt_count: 1,
          payload: {
            direction,
            assessment,
            findings,
            evidence_urls: citations.map((citation: any) => citation.url),
            evidence_ids: citations.flatMap((citation: any) =>
              citation.evidenceId ? [citation.evidenceId] : []
            ),
            source_citations: citations.map((citation: any) => ({
              sourceId: citation.sourceId,
              url: citation.url,
            })),
            opposing_evidence_ids: opposingCitations.flatMap((citation: any) =>
              citation.evidenceId ? [citation.evidenceId] : []
            ),
            confidence,
            relevant_brief_dimensions: relevantBriefDimensions,
            unresolved_gaps: unresolvedGaps,
            ...relatedInsights,
          },
        }, { onConflict: "run_id,agent_name" });
        if (specialistError) {
          throw new Error(
            `Failed to persist ${name} specialist: ${specialistError.message}`,
          );
        }
      }
      const mapInsightUrls = (value: any) => ({
        ...value,
        evidenceIds: mapIds(value?.evidenceSourceIds).flatMap((citation: any) =>
          citation.evidenceId ? [citation.evidenceId] : []
        ),
        sourceCitations: mapIds(value?.evidenceSourceIds).map((
          citation: any,
        ) => ({ sourceId: citation.sourceId, url: citation.url })),
      });
      fullValidationInsights = {
        targetSegments: (parsed.targetSegments || []).map(mapInsightUrls),
        willingnessToPay: {
          ...safeWillingnessToPay,
          evidenceIds: willingnessToPayCitations.map((citation: any) =>
            citation.evidenceId
          ),
          sourceCitations: willingnessToPayCitations.map((citation: any) => ({
            sourceId: citation.sourceId,
            url: citation.url,
          })),
        },
        marketContext: {
          summary: parsed.marketContext?.summary || "",
          metrics: (parsed.marketContext?.metrics || []).map((metric: any) => {
            const source = allowedSources.get(String(metric.sourceId || ""));
            const evidenceId = sourceIdToEvidence.get(
              String(metric.sourceId || ""),
            );
            const rawValue = String(metric.value || "");
            const validation = source && numericTokensPresent(rawValue)
              ? validateNumericClaim({
                narrativeValue: rawValue,
                sourceText: source.retrievedText,
                sourceUrl: source.url,
                claimType: /%/.test(rawValue) ? "percentage" : "market_metric",
                sourceClass: `${source.sourceClass} ${source.pageType}`,
              })
              : null;
            return {
              label: metric.label,
              value: validation && validation.status !== "rejected"
                ? labelStatistic(rawValue, validation)
                : "Insufficient evidence",
              sourceId: source?.sourceId || null,
              sourceUrl: source?.url || null,
              evidenceId: validation?.status === "rejected"
                ? null
                : evidenceId || null,
              numericValidation: validation,
            };
          }).filter((metric: any) => metric.sourceUrl && metric.evidenceId),
        },
        gtmFindings: (parsed.gtmFindings || []).map(mapInsightUrls),
      };
    }
    const adversarialEvidenceIds = (parsed.adversarial?.sourceIds || [])
      .flatMap((sourceId: string) =>
        sourceIdToEvidence.get(sourceId)
          ? [sourceIdToEvidence.get(sourceId)]
          : []
      );
    const adversarialResult = adversarialEvidenceIds.length
      ? { ...parsed.adversarial, evidence_ids: adversarialEvidenceIds }
      : {
        outcome: "InsufficientEvidence",
        severity: "None",
        objection: "Insufficient evidence",
        sourceIds: [],
        evidence_ids: [],
      };
    if (mode === "quick_scan" || mode === "full_validation") {
      const diagnostics = aggregateRejectionDiagnostics(rejectedClaims);
      for (const [reason, count] of Object.entries(diagnostics)) {
        await db.from("evidence_rejection_diagnostics").upsert({
          run_id: runId,
          pipeline_stage: "validate_normalize",
          reason,
          count,
          details: { rawReasons: rejectedClaims },
          updated_at: new Date().toISOString(),
        }, { onConflict: "run_id,pipeline_stage,reason" });
      }
    }
    await db.from("adversarial_verdict_gates").upsert({
      run_id: runId,
      emerging_verdict: "Validate First",
      outcome: adversarialResult.outcome,
      severity: adversarialResult.severity,
      objection: adversarialResult.objection,
      evidence_ids: adversarialEvidenceIds,
      unresolved: adversarialResult.outcome === "StrongObjection",
      status: "Complete",
      payload: adversarialResult,
    }, { onConflict: "run_id" });
    return stageCompleted("analyze_score", {
      extractedClaims: validClaims.length,
      rejectedClaims,
      insufficientEvidence,
      coverageGaps: gaps,
      specialistAssessments: mode === "full_validation" ? 6 : 0,
    }, {
      evidence_extracted: validClaims.length,
      duration_ms: Date.now() - startedAt,
    }, {
      nextInputMeta: {
        opportunityId,
        mode,
        allowedEvidenceIds: evidenceItemIds,
        insufficientEvidence,
        rejectedClaims,
        adversarialResult,
        fullValidationInsights,
        researchBrief,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      (mode === "quick_scan" || mode === "full_validation") &&
      /GEMINI_API_KEY|authentication|unauthorized|forbidden|429|quota|resource_exhausted|timeout|temporar|unavailable|5\d\d|connection|peer closed|tls close/i
        .test(message)
    ) {
      return stageFailed(
        "research_unavailable",
        researchUnavailableMessage(
          /timeout/i.test(message) ? "timed_out" : "provider_failed",
        ),
      );
    }
    const errorClass =
      /timeout|429|quota|temporar|unavailable|5\d\d|JSON|unterminated|unexpected (?:end|eof)|connection|peer closed|tls close/i
          .test(message)
        ? "transient"
        : "permanent";
    return stageFailed(
      errorClass,
      `Validation and normalization failed: ${message}`,
    );
  }
}

function bestMatchingProposition(
  testedClaim: string,
  propositions: Array<{
    id: string;
    statement: string;
    buyer_segment: string;
  }>,
) {
  const tested = new Set(
    testedClaim.toLowerCase().split(/[^a-z0-9]+/).filter((word) =>
      word.length > 3
    ),
  );
  return propositions
    .map((proposition) => ({
      proposition,
      score: proposition.statement.toLowerCase().split(/[^a-z0-9]+/)
        .filter((word) => tested.has(word)).length,
    }))
    .sort((left, right) => right.score - left.score)[0]?.proposition || null;
}

export function aggregateRejectionDiagnostics(
  rejected: Record<string, number>,
) {
  const result: Record<string, number> = {};
  for (const [rawReason, count] of Object.entries(rejected)) {
    const reason =
      /duplicate/.test(rawReason)
        ? "duplicate_source"
        : /excerpt|unknown_source/.test(rawReason)
        ? "missing_excerpt"
        : /tier|authoritative/.test(rawReason)
        ? "weak_authority"
        : /pricing|numeric|willingness/.test(rawReason)
        ? "pricing_mismatch"
        : /relevance|brief_dimensions|source_not_core/.test(rawReason)
        ? "semantic_mismatch"
        : /invalid/.test(rawReason)
        ? "parsing_failure"
        : "inaccessible_page";
    result[reason] = (result[reason] || 0) + count;
  }
  return result;
}

export async function materializeCatalogClaims(
  sources: Array<{
    sourceId: string;
    url: string;
    title: string;
    excerpt: string;
    sourceTier: number;
    domain: string;
    sourceClass: string;
    pageType: string;
    relevanceScore: number;
    relevanceClass: string;
    matchedBriefDimensions: BriefDimension[];
    mismatchReasons: string[];
    acceptanceDecision: string;
    retrievedText: string;
    queryFamily: string;
  }>,
  brief: CanonicalResearchBrief,
) {
  const claims = [];
  for (const source of sources) {
    if (
      source.acceptanceDecision !== "accepted_core" ||
      ![1, 2, 3].includes(source.sourceTier) ||
      source.relevanceScore < 0.55
    ) continue;
    const excerpt = exactRelevantExcerpt(
      source.retrievedText,
      brief,
      source.queryFamily,
    );
    if (!excerpt) continue;
    const relevance = assessSemanticRelevance(
      brief,
      `${source.title}\n${excerpt}`,
      source.queryFamily,
    );
    if (
      relevance.acceptanceDecision !== "accepted_core" ||
      relevance.score < 0.55 ||
      relevance.matchedDimensions.length < 2
    ) continue;
    const evidenceTopic = topicForQueryFamily(
      source.queryFamily,
      source.pageType,
    );
    const negative = /negative|contradiction|adversarial/i.test(
      source.queryFamily,
    ) && genuineChallengeLanguage(excerpt);
    const signalType = evidenceTopic === "pricing"
      ? "Pricing"
      : negative || evidenceTopic === "risks" ||
          evidenceTopic === "contradiction"
      ? "Risk"
      : evidenceTopic === "behavior_demand"
      ? "Demand"
      : "Pain";
    const fingerprint = await sha256(
      `${normalizeClaimIdentity(source.title)}|${normalizeClaimIdentity(excerpt)}`,
    );
    claims.push({
      sourceId: source.sourceId,
      sourceUrl: source.url,
      title: source.title,
      excerpt,
      snippet: excerpt,
      family: ["competitors", "pricing", "alternatives"].includes(evidenceTopic)
        ? "solution"
        : "problem",
      signalType,
      strength: "Low",
      disconfirming: negative,
      sourceTier: source.sourceTier,
      numericValue: "",
      evidenceTopic,
      matchedBriefDimensions: relevance.matchedDimensions,
      sourceText: source.retrievedText,
      sourceClass: source.sourceClass,
      pageType: source.pageType,
      relevanceScore: Math.min(source.relevanceScore, relevance.score),
      geminiRelevanceScore: relevance.score,
      relevanceClass: relevance.classification,
      mismatchReasons: unique([
        ...source.mismatchReasons,
        ...relevance.mismatchReasons,
      ]),
      structuredValue: null,
      numericValidation: null,
      fingerprint,
    });
  }
  return claims.slice(0, 12);
}

function exactRelevantExcerpt(
  text: string,
  brief: CanonicalResearchBrief,
  queryFamily: string,
) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40);
  let best = "";
  let bestScore = 0;
  for (let index = 0; index < sentences.length; index++) {
    const candidate = sentences.slice(index, index + 3).join(" ").slice(0, 650);
    const relevance = assessSemanticRelevance(brief, candidate, queryFamily);
    const score = relevance.acceptanceDecision === "accepted_core"
      ? relevance.score + relevance.matchedDimensions.length / 10
      : 0;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function topicForQueryFamily(
  queryFamily: string,
  pageType: string,
): typeof EVIDENCE_TOPICS[number] {
  const value = `${queryFamily} ${pageType}`.toLowerCase();
  if (/pricing/.test(value)) return "pricing";
  if (/willingness|payment|paid_pilot/.test(value)) return "willingness_to_pay";
  if (/competitor/.test(value)) return "competitors";
  if (/alternative/.test(value)) return "alternatives";
  if (/segment/.test(value)) return "segments";
  if (/market|regulatory/.test(value)) return "market_context";
  if (/gtm|case_stud/.test(value)) return "gtm";
  if (/negative|contradiction|adversarial/.test(value)) {
    return "contradiction";
  }
  if (/review|complaint|risk/.test(value)) return "risks";
  if (/behavior|buyer_voice|demand/.test(value)) return "behavior_demand";
  return "customer_pain";
}

function insufficientEvidenceArtifacts(mode: string) {
  return {
    claims: [],
    competitors: [],
    risks: [],
    pricing: {
      model: "Insufficient evidence",
      pricePoint: "Insufficient evidence",
      rationale:
        "No attributable pricing or willingness-to-pay evidence survived validation.",
      firstOffer:
        "Unavailable — evidence gap: no accepted evidence supports a first offer.",
      targetCustomers: null,
      sourceIds: [],
    },
    mvp: {
      outcome:
        "Unavailable — evidence gap: no grounded MVP outcome was established.",
      buildEstimate: "Not estimated",
      buildComplexity: null,
      scope: [
        "Unavailable — evidence gap: no grounded MVP scope was established.",
      ],
      exclusions: [
        "Unavailable — evidence gap: no grounded scope exclusions were established.",
      ],
    },
    launch: {
      firstCustomerChannel:
        "Unavailable — evidence gap: no reachable customer channel was established.",
      outreachMessage:
        "Unavailable — evidence gap: no grounded outreach message was established.",
      successMetric:
        "Unavailable — evidence gap: no grounded success metric was established.",
      weekOne: [
        "Unavailable — evidence gap: no grounded validation sequence was established.",
      ],
      firstTen: [
        "Unavailable — evidence gap: no grounded early-customer strategy was established.",
      ],
    },
    adversarial: {
      outcome: "InsufficientEvidence",
      severity: "None",
      objection:
        "No proposition-specific conclusion can be supported from the accepted evidence.",
      sourceIds: [],
    },
    contradictions: [],
    specialists: mode === "full_validation"
      ? SPECIALIST_NAMES.map((name) => ({
        name,
        direction: "Insufficient",
        assessment: "Insufficient evidence",
        findings: ["Insufficient evidence"],
        evidenceSourceIds: [],
        opposingEvidenceSourceIds: [],
        confidence: "Insufficient",
        relevantBriefDimensions: [],
        unresolvedGaps: [
          "No attributable evidence survived validation for this specialist desk.",
        ],
      }))
      : [],
    targetSegments: [],
    willingnessToPay: {
      finding: "Insufficient evidence",
      strength: "Insufficient",
      evidenceSourceIds: [],
    },
    marketContext: { summary: "Insufficient evidence", metrics: [] },
    gtmFindings: [],
  };
}

async function persistArtifacts(
  db: any,
  opportunityId: string,
  parsed: any,
  sourceIdToEvidence: Map<string, string>,
  validClaims: any[],
  researchBrief: CanonicalResearchBrief,
) {
  const evidenceIds = (ids: unknown) =>
    Array.isArray(ids)
      ? [
        ...new Set(ids.flatMap((id) =>
          sourceIdToEvidence.get(String(id))
            ? [sourceIdToEvidence.get(String(id))]
            : []
        )),
      ]
      : [];
  for (const competitor of parsed.competitors || []) {
    const { sourceIds: cited, ...values } = competitor;
    const refs = evidenceIds(cited);
    if (refs.length) {
      const citedSourceIds = new Set((cited || []).map(String));
      const pricingClaims = validClaims.filter((claim) =>
        citedSourceIds.has(String(claim.sourceId)) &&
        claim.evidenceTopic === "pricing"
      );
      const pricingValidations = pricingClaims.map((claim) =>
        validateNumericClaim({
          narrativeValue: String(values.pricing || ""),
          sourceText: String(claim.sourceText || ""),
          sourceUrl: String(claim.sourceUrl || ""),
          claimType: /(?:-|–|—|\bto\b)/i.test(String(values.pricing || ""))
            ? "price_range"
            : "price",
          sourceClass: `${claim.sourceClass || ""} ${claim.pageType || ""}`,
        })
      );
      const pricingSupported =
        !numericTokensPresent(String(values.pricing || "")) ||
        pricingValidations.some((validation) =>
          validation.status === "verified"
        );
      const classification = classifyCompetitor(
        values,
        researchBrief,
        pricingClaims,
      );
      await db.from("competitors").upsert({
        opportunity_id: opportunityId,
        ...values,
        classification: classification.classification,
        comparability: classification.comparability,
        pricing: pricingSupported ? values.pricing : "Insufficient evidence",
        evidence_ids: refs,
        verification_status: classification.classification === "adjacent"
          ? "adjacent_alternative"
          : "live_verified_competitor",
        verified_at: new Date().toISOString(),
      }, { onConflict: "opportunity_id,name" });
    }
  }
  for (const risk of parsed.risks || []) {
    const { sourceIds: cited, ...values } = risk;
    const refs = evidenceIds(cited);
    if (refs.length) {
      await db.from("risks").upsert({
        opportunity_id: opportunityId,
        ...values,
        evidence_ids: refs,
      }, { onConflict: "opportunity_id,category,description" });
    }
  }
  const pricingEvidenceIds = evidenceIds(parsed.pricing.sourceIds);
  await db.from("pricing_models").upsert({
    opportunity_id: opportunityId,
    model: pricingEvidenceIds.length
      ? parsed.pricing.model
      : "Insufficient evidence",
    price_point: pricingEvidenceIds.length
      ? parsed.pricing.pricePoint
      : "Insufficient evidence",
    rationale: pricingEvidenceIds.length
      ? parsed.pricing.rationale
      : "No accepted pricing or willingness-to-pay evidence supports a value.",
    first_offer: parsed.pricing.firstOffer,
    target_customers: null,
    evidence_ids: pricingEvidenceIds,
  }, { onConflict: "opportunity_id" });
  const { data: mvp } = await db.from("mvp_plans").upsert({
    opportunity_id: opportunityId,
    outcome: parsed.mvp.outcome,
    build_estimate: parsed.mvp.buildEstimate,
    build_complexity: parsed.mvp.buildComplexity,
  }, { onConflict: "opportunity_id" }).select("id").single();
  if (mvp) {
    await db.from("mvp_scope_items").delete().eq("mvp_plan_id", mvp.id);
    await db.from("mvp_scope_items").insert([
      ...(parsed.mvp.scope || []).map((description: string) => ({
        mvp_plan_id: mvp.id,
        item_type: "Scope",
        description,
      })),
      ...(parsed.mvp.exclusions || []).map((description: string) => ({
        mvp_plan_id: mvp.id,
        item_type: "Exclusion",
        description,
      })),
    ]);
  }
  const { data: launch } = await db.from("launch_plans").upsert({
    opportunity_id: opportunityId,
    first_customer_channel: parsed.launch.firstCustomerChannel,
    outreach_message: parsed.launch.outreachMessage,
    success_metric: parsed.launch.successMetric,
  }, { onConflict: "opportunity_id" }).select("id").single();
  if (launch) {
    await db.from("launch_strategies").delete().eq("launch_plan_id", launch.id);
    await db.from("launch_strategies").insert([
      ...(parsed.launch.weekOne || []).map((description: string) => ({
        launch_plan_id: launch.id,
        strategy_type: "WeekOne",
        description,
      })),
      ...(parsed.launch.firstTen || []).map((description: string) => ({
        launch_plan_id: launch.id,
        strategy_type: "FirstTen",
        description,
      })),
    ]);
  }
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)].map((byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function normalizeClaimIdentity(value: unknown) {
  return String(value || "").toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9%$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function factorIdsForClaim(topic: unknown, signal: unknown) {
  const byTopic: Record<string, string[]> = {
    customer_pain: ["painSeverity", "purchaseUrgency", "retentionPotential"],
    behavior_demand: [
      "painSeverity",
      "purchaseUrgency",
      "buyerReachability",
      "retentionPotential",
      "distributionClarity",
    ],
    willingness_to_pay: ["willingnessToPay", "speedToFirstRevenue"],
    competitors: ["competitionGap"],
    alternatives: ["competitionGap", "retentionPotential"],
    pricing: ["speedToFirstRevenue"],
    risks: [
      "mvpSpeed",
      "platformDependencyRisk",
      "regulatoryRisk",
    ],
    market_context: ["buyerReachability", "regulatoryRisk"],
    gtm: ["buyerReachability", "distributionClarity"],
    contradiction: ["competitionGap", "painSeverity", "purchaseUrgency"],
    segments: ["buyerReachability", "distributionClarity"],
  };
  const mapped = byTopic[String(topic || "")] || [];
  if (mapped.length) return mapped;
  if (signal === "Risk") {
    return ["mvpSpeed", "platformDependencyRisk", "regulatoryRisk"];
  }
  if (signal === "Pricing") return ["speedToFirstRevenue"];
  if (signal === "Demand") return ["buyerReachability", "distributionClarity"];
  return ["painSeverity"];
}

function validRetrievalDate(value: unknown) {
  const parsed = typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`)
    : new Date();
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.getTime() > Date.now() + 86_400_000
  ) {
    throw new Error("Retrieved source date is invalid or in the future.");
  }
  return parsed.toISOString().slice(0, 10);
}

function validateStructuredValue(value: unknown, signalType: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (
    /^(?:n\/?a|none|not (?:available|applicable|specified|stated|provided)|unknown|unavailable|no numeric value)$/i
      .test(raw)
  ) return null;
  const numericMatch = raw.match(/-?\d[\d,.]*/);
  if (!numericMatch) return null;
  const numericValue = Number(numericMatch[0].replace(/,/g, ""));
  if (!Number.isFinite(numericValue) || numericValue < 0) {
    throw new Error(`Numeric claim is invalid: ${raw}`);
  }
  const currency = normalizeCurrency(raw);
  if (signalType === "Pricing" && !currency) {
    throw new Error(`Pricing claim is missing a supported currency: ${raw}`);
  }
  return {
    raw,
    numericValue,
    currency: currency?.currency || null,
    billingPeriod: currency ? normalizeBillingPeriod(raw) : null,
  };
}

function claimSupportedByPage(excerpt: string, pageText: string) {
  const normalize = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9$€£₹]+/g, " ").replace(/\s+/g, " ")
      .trim();
  const claim = normalize(excerpt);
  const page = normalize(pageText);
  if (!claim || !page) return false;
  if (page.includes(claim)) return true;
  const stop = new Set([
    "about",
    "after",
    "also",
    "and",
    "are",
    "been",
    "for",
    "from",
    "have",
    "into",
    "that",
    "the",
    "their",
    "this",
    "with",
  ]);
  const claimTokens = [
    ...new Set(
      claim.split(" ").filter((token) => token.length >= 3 && !stop.has(token)),
    ),
  ];
  if (claimTokens.length < 3) return false;
  const matched = claimTokens.filter((token) => page.includes(token)).length;
  return matched / claimTokens.length >= 0.55;
}

function contradictionExcerptMatchesBrief(
  brief: CanonicalResearchBrief,
  testedClaim: string,
  excerpt: string,
) {
  const relevance = assessSemanticRelevance(
    brief,
    `${testedClaim}\n${excerpt}`,
    "contradiction",
  );
  const stop = new Set([
    "about",
    "after",
    "also",
    "and",
    "are",
    "for",
    "from",
    "have",
    "into",
    "that",
    "the",
    "their",
    "this",
    "with",
    "would",
    "could",
    "should",
    "product",
    "service",
  ]);
  const claimTokens = [
    ...new Set(
      testedClaim.toLowerCase().split(/[^a-z0-9]+/).filter((token) =>
        token.length >= 4 && !stop.has(token)
      ),
    ),
  ];
  const normalizedExcerpt = excerpt.toLowerCase();
  const overlap = claimTokens.filter((token) =>
    normalizedExcerpt.includes(token)
  );
  return relevance.acceptanceDecision === "accepted_core" &&
    relevance.matchedDimensions.length >= 2 &&
    claimTokens.length >= 3 &&
    overlap.length >= Math.min(3, claimTokens.length);
  /*
  const claim = testedClaim.toLowerCase();
  const evidence = excerpt.toLowerCase();
  const concepts = [
    {
      claim: /\b(?:account|login|sign[- ]?in)\b/,
      evidence: /\b(?:account|login|sign[- ]?in|magic link|no[- ]account)\b/,
    },
    {
      claim: /\b(?:audit|attributable|timestamp|history|who approved)\b/,
      evidence:
        /\b(?:audit|attributable|accountability|timestamp|immutable|history|who approved|who decided)\b/,
    },
    {
      claim: /\b(?:sign[- ]?off|approval|approve)\b/,
      evidence: /\b(?:sign[- ]?off|approval|approve|decision)\b/,
    },
    {
      claim: /\b(?:dispute|scope creep|rework)\b/,
      evidence: /\b(?:dispute|scope creep|rework)\b/,
    },
    {
      claim: /\b(?:price|pricing|cost|pay|paid)\b/,
      evidence: /(?:[$€£₹]\s?\d|\bprice|\bpricing|\bcost|\bpay|\bpaid)/,
    },
  ];
  const required = concepts.filter((concept) => concept.claim.test(claim));
  return required.length > 0 &&
    required.every((concept) => concept.evidence.test(evidence));
  */
}

function propositionContradictionExcerpt(
  pageText: string,
  role: "support" | "challenge",
) {
  const anchors = role === "support"
    ? [
      /\bwho approved\b/i,
      /\blost audit trails?\b/i,
      /\bnothing is tracked\b/i,
      /\bno formal approval\b/i,
    ]
    : [
      /\bimmutable ledger\b/i,
      /\bcaptures every decision\b/i,
      /\bapproval history\b/i,
      /\baudit trails?\b/i,
    ];
  for (const anchor of anchors) {
    const match = anchor.exec(pageText);
    if (!match) continue;
    const start = Math.max(0, match.index - 320);
    const end = Math.min(pageText.length, match.index + match[0].length + 420);
    const excerpt = pageText.slice(start, end).replace(/\s+/g, " ").trim();
    if (excerpt) return excerpt;
  }
  return "";
}

function numericTokensPresent(value: string) {
  return /\d/.test(value);
}

function numericClaimType(claim: any): NumericClaimType {
  const value = String(claim.numericValue || "");
  if (claim.signalType === "Pricing") {
    return /(?:-|–|—|\bto\b)/i.test(value) ? "price_range" : "price";
  }
  if (/%/.test(value)) return "percentage";
  if (/\b(?:19|20)\d{2}\b/.test(value)) return "date";
  if (claim.evidenceTopic === "market_context") return "market_metric";
  return "count";
}

function classifyCompetitor(
  competitor: any,
  brief: CanonicalResearchBrief,
  citedClaims: any[],
) {
  const text =
    `${competitor.name} ${competitor.target} ${competitor.positioning} ${competitor.gap}`
      .toLowerCase();
  const approvalBrief = /approval|sign-?off|audit trail/i.test(
    `${brief.exactProductProposition} ${brief.directCompetitorCategory}`,
  );
  const knownAdjacent =
    /\b(docusign|dropbox sign|hellosign|adobe sign|pandadoc)\b/i.test(text);
  const workaround = /\b(email|spreadsheet|slack|teams|shared drive|manual)\b/i
    .test(text);
  const dimensions = new Set(
    citedClaims.flatMap((claim) => claim.matchedBriefDimensions || []),
  );
  const comparability = {
    targetBuyer: dimensions.has("target_buyer") ||
      brief.targetBuyer.toLowerCase().split(/\W+/).filter((word) =>
        word.length > 4
      ).some((word) => text.includes(word)),
    workflow: dimensions.has("user_workflow") ||
      /\b(client|customer).{0,40}\b(approval|sign[- ]?off)|\b(approval|sign[- ]?off).{0,40}\b(client|customer)/i
        .test(text),
    approvalModel: !approvalBrief ||
      /\b(approval|review|sign[- ]?off|decision)\b/i.test(text),
    attributionAudit: !approvalBrief ||
      /\b(audit|attribut|history|timestamp|who approved|decision log)\b/i.test(
        text,
      ),
    productUseCase: dimensions.has("proposed_solution") ||
      dimensions.has("market_category") ||
      brief.terminology.filter((term) => term.length >= 5).some((term) =>
        text.includes(term.toLowerCase())
      ),
  };
  const directlyComparable = comparability.targetBuyer &&
    comparability.workflow &&
    comparability.productUseCase &&
    comparability.approvalModel &&
    comparability.attributionAudit &&
    !knownAdjacent;
  const classification = workaround
    ? "workflow_workaround"
    : directlyComparable
    ? "direct"
    : knownAdjacent || comparability.approvalModel
    ? "adjacent"
    : "substitute";
  return { classification, comparability };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values.filter(Boolean))];
}

function cleanSpecialistText(value: unknown) {
  return String(value || "")
    .replace(/\bSOURCE_ID\s*:?\s*[0-9a-f-]{8,}\b/gi, "")
    .replace(/\bsource[_\s-]?id\s*:?\s*[^\s,;.)]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function genuineChallengeLanguage(value: string) {
  return /\b(?:unnecessary|low priority|rarely|occasional|workaround|free alternative|resistan|switching|failed|abandoned|saturat|already use|good enough|not worth|no need)\b/i
    .test(value);
}

function safeDomain(value: string) {
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}
