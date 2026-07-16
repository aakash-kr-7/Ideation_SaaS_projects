import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { ResearchProgress } from "@/components/research/research-progress";
export default async function DynamicProgressPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <AppShell title="Validation in progress" action={<Link className="button button-small ghost" href="/dashboard"><ArrowLeft size={14}/> Dashboard</Link>}><div className="page-content"><ResearchProgress id={id}/></div></AppShell>}
