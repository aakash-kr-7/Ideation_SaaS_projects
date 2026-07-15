import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ValidationReport } from "@/lib/report-schema";
import type { OpportunityScorecard, ScoringCriterion } from "@/lib/types";
import { scoringCriteria } from "@/lib/scoring";

export type StoredExportFormat="json"|"markdown"|"csv"|"pdf";
export type StoredExport={format:StoredExportFormat;storagePath:string;byteSize:number};
export type LoadedReport={report:ValidationReport;exports:StoredExport[];sourceCount:number};
export type CompletedScorecard={id:string;name:string;scorecard:OpportunityScorecard};

const reportSelect=`
  id, run_id, executive_summary, methodology, generated_at,
  report_versions(id, version_number, report_exports(format, storage_path, byte_size)),
  opportunity:opportunities(
    id, name, one_liner, target_customer, core_pain, market, created_at,
    evidence:evidence_items(
      id, signal_type, strength, title, snippet, created_at,
      source:sources(title, url, source_type, published_at)
    ),
    competitors:competitors(id, name, positioning, pricing, target, strength, gap),
    pricing:pricing_models(model, price_point, rationale, first_offer, target_customers),
    mvp:mvp_plans(outcome, build_estimate, build_complexity, items:mvp_scope_items(item_type, description)),
    launch:launch_plans(first_customer_channel, outreach_message, success_metric, strategies:launch_strategies(strategy_type, description)),
    risks:risks(id, category, severity, description, mitigation),
    scorecard:opportunity_scores(
      total, confidence, verdict,
      breakdowns:score_breakdowns(
        criterion, score, notes, weight,
        evidence:score_evidence_refs(evidence_id)
      )
    )
  )
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
  const opportunity=one<any>(row.opportunity);
  const score=one<any>(opportunity?.scorecard);
  const pricing=one<any>(opportunity?.pricing);
  const mvp=one<any>(opportunity?.mvp);
  const launch=one<any>(opportunity?.launch);
  if(!opportunity||!score||!pricing||!mvp||!launch)throw new Error(`Completed report ${row.run_id} is missing normalized report data.`);

  const scorecard=mapScorecard(score,row.run_id);
  const strategies=(launch.strategies??[]) as any[];
  const items=(mvp.items??[]) as any[];
  const latestVersion=[...(row.report_versions??[])].sort((a:any,b:any)=>b.version_number-a.version_number)[0];
  return {
    report:{
      id:row.run_id,version:"1.0",generatedAt:row.generated_at,executiveSummary:row.executive_summary,methodology:row.methodology,
      opportunity:{
        id:opportunity.id,name:opportunity.name,oneLiner:opportunity.one_liner,targetCustomer:opportunity.target_customer,corePain:opportunity.core_pain,market:opportunity.market,createdAt:opportunity.created_at,scorecard,
        evidence:(opportunity.evidence??[]).map((item:any)=>{const source=one<any>(item.source);return {id:item.id,source:source?.title??"Source unavailable",sourceType:source?.source_type??"Unknown",title:item.title,snippet:item.snippet,url:source?.url??"",signal:item.signal_type,strength:item.strength,date:(source?.published_at??item.created_at).slice(0,10)}}),
        competitors:opportunity.competitors??[],
        pricing:{model:pricing.model,pricePoint:pricing.price_point,rationale:pricing.rationale,firstOffer:pricing.first_offer,targetCustomers:pricing.target_customers},
        mvp:{outcome:mvp.outcome,scope:items.filter(item=>item.item_type==="Scope").map(item=>item.description),exclusions:items.filter(item=>item.item_type==="Exclusion").map(item=>item.description),buildEstimate:mvp.build_estimate,buildComplexity:mvp.build_complexity},
        launch:{firstCustomerChannel:launch.first_customer_channel,outreachMessage:launch.outreach_message,successMetric:launch.success_metric,weekOne:strategies.filter(item=>item.strategy_type==="WeekOne").map(item=>item.description),firstTenStrategy:strategies.filter(item=>item.strategy_type==="FirstTen").map(item=>item.description)},
        risks:opportunity.risks??[]
      }
    },
    exports:(latestVersion?.report_exports??[]).map((item:any)=>({format:item.format,storagePath:item.storage_path,byteSize:Number(item.byte_size)})),
    sourceCount:0
  };
}

export async function loadReportForRun(runId:string):Promise<LoadedReport|null>{
  const supabase=await createClient();
  const [{data,error},sources]=await Promise.all([
    supabase.from("reports").select(reportSelect).eq("run_id",runId).maybeSingle(),
    supabase.from("sources").select("id",{count:"exact",head:true}).eq("run_id",runId)
  ]);
  if(error)throw error;
  if(sources.error)throw sources.error;
  if(!data)return null;
  const loaded=mapReport(data);loaded.sourceCount=sources.count??0;return loaded;
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
