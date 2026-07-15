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
export function renderJson(input: ExportBundleInput) {
  return JSON.stringify(input.payload, null, 2);
}
export function renderMarkdown(input: ExportBundleInput) {
  const rows = input.breakdowns.map((b) =>
    `| ${b.criterion} | ${b.score} | ${b.weight} | ${
      b.evidenceIds.join(", ")
    } |`
  ).join("\n");
  return `# ${input.ideaName}\n\n**Score:** ${input.total}/100  \n**Verdict:** ${input.verdict}  \n**Confidence:** ${input.confidence}/100\n\n## Executive summary\n\n${input.executiveSummary}\n\n## Score breakdown\n\n| Criterion | Score | Weight | Evidence IDs |\n|---|---:|---:|---|\n${rows}\n\n## Methodology\n\n${input.methodology}\n`;
}
export function renderCsv(input: ExportBundleInput) {
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
  ].map(csvCell).join(",");
  return [
    header,
    ...input.breakdowns.map((b) =>
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
  const lines = [
    `SignalFit: ${input.ideaName}`,
    `Score: ${input.total}/100 | Verdict: ${input.verdict} | Confidence: ${input.confidence}/100`,
    "",
    ...wrap(input.executiveSummary),
    "",
    "12-factor breakdown:",
    ...input.breakdowns.map((b) =>
      `${b.criterion}: ${b.score} (weight ${b.weight}) [${
        b.evidenceIds.join(", ")
      }]`
    ),
    "",
    "Methodology:",
    ...wrap(input.methodology),
  ].slice(0, 48);
  const stream = `BT\n/F1 9 Tf\n42 760 Td\n12 TL\n${
    lines.map((line, i) => `${i ? "T* " : ""}(${pdfEscape(line)}) Tj`).join(
      "\n",
    )
  }\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${
      encoder.encode(stream).length
    } >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
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
