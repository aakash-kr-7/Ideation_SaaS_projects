"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ResearchProgress } from "@/components/research/research-progress";
function ProgressContent(){const params=useSearchParams();return <ResearchProgress id="mock" idea={params.get("idea")||"your opportunity"}/>}
export default function ProgressPage(){return <Suspense fallback={<ResearchProgress id="mock" idea="your opportunity"/>}><ProgressContent/></Suspense>}
