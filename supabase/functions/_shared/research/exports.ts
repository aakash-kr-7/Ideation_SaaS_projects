import { renderPremiumPdf } from "./pdf-report.ts";

export interface ExportBundleInput {
  runId: string;
  reportMode?: "quick_scan" | "full_validation";
  ideaName: string;
  total: number;
  verdict: string;
  confidence: number;
  executiveSummary: string;
  methodology: string;
  breakdowns: Array<
    {
      criterion: string;
      score: number;
      weight: number;
      note: string;
      evidenceIds: string[];
    }
  >;
  payload: unknown;
}

const csvCell = (value: unknown) =>
  `"${String(value ?? "").replaceAll('"', '""')}"`;

type ReportIntegrityPayload = {
  opportunity?: {
    evidence?: Array<{ id?: string; title?: string; source?: string; url?: string }>;
  };
  decisionProduct?: {
    headline?: string;
    evidenceConfidence?: { band?: string; score?: number; explanation?: string; missingEvidence?: string[] };
    sections?: Array<{ title?: string; summary?: string; statements?: Array<{ kind?: string; text?: string; evidenceIds?: string[]; sourceUrls?: string[] }> }>;
    experiments?: Array<{ name?: string; hypothesis?: string; targetParticipant?: string; recruitmentMethod?: string; sampleSize?: string; method?: string; successCriterion?: string; failureCriterion?: string; duration?: string; decisionUnlocked?: string }>;
    specialistOutputs?: Array<{ name?: string; keyFindings?: string[]; evidenceIds?: string[]; opposingEvidenceIds?: string[]; confidence?: string; relevantBriefDimensions?: string[]; unresolvedGaps?: string[]; decisionImplication?: string }>;
    charts?: Array<{ key?: string; title?: string; sourceData?: unknown; evidenceIds?: string[]; sourceExplanation?: string; unavailable?: boolean }>;
  };
  reasoningFlags?: Array<
    {
      type?: string;
      severity?: string;
      message?: string;
      evidenceIds?: string[];
    }
  >;
  adversarialGate?: {
    outcome?: string;
    severity?: string;
    objection?: string;
    evidence_ids?: string[];
    unresolved?: boolean;
  };
  citationValidation?: {
    valid?: boolean;
    claimsChecked?: number;
    claimsRemoved?: number;
    invalidClaims?: unknown[];
  };
  decisionIntegrity?: {
    deterministicVerdict?: string;
    effectiveVerdict?: string;
    finalJudgeWrittenVerdict?: string;
    finalJudgeScoreMismatch?: boolean;
    finalJudgeEffectiveMismatch?: boolean;
    adversarialDowngrade?: boolean;
    reason?: string | null;
  };
};

function integrityPayload(payload: unknown): ReportIntegrityPayload {
  return payload && typeof payload === "object"
    ? payload as ReportIntegrityPayload
    : {};
}
function citationLabels(payload: unknown) {
  const evidence = integrityPayload(payload).opportunity?.evidence || [];
  return new Map(evidence.map((item, index) => [
    String(item.id || ""),
    `[S${index + 1}] ${item.title || item.source || "Evidence source"}${item.source ? ` (${item.source})` : ""}`,
  ]));
}
function humanCitations(ids: string[] | undefined, labels: Map<string, string>, empty = "Insufficient evidence") {
  if (!ids?.length) return empty;
  const values = ids.map((id) => labels.get(String(id))).filter(Boolean);
  return values.length ? values.join("; ") : empty;
}
function decisionProductMarkdown(payload: unknown) {
  const product = integrityPayload(payload).decisionProduct;
  if (!product) return "";
  const labels = citationLabels(payload);
  const sections = (product.sections || []).map((section, index) => {
    const statements = (section.statements || []).map((statement) => {
      const citations = statement.evidenceIds?.length
        ? ` Evidence: ${humanCitations(statement.evidenceIds, labels)}.`
        : statement.sourceUrls?.length
        ? ` Sources: ${statement.sourceUrls.join(", ")}.`
        : "";
      return `- **${statement.kind || "Finding"}:** ${statement.text || ""}${citations}`;
    }).join("\n");
    return `## ${index + 1}. ${section.title || "Decision section"}\n\n${section.summary || ""}\n\n${statements}`;
  }).join("\n\n");
  const experiments = (product.experiments || []).map((item, index) =>
    `### ${index + 1}. ${item.name}\n\n- Hypothesis: ${item.hypothesis}\n- Target participant: ${item.targetParticipant}\n- Recruitment: ${item.recruitmentMethod}\n- Sample size: ${item.sampleSize}\n- Method: ${item.method}\n- Duration: ${item.duration}\n- Pass: ${item.successCriterion}\n- Fail: ${item.failureCriterion}\n- Decision unlocked: ${item.decisionUnlocked}`
  ).join("\n\n");
  const specialists = (product.specialistOutputs || []).map((item) =>
    `### ${item.name}\n\n- Confidence: ${item.confidence}\n- Findings: ${(item.keyFindings || []).join("; ")}\n- Evidence: ${humanCitations(item.evidenceIds, labels)}\n- Relevant brief dimensions: ${(item.relevantBriefDimensions || []).join(", ") || "Not established"}\n- Opposing evidence: ${humanCitations(item.opposingEvidenceIds, labels, "None")}\n- Unresolved gaps: ${(item.unresolvedGaps || []).join("; ") || "None"}\n- Decision implication: ${item.decisionImplication}`
  ).join("\n\n");
  const charts = (product.charts || []).map((item) =>
    `- **${item.title || item.key}:** ${item.unavailable ? "Unavailable. " : ""}${item.sourceExplanation} Evidence: ${humanCitations(item.evidenceIds, labels, "none")}; data: ${JSON.stringify(item.sourceData || {})}`
  ).join("\n");
  return `# Decision dossier\n\n${product.headline || ""}\n\n**Evidence Confidence:** ${product.evidenceConfidence?.band || "Not recorded"}${typeof product.evidenceConfidence?.score === "number" ? ` (${product.evidenceConfidence.score})` : ""} — ${product.evidenceConfidence?.explanation || ""}\n\n${sections}\n\n## Validation experiments\n\n${experiments}\n\n${specialists ? `## Specialist outputs\n\n${specialists}\n\n` : ""}## Chart provenance\n\n${charts}`;
}

function integrityMarkdown(payload: unknown) {
  const integrity = integrityPayload(payload);
  const labels = citationLabels(payload);
  const decision = integrity.decisionIntegrity;
  const gate = integrity.adversarialGate;
  const citation = integrity.citationValidation;
  const flags = integrity.reasoningFlags || [];
  const flagRows = flags.length
    ? flags.map((flag) =>
      `- **${flag.severity || "Info"} / ${flag.type || "IntegrityFlag"}:** ${
        flag.message || "No message recorded."
      }${
        flag.evidenceIds?.length
          ? ` (Evidence: ${humanCitations(flag.evidenceIds, labels)})`
          : ""
      }`
    ).join("\n")
    : "- None recorded.";
  return `## Decision integrity

- Deterministic verdict: ${decision?.deterministicVerdict || "Not recorded"}
- Effective verdict: ${decision?.effectiveVerdict || "Not recorded"}
- Final Judge written verdict: ${
    decision?.finalJudgeWrittenVerdict || "Not recorded"
  }
- Score/narrative mismatch: ${decision?.finalJudgeScoreMismatch ? "Yes" : "No"}
- Effective-verdict mismatch: ${
    decision?.finalJudgeEffectiveMismatch ? "Yes" : "No"
  }
- Adversarial downgrade: ${decision?.adversarialDowngrade ? "Yes" : "No"}
${decision?.reason ? `- Decision reason: ${decision.reason}\n` : ""}
## Adversarial gate

- Outcome: ${gate?.outcome || "Not recorded"}
- Severity: ${gate?.severity || "Not recorded"}
- Unresolved: ${gate?.unresolved ? "Yes" : "No"}
- Objection/certification: ${gate?.objection || "Not recorded"}
- Evidence: ${humanCitations(gate?.evidence_ids, labels, "None")}

## Citation validation

- Valid: ${citation?.valid ? "Yes" : "No"}
- Claims checked: ${citation?.claimsChecked ?? "Not recorded"}
- Claims removed: ${citation?.claimsRemoved ?? "Not recorded"}
- Invalid claims: ${JSON.stringify(citation?.invalidClaims || [])}

## Integrity flags

${flagRows}`;
}
export function renderJson(input: ExportBundleInput) {
  return JSON.stringify(input.payload, null, 2);
}
export function renderMarkdown(input: ExportBundleInput) {
  const labels = citationLabels(input.payload);
  const rows = input.breakdowns.map((b) =>
    `| ${b.criterion} | ${b.score} | ${b.weight} | ${
      humanCitations(b.evidenceIds, labels, "None")
    } |`
  ).join("\n");
  return `# ${input.ideaName}\n\n**Run ID:** ${input.runId}  \n**Score:** ${input.total}/100  \n**Verdict:** ${input.verdict}  \n**Confidence:** ${input.confidence}/100\n\n## Executive summary\n\n${input.executiveSummary}\n\n${decisionProductMarkdown(input.payload)}\n\n## Score breakdown\n\n| Criterion | Score | Weight | Evidence |\n|---|---:|---:|---|\n${rows}\n\n## Methodology\n\n${input.methodology}\n\n${
    integrityMarkdown(input.payload)
  }\n`;
}
export function renderCsv(input: ExportBundleInput) {
  const integrity = integrityPayload(input.payload);
  const header = [
    "run_id",
    "idea_name",
    "total",
    "verdict",
    "confidence",
    "criterion",
    "factor_score",
    "weight",
    "evidence_ids",
    "note",
    "reasoning_flags_json",
    "adversarial_gate_json",
    "citation_validation_json",
    "decision_integrity_json",
    "decision_product_json",
    "evidence_json",
    "chart_catalog_json",
  ].map(csvCell).join(",");
  const rows = input.breakdowns.length ? input.breakdowns : [{
    criterion: "",
    score: 0,
    weight: 0,
    note: "",
    evidenceIds: [],
  }];
  return `\uFEFF${[
    header,
    ...rows.map((b) =>
      [
        input.runId,
        input.ideaName,
        input.total,
        input.verdict,
        input.confidence,
        b.criterion,
        b.score,
        b.weight,
        b.evidenceIds.join("|"),
        b.note,
        JSON.stringify(integrity.reasoningFlags || []),
        JSON.stringify(integrity.adversarialGate || null),
        JSON.stringify(integrity.citationValidation || null),
        JSON.stringify(integrity.decisionIntegrity || null),
        JSON.stringify(integrity.decisionProduct || null),
        JSON.stringify((input.payload as any)?.opportunity?.evidence || []),
        JSON.stringify(integrity.decisionProduct?.charts || []),
      ].map(csvCell).join(",")
    ),
  ].join("\r\n")}`;
}
export function renderPdf(input: ExportBundleInput): Uint8Array {
  return renderPremiumPdf(input);
}
export async function sha256(data: Uint8Array) {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const hash = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
