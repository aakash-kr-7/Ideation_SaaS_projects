"use client";
import { useParams } from "next/navigation";
import { ResearchProgress } from "@/components/research/research-progress";
export default function DynamicProgressPage(){const params=useParams<{id:string}>();return <ResearchProgress id={params.id} idea="your opportunity"/>}
