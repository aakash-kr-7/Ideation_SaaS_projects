import { NextResponse } from "next/server";
import { researchStore } from "@/lib/research/store";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const run=researchStore.get(id);if(!run)return NextResponse.json({error:"Research run not found"},{status:404});return NextResponse.json({id:run.id,stage:run.stage,progress:run.progress,message:run.message,evidenceCount:run.evidence.length,sourceCount:run.sources.length,reportReady:Boolean(run.report),error:run.error});}
