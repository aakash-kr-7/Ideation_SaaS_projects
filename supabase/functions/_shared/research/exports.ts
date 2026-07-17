export interface ExportBundleInput {
  runId: string;
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

const encoder = new TextEncoder();
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
  specialistDisputes?: Array<{
    specialist?: string;
    specialistDirection?: string;
    checkerDirection?: string;
    disputed?: boolean;
    reason?: string;
  }>;
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
  const disputes = integrity.specialistDisputes || [];
  const flags = integrity.reasoningFlags || [];
  const disputeRows = disputes.length
    ? disputes.map((item) =>
      `- **${item.specialist || "Unknown specialist"}:** ${
        item.disputed ? "Disputed" : "Reproduced"
      } - ${item.reason || "No explanation recorded."}`
    ).join("\n")
    : "- None recorded.";
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

## Independent specialist checks

${disputeRows}

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
    "specialist_disputes_json",
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
  return [
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
        JSON.stringify(integrity.specialistDisputes || []),
        JSON.stringify(integrity.adversarialGate || null),
        JSON.stringify(integrity.citationValidation || null),
        JSON.stringify(integrity.decisionIntegrity || null),
      ].map(csvCell).join(",")
    ),
  ].join("\r\n");
}
function pdfEscape(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(
    ")",
    "\\)",
  ).replace(/[^\x20-\x7E]/g, "?");
}
function wrap(value: string, width = 92) {
  const words = value.replace(/\s+/g, " ").trim().split(" "),
    lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (`${line} ${word}`.trim().length > width) {
      if (line) lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines;
}
export function renderPdf(input: ExportBundleInput): Uint8Array {
  const integrityLines = integrityMarkdown(input.payload)
    .replaceAll("## ", "")
    .replaceAll("**", "")
    .split("\n")
    .filter((line) => line.trim())
    .flatMap((line) => wrap(line.replace(/^- /, "")));
  const lines = [
    `SignalFit: ${input.ideaName}`,
    `Run ID: ${input.runId}`,
    `Score: ${input.total}/100 | Verdict: ${input.verdict} | Confidence: ${input.confidence}/100`,
    "",
    ...wrap(input.executiveSummary),
    "",
    "12-factor breakdown:",
    ...input.breakdowns.flatMap((b) => [
      ...wrap(`${b.criterion}: ${b.score} (weight ${b.weight})`),
      ...wrap(`Evidence IDs: ${b.evidenceIds.join(", ") || "None"}`),
      ...wrap(`Notes: ${b.note}`),
    ]),
    "",
    "Methodology:",
    ...wrap(input.methodology),
    "",
    ...integrityLines,
  ];
  const pageBodies: string[][] = [];
  for (let i = 0; i < lines.length; i += 48) {
    pageBodies.push(lines.slice(i, i + 48));
  }
  const pageCount = pageBodies.length || 1;
  const fontId = 3 + pageCount * 2;
  const pageIds = pageBodies.map((_, index) => 3 + index * 2);
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${
      pageIds.map((id) => `${id} 0 R`).join(" ")
    }] /Count ${pageCount} >>`,
  ];
  pageBodies.forEach((body, index) => {
    const pageId = pageIds[index], contentId = pageId + 1;
    const pageLines = [
      `Page ${index + 1} of ${pageCount}`,
      ...(index ? ["SignalFit report (continued)", ""] : []),
      ...body,
    ];
    const stream = `BT\n/F1 9 Tf\n42 760 Td\n12 TL\n${
      pageLines.map((line, lineIndex) =>
        `${lineIndex ? "T* " : ""}(${pdfEscape(line)}) Tj`
      ).join("\n")
    }\nET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      `<< /Length ${
        encoder.encode(stream).length
      } >>\nstream\n${stream}\nendstream`,
    );
  });
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let pdf = "%PDF-1.4\n", offset = encoder.encode(pdf).length;
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(offset);
    const part = `${i + 1} 0 obj\n${obj}\nendobj\n`;
    pdf += part;
    offset += encoder.encode(part).length;
  });
  const xref = offset;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${
    offsets.slice(1).map((n) => `${String(n).padStart(10, "0")} 00000 n `).join(
      "\n",
    )
  }\ntrailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(pdf);
}
export async function sha256(data: Uint8Array) {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const hash = await crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
