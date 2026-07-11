"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Compass, FileSearch, Gauge, Rocket, Scale } from "lucide-react";

const steps=[
  {icon:Compass,eyebrow:"Research workspace orientation",title:"Begin with a decision worth making.",text:"Bring the opportunity you keep returning to. Define the buyer, the workflow, and the constraint that matters most."},
  {icon:FileSearch,eyebrow:"Evidence-based analysis",title:"See the evidence behind every recommendation.",text:"Every memo maintains source context, assumptions, risk factors, and competitive gaps alongside the conclusion — so you can challenge it."},
  {icon:Gauge,eyebrow:"Decision model",title:"Understand what each score recommends.",text:"85+ indicates build a focused paid MVP. 70–84 means validate first. 55–69 means narrow the wedge. Below 55 means do not commit build time yet."},
  {icon:Scale,eyebrow:"Comparative analysis",title:"Evaluate competing opportunities under the same lens.",text:"Compare up to four opportunities on buyer pain, reachability, risk profile, revenue path, and the first experiment worth running."},
  {icon:Rocket,eyebrow:"From research to action",title:"Leave with a concrete next step, not a vague insight.",text:"Use the memo to structure interviews, propose a paid pilot, or make a justified walk-away decision before the opportunity gets expensive."}
];

export default function OnboardingPage(){const router=useRouter();const [step,setStep]=useState(0);const current=steps[step];const Icon=current.icon;const finish=()=>{localStorage.setItem("signalfit-onboarding","complete");router.push("/dashboard")};return <main className="tour-page"><div className="tour-shell"><header><span>SF</span><p>{step+1} / {steps.length}</p></header><div className="tour-icon"><Icon size={25}/></div><p className="eyebrow">{current.eyebrow}</p><h1>{current.title}</h1><p className="tour-copy">{current.text}</p><div className="tour-progress">{steps.map((_,i)=><i className={i<=step?"active":""} key={i}/>)}</div><div className="tour-actions"><button onClick={finish}>Skip orientation</button><button className="bs-btn bs-btn-bright" onClick={()=>step===steps.length-1?finish():setStep(step+1)}>{step===steps.length-1?<>Open workspace <Check size={15}/></>:<>Continue <ArrowRight size={15}/></>}</button></div></div></main>}
