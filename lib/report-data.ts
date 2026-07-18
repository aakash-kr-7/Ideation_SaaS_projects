import "server-only";
import { createClient } from "@/lib/supabase/server";
import { validationReportSchema, type ValidationReport } from "@/lib/report-schema";
import type { OpportunityScorecard, ScoringCriterion } from "@/lib/types";
import { scoringCriteria } from "@/lib/scoring";

export type StoredExportFormat="json"|"markdown"|"csv"|"pdf";
export type StoredExport={format:StoredExportFormat;storagePath:string;byteSize:number};
export type LoadedReport={report:ValidationReport;exports:StoredExport[]};
export type CompletedScorecard={id:string;name:string;scorecard:OpportunityScorecard};

const reportSelect=`
  id, run_id, executive_summary, methodology, generated_at,
  report_versions(id, version_number, report_mode, payload, report_exports(format, storage_path, byte_size))
`;

function one<T>(value:T|T[]|null|undefined):T|undefined{return Array.isArray(value)?value[0]:value??undefined}

function mapScorecard(score:any,runId:string):OpportunityScorecard{
  const breakdowns=(score?.breakdowns??[]) as any[];
  const byCriterion=new Map(breakdowns.map(item=>[item.criterion,item]));
  for(const criterion of scoringCriteria)if(!byCriterion.has(criterion.key))throw new Error(`Completed report ${runId} is missing score breakdown ${criterion.key}.`);
  return {
    scores:Object.fromEntries(scoringCriteria.map(({key})=>[key,Number(byCriterion.get(key)?.score)])) as OpportunityScorecard["scores"],
    notes:Object.fromEntries(scoringCriteria.map(({key})=>[key,String(byCriterion.get(key)?.notes)])) as OpportunityScorecard["notes"],
    evidenceRefs:Object.fromEntries(scoringCriteria.map(({key})=>[key,(byCriterion.get(key)?.evidence??[]).map((ref:any)=>ref.evidence_id)])) as Partial<Record<ScoringCriterion,string[]>>,
    weights:Object.fromEntries(scoringCriteria.map(({key})=>[key,Number(byCriterion.get(key)?.weight)])) as OpportunityScorecard["weights"],
    total:Number(score.total),confidence:Number(score.confidence),verdict:score.verdict
  };
}

function mapReport(row:any):LoadedReport{
  const latestVersion=[...(row.report_versions??[])].sort((a:any,b:any)=>b.version_number-a.version_number)[0];
  if(!latestVersion?.payload)throw new Error(`Completed report ${row.run_id} has no immutable report version.`);
  const parsed=validationReportSchema.safeParse(latestVersion.payload);
  if(!parsed.success)throw new Error(`Completed report ${row.run_id} failed payload validation: ${parsed.error.message}`);
  return {
    report:parsed.data as ValidationReport,
    exports:(latestVersion?.report_exports??[]).map((item:any)=>({format:item.format,storagePath:item.storage_path,byteSize:Number(item.byte_size)}))
  };
}

export async function loadReportForRun(runId:string):Promise<LoadedReport|null>{
  const supabase=await createClient();
  const {data,error}=await supabase.from("reports").select(reportSelect).eq("run_id",runId).maybeSingle();
  if(error)throw error;
  if(!data)return null;
  return mapReport(data);
}

export async function loadCompletedReports():Promise<LoadedReport[]>{
  const supabase=await createClient();
  const {data,error}=await supabase.from("reports").select(`${reportSelect}, research_runs!inner(status)`).eq("research_runs.status","Completed").order("generated_at",{ascending:false});
  if(error)throw error;
  return (data??[]).map(mapReport);
}

export async function loadCompletedScorecards():Promise<CompletedScorecard[]>{
  const supabase=await createClient();
  const {data,error}=await supabase.from("reports").select(`run_id, research_runs!inner(status), opportunity:opportunities(name, scorecard:opportunity_scores(total, confidence, verdict, breakdowns:score_breakdowns(criterion, score, notes, weight, evidence:score_evidence_refs(evidence_id))))`).eq("research_runs.status","Completed").order("generated_at",{ascending:false});
  if(error)throw error;
  return (data??[]).map((row:any)=>{const opportunity=one<any>(row.opportunity);return {id:row.run_id,name:opportunity.name,scorecard:mapScorecard(one<any>(opportunity.scorecard),row.run_id)}});
}
