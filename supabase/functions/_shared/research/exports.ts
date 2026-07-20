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

function integrityMarkdown(payload: unknown) {
  const integrity = integrityPayload(payload);
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
          ? ` (Evidence: ${flag.evidenceIds.join(", ")})`
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
- Evidence: ${gate?.evidence_ids?.join(", ") || "None"}

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
  const rows = input.breakdowns.map((b) =>
    `| ${b.criterion} | ${b.score} | ${b.weight} | ${
      b.evidenceIds.join(", ")
    } |`
  ).join("\n");
  return `# ${input.ideaName}\n\n**Run ID:** ${input.runId}  \n**Score:** ${input.total}/100  \n**Verdict:** ${input.verdict}  \n**Confidence:** ${input.confidence}/100\n\n## Executive summary\n\n${input.executiveSummary}\n\n## Score breakdown\n\n| Criterion | Score | Weight | Evidence IDs |\n|---|---:|---:|---|\n${rows}\n\n## Methodology\n\n${input.methodology}\n\n${
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
