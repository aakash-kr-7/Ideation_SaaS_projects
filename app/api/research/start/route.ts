import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { researchRequestSchema } from "@/lib/research/schema";
import { runResearchPipeline } from "@/lib/research/pipeline";
import { researchStore } from "@/lib/research/store";
import { ResearchRequest } from "@/lib/research/types";
export async function POST(request: Request){ const parsed=researchRequestSchema.safeParse(await request.json()); if(!parsed.success)return NextResponse.json({error:"Invalid research request",details:parsed.error.flatten()},{status:400}); const id=randomUUID(); const input=parsed.data as ResearchRequest; const now=new Date().toISOString(); researchStore.create({id,request:input,mode:input.depth==="deep"?"Deep Validation":"Fast Scan",stage:"queued",progress:0,message:"Queued for research",queries:[],sources:[],evidence:[],createdAt:now,updatedAt:now}); void runResearchPipeline(id,input); return NextResponse.json({id,status:"queued",progressUrl:`/api/research/${id}/progress`,reportUrl:`/api/research/${id}`},{status:202}); }
