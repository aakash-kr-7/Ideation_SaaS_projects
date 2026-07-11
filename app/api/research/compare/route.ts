import { NextResponse } from "next/server";
import { researchStore } from "@/lib/research/store";
import { compareOpportunities } from "@/lib/scoring";
import { ReportOpportunity } from "@/lib/report-schema";
export async function POST(request:Request){const body=await request.json();const ids:string[]=Array.isArray(body.ids)?body.ids.slice(0,4).map(String):[];const opportunities:ReportOpportunity[]=ids.map((id)=>researchStore.get(id)?.report?.opportunity).filter((opportunity): opportunity is ReportOpportunity=>Boolean(opportunity));const reports=opportunities.map((opportunity)=>({id:opportunity.id,name:opportunity.name,scorecard:opportunity.scorecard}));return NextResponse.json({opportunities:compareOpportunities(reports)});}
