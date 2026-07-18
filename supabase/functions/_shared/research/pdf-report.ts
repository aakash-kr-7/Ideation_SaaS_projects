import type { ExportBundleInput } from "./exports.ts";

const encoder = new TextEncoder();
const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const MARGIN = 44;

type Color = readonly [number, number, number];
const COLORS = {
  navy: [0.063, 0.165, 0.263] as Color,
  midnight: [0.043, 0.122, 0.2] as Color,
  teal: [0.059, 0.463, 0.431] as Color,
  tealDark: [0.043, 0.373, 0.349] as Color,
  tealPale: [0.882, 0.953, 0.941] as Color,
  ivory: [0.969, 0.965, 0.949] as Color,
  white: [1, 1, 1] as Color,
  carbon: [0.09, 0.125, 0.2] as Color,
  slate: [0.357, 0.4, 0.478] as Color,
  mist: [0.851, 0.871, 0.906] as Color,
  mistPale: [0.93, 0.94, 0.947] as Color,
  amber: [0.761, 0.463, 0.086] as Color,
  amberPale: [0.969, 0.925, 0.843] as Color,
  blue: [0.145, 0.388, 0.922] as Color,
  red: [0.63, 0.18, 0.2] as Color,
} as const;

type PdfEvidence = {
  id?: string;
  source?: string;
  sourceType?: string;
  title?: string;
  snippet?: string;
  url?: string;
  signal?: string;
  strength?: string;
  evidenceFamily?: string;
  researchPass?: number;
  sourceTier?: number;
  sourceTierReason?: string | null;
  excluded?: boolean;
  disconfirming?: boolean;
  painPoint?: string | null;
  independentSourceCount?: number;
  independentDomainCount?: number;
};

type PdfPass = {
  pass_number?: number;
  objective?: string;
  query_count?: number;
  evidence_count?: number;
  sufficient?: boolean;
  coverage_gaps?: string[];
  budget_limited?: boolean;
  status?: string;
};

type PdfPayload = {
  generatedAt?: string;
  executiveSummary?: string;
  methodology?: string;
  opportunity?: {
    name?: string;
    oneLiner?: string;
    targetCustomer?: string;
    corePain?: string;
    market?: string;
    evidence?: PdfEvidence[];
    scorecard?: {
      total?: number;
      confidence?: number;
      verdict?: string;
      deterministicVerdict?: string;
      decisionStatus?: string;
    };
  };
  retrieval?: {
    passes?: PdfPass[];
    retrieval_sufficient?: boolean;
    retrieval_coverage_gaps?: string[];
    retrieval_budget_limited?: boolean;
  };
  reasoningFlags?: Array<{
    type?: string;
    severity?: string;
    message?: string;
    evidenceIds?: string[];
  }>;
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

function payloadFor(value: unknown): PdfPayload {
  return value && typeof value === "object" ? value as PdfPayload : {};
}

function clean(value: unknown) {
  return String(value ?? "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pdfEscape(value: unknown) {
  return clean(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function rgb(color: Color) {
  return color.map((value) => value.toFixed(3)).join(" ");
}

function label(value: unknown) {
  return clean(value).replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}

function truncate(value: unknown, length: number) {
  const text = clean(value);
  return text.length <= length
    ? text
    : `${text.slice(0, Math.max(0, length - 3)).trim()}...`;
}

function wrap(value: unknown, maxChars: number) {
  const words = clean(value).split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (word.length > maxChars && !line) {
      for (let index = 0; index < word.length; index += maxChars) {
        lines.push(word.slice(index, index + maxChars));
      }
      continue;
    }
    const candidate = `${line} ${word}`.trim();
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

class PdfPage {
  commands: string[] = [];
  background: Color;

  constructor(background: Color = COLORS.ivory) {
    this.background = background;
    this.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, background);
  }

  rect(
    x: number,
    top: number,
    width: number,
    height: number,
    color: Color,
    stroke?: Color,
    radius = 0,
  ) {
    const y = PAGE_HEIGHT - top - height;
    if (radius <= 0) {
      this.commands.push(`${rgb(color)} rg ${x} ${y} ${width} ${height} re f`);
      if (stroke) {
        this.commands.push(
          `${rgb(stroke)} RG 0.7 w ${x} ${y} ${width} ${height} re S`,
        );
      }
      return;
    }
    const r = Math.min(radius, width / 2, height / 2);
    const k = r * 0.55228475;
    const x2 = x + width;
    const y2 = y + height;
    const path = [
      `${x + r} ${y} m`,
      `${x2 - r} ${y} l`,
      `${x2 - r + k} ${y} ${x2} ${y + r - k} ${x2} ${y + r} c`,
      `${x2} ${y2 - r} l`,
      `${x2} ${y2 - r + k} ${x2 - r + k} ${y2} ${x2 - r} ${y2} c`,
      `${x + r} ${y2} l`,
      `${x + r - k} ${y2} ${x} ${y2 - r + k} ${x} ${y2 - r} c`,
      `${x} ${y + r} l`,
      `${x} ${y + r - k} ${x + r - k} ${y} ${x + r} ${y} c h`,
    ].join(" ");
    this.commands.push(`${rgb(color)} rg ${path} f`);
    if (stroke) this.commands.push(`${rgb(stroke)} RG 0.7 w ${path} S`);
  }

  line(
    x1: number,
    top1: number,
    x2: number,
    top2: number,
    color: Color,
    width = 0.7,
  ) {
    this.commands.push(
      `${rgb(color)} RG ${width} w ${x1} ${PAGE_HEIGHT - top1} m ${x2} ${
        PAGE_HEIGHT - top2
      } l S`,
    );
  }

  text(
    value: unknown,
    x: number,
    top: number,
    size = 10,
    font = "F1",
    color: Color = COLORS.carbon,
  ) {
    this.commands.push(
      `BT /${font} ${size} Tf ${rgb(color)} rg 1 0 0 1 ${x} ${
        PAGE_HEIGHT - top - size
      } Tm (${pdfEscape(value)}) Tj ET`,
    );
  }

  wrappedText(
    value: unknown,
    x: number,
    top: number,
    width: number,
    size = 10,
    lineHeight = 14,
    font = "F1",
    color: Color = COLORS.carbon,
    maxLines?: number,
  ) {
    const maxChars = Math.max(8, Math.floor(width / (size * 0.53)));
    const lines = wrap(value, maxChars);
    const visible = typeof maxLines === "number"
      ? lines.slice(0, maxLines)
      : lines;
    visible.forEach((line, index) => {
      const clipped = maxLines && index === visible.length - 1 &&
          lines.length > visible.length
        ? truncate(line, Math.max(4, maxChars - 3))
        : line;
      this.text(clipped, x, top + index * lineHeight, size, font, color);
    });
    return top + visible.length * lineHeight;
  }

  badge(
    value: unknown,
    x: number,
    top: number,
    color = COLORS.teal,
    background = COLORS.tealPale,
  ) {
    const text = clean(value).toUpperCase();
    const width = Math.max(42, text.length * 4.7 + 14);
    this.rect(x, top, width, 17, background, undefined, 8.5);
    this.text(text, x + 7, top + 4.5, 6.7, "F2", color);
    return width;
  }

  bar(
    x: number,
    top: number,
    width: number,
    value: number,
    color = COLORS.teal,
  ) {
    const normalized = Math.max(0, Math.min(100, Number(value) || 0));
    this.rect(x, top, width, 5, COLORS.mistPale, undefined, 2.5);
    if (normalized > 0) {
      this.rect(x, top, width * normalized / 100, 5, color, undefined, 2.5);
    }
  }
}

function addRunningHeader(page: PdfPage, section: string, title: string) {
  page.text("SHOULD", MARGIN, 35, 8, "F2", COLORS.navy);
  page.text("BUILD", MARGIN + 31, 35, 8, "F2", COLORS.teal);
  page.text(
    section.toUpperCase(),
    PAGE_WIDTH - MARGIN - Math.max(70, section.length * 5.2),
    35,
    7,
    "F2",
    COLORS.teal,
  );
  page.line(MARGIN, 54, PAGE_WIDTH - MARGIN, 54, COLORS.mist);
  page.text(title, MARGIN, 78, 25, "F2", COLORS.navy);
}

function buildCover(
  input: ExportBundleInput,
  payload: PdfPayload,
  evidence: PdfEvidence[],
  passes: PdfPass[],
) {
  const page = new PdfPage(COLORS.midnight);
  const reportName = input.reportMode === "quick_scan" ? "QUICK SCAN" : "FULL VALIDATION";
  page.rect(0, 0, 8, PAGE_HEIGHT, COLORS.teal);
  page.text("SHOULD", MARGIN + 8, 43, 10, "F2", COLORS.white);
  page.text("BUILD", MARGIN + 8 + 39, 43, 10, "F2", COLORS.teal);
  page.text(`${reportName} / EVIDENCE REPORT`, MARGIN + 8, 82, 7, "F2", [
    0.49,
    0.77,
    0.73,
  ]);
  const titleBottom = page.wrappedText(
    input.ideaName,
    MARGIN + 8,
    112,
    485,
    31,
    35,
    "F2",
    COLORS.white,
    3,
  );
  page.wrappedText(
    payload.opportunity?.oneLiner || payload.opportunity?.corePain || "",
    MARGIN + 8,
    titleBottom + 14,
    440,
    11,
    16,
    "F3",
    [0.72, 0.79, 0.83],
    3,
  );

  page.rect(MARGIN + 8, 276, 516, 111, [0.055, 0.184, 0.278], [
    0.12,
    0.32,
    0.39,
  ], 10);
  page.text(String(input.total), MARGIN + 28, 294, 38, "F2", COLORS.white);
  page.text("/ 100", MARGIN + 82, 313, 10, "F1", [0.57, 0.68, 0.74]);
  page.text("DETERMINISTIC SCORE", MARGIN + 28, 349, 6.5, "F2", [
    0.49,
    0.77,
    0.73,
  ]);
  page.line(MARGIN + 152, 294, MARGIN + 152, 369, [0.12, 0.29, 0.36]);
  page.text(input.verdict, MARGIN + 174, 300, 19, "F2", COLORS.white);
  page.text(
    `${input.confidence}% evidence confidence`,
    MARGIN + 174,
    334,
    9,
    "F1",
    [0.66, 0.74, 0.79],
  );
  const challenged = payload.decisionIntegrity?.adversarialDowngrade ||
    payload.opportunity?.scorecard?.decisionStatus === "Challenged";
  page.badge(
    challenged ? "Decision challenged" : "Decision integrity passed",
    MARGIN + 174,
    353,
    challenged ? COLORS.amber : COLORS.teal,
    challenged ? [0.28, 0.22, 0.12] : [0.05, 0.25, 0.26],
  );

  page.text("EXECUTIVE READOUT", MARGIN + 8, 426, 7, "F2", [0.49, 0.77, 0.73]);
  page.wrappedText(input.executiveSummary, MARGIN + 8, 449, 500, 13, 19, "F1", [
    0.88,
    0.91,
    0.93,
  ], 6);

  const tierOneTwo =
    evidence.filter((item) => !item.excluded && (item.sourceTier || 4) <= 2)
      .length;
  const maxCorroboration = Math.max(
    0,
    ...evidence.map((item) => Number(item.independentSourceCount || 0)),
  );
  const metrics = [
    [
      String(evidence.filter((item) => !item.excluded).length),
      "usable evidence rows",
    ],
    [String(tierOneTwo), "Tier 1 / 2 signals"],
    [String(maxCorroboration), "max independent corroboration"],
    [String(passes.length), "recorded research passes"],
  ];
  metrics.forEach(([value, caption], index) => {
    const x = MARGIN + 8 + index * 128;
    page.text(value, x, 622, 18, "F2", COLORS.white);
    page.wrappedText(caption, x, 647, 104, 6.8, 9, "F1", [0.55, 0.66, 0.72], 2);
  });
  page.line(MARGIN + 8, 697, PAGE_WIDTH - MARGIN, 697, [0.12, 0.29, 0.36]);
  page.text(`Run ${input.runId}`, MARGIN + 8, 715, 7, "F1", [0.49, 0.61, 0.68]);
  page.text(
    clean(payload.generatedAt || new Date().toISOString()).slice(0, 10),
    PAGE_WIDTH - MARGIN - 64,
    715,
    7,
    "F1",
    [0.49, 0.61, 0.68],
  );
  return page;
}

function buildScorecard(input: ExportBundleInput, evidence: PdfEvidence[]) {
  const page = new PdfPage();
  addRunningHeader(page, "Decision", "The opportunity, measured");

  page.rect(MARGIN, 125, 154, 116, COLORS.navy, undefined, 10);
  page.text(String(input.total), MARGIN + 18, 142, 39, "F2", COLORS.white);
  page.text("/ 100", MARGIN + 77, 164, 9, "F1", [0.7, 0.77, 0.81]);
  page.text(input.verdict, MARGIN + 18, 195, 12, "F2", [0.55, 0.84, 0.8]);
  page.text(`${input.confidence}% confidence`, MARGIN + 18, 217, 7.5, "F1", [
    0.67,
    0.75,
    0.79,
  ]);
  page.text(
    "12-FACTOR WEIGHTED MODEL",
    MARGIN + 181,
    128,
    7,
    "F2",
    COLORS.teal,
  );
  page.wrappedText(
    "Provider-free scoring fixes the verdict tier before narrative prose is written. Bars show the persisted factor score; weights remain visible beside each criterion.",
    MARGIN + 181,
    149,
    330,
    10,
    15,
    "F1",
    COLORS.slate,
    4,
  );

  const top = 268;
  input.breakdowns.forEach((factor, index) => {
    const y = top + index * 31;
    const name = label(factor.criterion);
    page.text(name, MARGIN, y, 8.2, "F2", COLORS.carbon);
    page.text(`w ${factor.weight}`, 235, y, 6.5, "F1", COLORS.slate);
    page.bar(
      272,
      y + 2,
      238,
      factor.score,
      factor.score < 40 ? COLORS.amber : COLORS.teal,
    );
    page.text(
      String(Math.round(factor.score * 10) / 10),
      520,
      y - 1,
      7.5,
      "F2",
      COLORS.navy,
    );
  });

  const tiers = [1, 2, 3, 4].map((tier) =>
    evidence.filter((item) => item.sourceTier === tier).length
  );
  const totalTiered = Math.max(1, tiers.reduce((sum, value) => sum + value, 0));
  page.line(MARGIN, 658, PAGE_WIDTH - MARGIN, 658, COLORS.mist);
  page.text("EVIDENCE QUALITY MIX", MARGIN, 679, 7, "F2", COLORS.teal);
  const tierLabels = [
    "Tier 1 / payment",
    "Tier 2 / specific pain",
    "Tier 3 / discussion",
    "Tier 4 / excluded",
  ];
  tiers.forEach((count, index) => {
    const x = MARGIN + index * 132;
    page.text(
      String(count),
      x,
      702,
      14,
      "F2",
      index === 3 ? COLORS.red : COLORS.navy,
    );
    page.text(tierLabels[index], x + 22, 705, 6.5, "F1", COLORS.slate);
    page.bar(
      x,
      726,
      104,
      count / totalTiered * 100,
      index === 3 ? COLORS.amber : COLORS.teal,
    );
  });
  return page;
}

function evidenceMeta(item: PdfEvidence) {
  const parts = [
    item.researchPass ? `Pass ${item.researchPass}` : null,
    item.sourceTier ? `Tier ${item.sourceTier}` : null,
    item.evidenceFamily ? `${item.evidenceFamily} space` : null,
    item.independentSourceCount
      ? `${item.independentSourceCount} independent sources`
      : null,
  ].filter(Boolean);
  return parts.join(" / ");
}

function buildEvidencePages(evidence: PdfEvidence[]) {
  const usable = evidence.filter((item) => !item.excluded).sort((a, b) =>
    Number(a.sourceTier || 4) - Number(b.sourceTier || 4) ||
    Number(b.independentSourceCount || 0) -
      Number(a.independentSourceCount || 0)
  );
  const chunks: PdfEvidence[][] = [];
  for (let index = 0; index < usable.length; index += 5) {
    chunks.push(usable.slice(index, index + 5));
  }
  if (!chunks.length) chunks.push([]);
  return chunks.map((chunk, pageIndex) => {
    const page = new PdfPage();
    addRunningHeader(
      page,
      "Evidence",
      pageIndex ? "Evidence ledger, continued" : "The evidence ledger",
    );
    page.text(
      `${usable.length} persisted, non-excluded evidence rows ordered by source strength and corroboration.`,
      MARGIN,
      111,
      8.5,
      "F1",
      COLORS.slate,
    );
    if (!chunk.length) {
      page.rect(
        MARGIN,
        154,
        PAGE_WIDTH - MARGIN * 2,
        86,
        COLORS.white,
        COLORS.mist,
        8,
      );
      page.text(
        "No usable evidence rows were present in this validated report snapshot.",
        MARGIN + 18,
        186,
        10,
        "F1",
        COLORS.slate,
      );
      return page;
    }
    chunk.forEach((item, index) => {
      const top = 141 + index * 116;
      const alert = item.disconfirming;
      page.rect(
        MARGIN,
        top,
        PAGE_WIDTH - MARGIN * 2,
        101,
        COLORS.white,
        alert ? COLORS.amber : COLORS.mist,
        8,
      );
      page.rect(MARGIN, top, 4, 101, alert ? COLORS.amber : COLORS.teal);
      page.text(
        evidenceMeta(item),
        MARGIN + 16,
        top + 13,
        6.5,
        "F2",
        alert ? COLORS.amber : COLORS.teal,
      );
      page.text(
        truncate(item.title || "Evidence item", 82),
        MARGIN + 16,
        top + 30,
        10,
        "F2",
        COLORS.navy,
      );
      page.wrappedText(
        item.snippet || "",
        MARGIN + 16,
        top + 49,
        482,
        8.2,
        11,
        "F1",
        COLORS.slate,
        3,
      );
      page.text(
        `Source: ${
          truncate(item.source || item.url || "Persisted source", 66)
        }`,
        MARGIN + 16,
        top + 84,
        6.5,
        "F1",
        COLORS.blue,
      );
      page.text(
        `ID ${item.id || "not recorded"}`,
        PAGE_WIDTH - MARGIN - 158,
        top + 84,
        5.8,
        "F1",
        COLORS.slate,
      );
    });
    return page;
  });
}

function buildMethodology(
  input: ExportBundleInput,
  payload: PdfPayload,
  evidence: PdfEvidence[],
  passes: PdfPass[],
) {
  const page = new PdfPage();
  addRunningHeader(page, "Method", "How the case was built");
  page.wrappedText(
    input.methodology,
    MARGIN,
    116,
    PAGE_WIDTH - MARGIN * 2,
    9,
    14,
    "F1",
    COLORS.slate,
    5,
  );

  const passLabels = [
    "Broad sweep",
    "Targeted follow-up",
    "Adversarial search",
  ];
  passes.slice(0, 3).forEach((pass, index) => {
    const top = 198 + index * 106;
    const warning = pass.budget_limited ||
      (pass.coverage_gaps?.length || 0) > 0;
    page.rect(
      MARGIN,
      top,
      PAGE_WIDTH - MARGIN * 2,
      89,
      warning ? COLORS.amberPale : COLORS.white,
      warning ? COLORS.amber : COLORS.mist,
      8,
    );
    page.text(
      `0${pass.pass_number || index + 1}`,
      MARGIN + 15,
      top + 15,
      14,
      "F2",
      warning ? COLORS.amber : COLORS.teal,
    );
    page.text(
      passLabels[(pass.pass_number || index + 1) - 1] || label(pass.objective),
      MARGIN + 55,
      top + 14,
      11,
      "F2",
      COLORS.navy,
    );
    page.text(
      label(pass.status || (pass.sufficient ? "Complete" : "Recorded")),
      PAGE_WIDTH - MARGIN - 77,
      top + 15,
      7,
      "F2",
      warning ? COLORS.amber : COLORS.teal,
    );
    page.text(
      `${pass.query_count || 0} queries / ${
        pass.evidence_count || 0
      } evidence rows`,
      MARGIN + 55,
      top + 34,
      7.5,
      "F1",
      COLORS.slate,
    );
    if (pass.coverage_gaps?.length) {
      page.wrappedText(
        `Coverage gap: ${pass.coverage_gaps.join("; ")}`,
        MARGIN + 55,
        top + 52,
        442,
        7,
        10,
        "F1",
        COLORS.amber,
        2,
      );
    } else {
      page.text(
        pass.sufficient
          ? "Retrieval sufficiency established at this checkpoint."
          : "Pass recorded without a sufficiency certification.",
        MARGIN + 55,
        top + 54,
        7,
        "F1",
        COLORS.slate,
      );
    }
  });

  const tierCounts = [1, 2, 3, 4].map((tier) =>
    evidence.filter((item) => item.sourceTier === tier).length
  );
  const maxTierCount = Math.max(1, ...tierCounts);
  page.text("SOURCE TIER PROFILE", MARGIN, 536, 7, "F2", COLORS.teal);
  tierCounts.forEach((count, index) => {
    const y = 562 + index * 24;
    page.text(`Tier ${index + 1}`, MARGIN, y, 7.5, "F2", COLORS.navy);
    page.bar(
      MARGIN + 52,
      y + 1,
      164,
      count / maxTierCount * 100,
      index === 3 ? COLORS.amber : COLORS.teal,
    );
    page.text(String(count), MARGIN + 226, y - 1, 7, "F2", COLORS.slate);
  });

  const clusters = new Map<string, { sources: number; domains: number }>();
  evidence.forEach((item) => {
    if (!item.painPoint || item.excluded) return;
    const current = clusters.get(item.painPoint) || { sources: 0, domains: 0 };
    clusters.set(item.painPoint, {
      sources: Math.max(
        current.sources,
        Number(item.independentSourceCount || 0),
      ),
      domains: Math.max(
        current.domains,
        Number(item.independentDomainCount || 0),
      ),
    });
  });
  page.text("TOP CORROBORATED PAIN", 326, 536, 7, "F2", COLORS.teal);
  [...clusters.entries()].sort((a, b) => b[1].sources - a[1].sources).slice(
    0,
    4,
  ).forEach(([pain, counts], index) => {
    const y = 559 + index * 39;
    page.text(`${counts.sources}x`, 326, y, 9, "F2", COLORS.teal);
    page.wrappedText(pain, 355, y, 205, 7.5, 10, "F1", COLORS.carbon, 2);
    page.text(`${counts.domains} domains`, 355, y + 22, 6, "F1", COLORS.slate);
  });
  if (!clusters.size) {
    page.text(
      "No stored pain-point clusters were available.",
      326,
      561,
      8,
      "F1",
      COLORS.slate,
    );
  }

  const gaps = payload.retrieval?.retrieval_coverage_gaps || [];
  if (gaps.length) {
    page.wrappedText(
      `Remaining retrieval gaps: ${gaps.join("; ")}`,
      MARGIN,
      682,
      PAGE_WIDTH - MARGIN * 2,
      7.5,
      11,
      "F1",
      COLORS.amber,
      3,
    );
  }
  return page;
}

function buildIntegrity(payload: PdfPayload) {
  const page = new PdfPage();
  addRunningHeader(page, "Integrity", "What tried to prove this wrong");
  const gate = payload.adversarialGate;
  const gateWarning = gate?.unresolved || gate?.outcome === "StrongObjection";
  page.rect(
    MARGIN,
    124,
    PAGE_WIDTH - MARGIN * 2,
    135,
    gateWarning ? COLORS.amberPale : COLORS.tealPale,
    gateWarning ? COLORS.amber : COLORS.teal,
    9,
  );
  page.text(
    "ADVERSARIAL VERDICT GATE",
    MARGIN + 18,
    142,
    7,
    "F2",
    gateWarning ? COLORS.amber : COLORS.tealDark,
  );
  page.text(
    label(gate?.outcome || "No gate record"),
    MARGIN + 18,
    165,
    16,
    "F2",
    COLORS.navy,
  );
  page.wrappedText(
    gate?.objection ||
      "No adversarial-gate record was present in the validated report snapshot.",
    MARGIN + 18,
    195,
    480,
    9,
    14,
    "F1",
    COLORS.carbon,
    4,
  );
  page.text(
    `${gate?.severity || "No"} severity / ${
      gate?.evidence_ids?.length || 0
    } cited evidence items`,
    MARGIN + 18,
    238,
    6.8,
    "F2",
    gateWarning ? COLORS.amber : COLORS.tealDark,
  );

  const decision = payload.decisionIntegrity;
  page.text("DECISION CONSISTENCY", MARGIN, 292, 7, "F2", COLORS.teal);
  const decisionRows = [
    [
      "Deterministic score tier",
      decision?.deterministicVerdict || "Not recorded",
    ],
    ["Effective verdict", decision?.effectiveVerdict || "Not recorded"],
    [
      "Final Judge written tier",
      decision?.finalJudgeWrittenVerdict || "Not recorded",
    ],
    [
      "Narrative mismatch",
      decision?.finalJudgeEffectiveMismatch ? "Flagged" : "None",
    ],
  ];
  decisionRows.forEach(([name, value], index) => {
    const y = 320 + index * 29;
    page.text(name, MARGIN, y, 8, "F1", COLORS.slate);
    page.text(
      value,
      230,
      y,
      8.5,
      "F2",
      value === "Flagged" ? COLORS.amber : COLORS.navy,
    );
    page.line(MARGIN, y + 17, 320, y + 17, COLORS.mistPale);
  });

  const citation = payload.citationValidation;
  page.rect(352, 292, 216, 126, COLORS.white, COLORS.mist, 8);
  page.text("CITATION RESOLUTION", 370, 311, 7, "F2", COLORS.teal);
  page.text(
    citation?.valid ? "Validated" : "Issues found",
    370,
    339,
    16,
    "F2",
    citation?.valid ? COLORS.tealDark : COLORS.amber,
  );
  page.text(
    `Claims checked: ${citation?.claimsChecked ?? 0}`,
    370,
    371,
    8,
    "F1",
    COLORS.slate,
  );
  page.text(
    `Claims removed: ${citation?.claimsRemoved ?? 0}`,
    370,
    390,
    8,
    "F1",
    COLORS.slate,
  );

  const checks = payload.specialistDisputes || [];
  page.text("ISOLATED SPECIALIST CHECKS", MARGIN, 459, 7, "F2", COLORS.teal);
  checks.slice(0, 6).forEach((check, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = MARGIN + column * 270;
    const y = 486 + row * 57;
    page.rect(
      x,
      y,
      254,
      44,
      check.disputed ? COLORS.amberPale : COLORS.white,
      check.disputed ? COLORS.amber : COLORS.mist,
      7,
    );
    page.text(
      label(check.specialist || "Specialist"),
      x + 12,
      y + 10,
      8,
      "F2",
      COLORS.navy,
    );
    page.text(
      check.disputed ? "DISPUTED" : "REPRODUCED",
      x + 171,
      y + 10,
      6,
      "F2",
      check.disputed ? COLORS.amber : COLORS.teal,
    );
    page.text(
      truncate(check.reason || check.checkerDirection || "", 54),
      x + 12,
      y + 27,
      6.5,
      "F1",
      COLORS.slate,
    );
  });

  const flags = payload.reasoningFlags || [];
  page.text("PERSISTED INTEGRITY FLAGS", MARGIN, 674, 7, "F2", COLORS.teal);
  if (flags.length) {
    page.wrappedText(
      flags.map((flag) =>
        `${label(flag.severity)} / ${label(flag.type)}: ${flag.message}`
      ).join(" | "),
      MARGIN,
      697,
      PAGE_WIDTH - MARGIN * 2,
      7.2,
      10.5,
      "F1",
      COLORS.amber,
      4,
    );
  } else {
    page.text(
      "No integrity flags were persisted for this report version.",
      MARGIN,
      697,
      8,
      "F1",
      COLORS.slate,
    );
  }
  return page;
}

function buildAppendixPages(input: ExportBundleInput, evidence: PdfEvidence[]) {
  const entries: Array<{ heading: string; body: string; accent?: Color }> = [];
  input.breakdowns.forEach((factor) => {
    entries.push({
      heading: `${
        label(factor.criterion)
      } / score ${factor.score} / weight ${factor.weight}`,
      body: `Evidence IDs: ${
        factor.evidenceIds.join(", ") || "None"
      }. ${factor.note}`,
    });
  });
  evidence.forEach((item) => {
    entries.push({
      heading: `${item.id || "Evidence"} / ${
        item.source || item.sourceType || "Persisted source"
      }`,
      body: item.url || item.snippet ||
        "No source URL was present in the report snapshot.",
      accent: item.disconfirming ? COLORS.amber : COLORS.blue,
    });
  });
  const pages: PdfPage[] = [];
  let page = new PdfPage();
  addRunningHeader(page, "Appendix", "Traceability register");
  let top = 124;
  entries.forEach((entry) => {
    const bodyLines = wrap(entry.body, 103);
    const height = 35 + Math.min(6, bodyLines.length) * 10;
    if (top + height > 735) {
      pages.push(page);
      page = new PdfPage();
      addRunningHeader(page, "Appendix", "Traceability register, continued");
      top = 124;
    }
    page.text(
      entry.heading,
      MARGIN,
      top,
      7.3,
      "F2",
      entry.accent || COLORS.tealDark,
    );
    page.wrappedText(
      entry.body,
      MARGIN,
      top + 16,
      PAGE_WIDTH - MARGIN * 2,
      6.6,
      9.5,
      "F1",
      COLORS.slate,
      6,
    );
    page.line(
      MARGIN,
      top + height - 5,
      PAGE_WIDTH - MARGIN,
      top + height - 5,
      COLORS.mistPale,
    );
    top += height;
  });
  pages.push(page);
  return pages;
}

function serialize(pages: PdfPage[]) {
  const pageCount = pages.length;
  pages.forEach((page, index) => {
    const dark = page.background === COLORS.midnight;
    page.line(
      MARGIN,
      754,
      PAGE_WIDTH - MARGIN,
      754,
      dark ? [0.12, 0.29, 0.36] : COLORS.mist,
    );
    page.text(
      "ShouldBuild / evidence-led market validation",
      MARGIN,
      767,
      6.2,
      "F1",
      dark ? [0.49, 0.61, 0.68] : COLORS.slate,
    );
    page.text(
      `${index + 1} / ${pageCount}`,
      PAGE_WIDTH - MARGIN - 26,
      767,
      6.2,
      "F2",
      dark ? [0.49, 0.77, 0.73] : COLORS.teal,
    );
  });

  const pageIds = pages.map((_, index) => 3 + index * 2);
  const regularFontId = 3 + pageCount * 2;
  const boldFontId = regularFontId + 1;
  const italicFontId = regularFontId + 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${
      pageIds.map((id) => `${id} 0 R`).join(" ")
    }] /Count ${pageCount} >>`,
  ];
  pages.forEach((page, index) => {
    const pageId = pageIds[index];
    const contentId = pageId + 1;
    const stream = page.commands.join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${regularFontId} 0 R /F2 ${boldFontId} 0 R /F3 ${italicFontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      `<< /Length ${
        encoder.encode(stream).length
      } >>\nstream\n${stream}\nendstream`,
    );
  });
  objects.push(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>",
  );

  let pdf = "%PDF-1.4\n";
  let offset = encoder.encode(pdf).length;
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(offset);
    const part = `${index + 1} 0 obj\n${object}\nendobj\n`;
    pdf += part;
    offset += encoder.encode(part).length;
  });
  const xref = offset;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${
    offsets.slice(1).map((value) =>
      `${String(value).padStart(10, "0")} 00000 n `
    ).join("\n")
  }\ntrailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return encoder.encode(pdf);
}

export function renderPremiumPdf(input: ExportBundleInput): Uint8Array {
  const payload = payloadFor(input.payload);
  const evidence = payload.opportunity?.evidence || [];
  const passes = payload.retrieval?.passes || [];
  const pages = [
    buildCover(input, payload, evidence, passes),
    buildScorecard(input, evidence),
    ...buildEvidencePages(evidence),
    buildMethodology(input, payload, evidence, passes),
    buildIntegrity(payload),
    ...buildAppendixPages(input, evidence),
  ];
  return serialize(pages);
}
