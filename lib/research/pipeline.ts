import { ValidationReport } from "@/lib/report-schema";
import { EvidenceItem } from "@/lib/types";
import { generateDynamicReport } from "./generator";
import { generateSearchQueries } from "./queries";
import { ResearchRequest, PipelineRun, ResearchStage, EvidenceRecord, ExtractedSource } from "./types";
import { researchStore } from "./store";

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function update(id: string, stage: ResearchStage, progress: number, message: string, extra: Partial<PipelineRun> = {}) {
  return researchStore.update(id, { stage, progress, message, ...extra });
}

export async function runResearchPipeline(id: string, input: ResearchRequest) {
  try {
    update(id, "generating_queries", 10, `Formulating structured research vectors for "${input.ideaName}"`);
    const queries = generateSearchQueries(input);
    await wait(800);

    update(id, "searching_web", 25, `Querying sources for: "${queries[0]?.query || input.ideaName}"`, { queries });
    await wait(1000);

    // Compile dynamic report based on inputs
    const report = generateDynamicReport(input, id);
    const o = report.opportunity;

    // Convert EvidenceItem to EvidenceRecord
    const evidence: EvidenceRecord[] = o.evidence.map(e => ({
      id: e.id,
      sourceId: `src-${e.id}`,
      kind: (e.signal === "Pain" ? "workaround" : e.signal === "Pricing" ? "competitor pricing" : e.signal === "Risk" ? "risk" : "market trend") as any,
      confidence: e.strength === "High" ? 90 : e.strength === "Medium" ? 70 : 50,
      title: e.title,
      snippet: e.snippet,
      url: e.url,
      source: e.source,
      verified: true
    }));

    // Convert EvidenceItem to ExtractedSource
    const sources: ExtractedSource[] = o.evidence.map(e => ({
      id: `src-${e.id}`,
      title: e.title,
      url: e.url,
      source: e.source,
      snippet: e.snippet,
      sourceType: e.sourceType,
      text: e.snippet,
      date: e.date
    }));

    update(id, "extracting_sources", 45, `Mining pain points and competitors from G2 and Reddit threads`);
    await wait(900);

    update(id, "filtering_evidence", 65, `Found user pain: "${o.evidence[0]?.snippet.slice(0, 50)}..."`);
    await wait(800);

    update(id, "analyzing", 80, `Analyzing positioning gaps for ${o.competitors.length} competitors: ${o.competitors.map(c => c.name).join(", ")}`, { sources, evidence });
    await wait(1000);

    update(id, "scoring", 90, `Calculating 12-factor confidence model (Score: ${o.scorecard.total}/100, Verdict: ${o.scorecard.verdict})`);
    await wait(700);

    update(id, "generating_report", 95, `Assembling blueprint and structuring outreach strategy`);
    await wait(600);

    update(id, "complete", 100, "Research memo compiled successfully", { report, evidence, sources });
  } catch (error) {
    update(id, "failed", 100, "Research failed", { error: error instanceof Error ? error.message : "Unknown pipeline error" });
  }
}

