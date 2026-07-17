"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check, Layers3, SearchCheck, Telescope, Waypoints, Loader2 } from "lucide-react";
import { MarketType, ResearchMode } from "@/lib/types";
import { createProject, startResearchRun } from "@/lib/actions/research";
import { motion, getStaggerDelay, revealUpClass } from "@/lib/motion";
const markets: MarketType[] = ["B2B", "D2C", "Creator", "Developer Tool", "Local Business", "Agency Tool", "Student/Career", "Other"];
const modes: Array<{name:ResearchMode; icon:typeof SearchCheck; text:string; plan?:string; route?:string; disabled?:boolean}> = [
 {name:"Fast Scan",icon:SearchCheck,text:"Quick signal check. ~2 minutes."},
 {name:"Deep Validation",icon:Telescope,text:"Full report with evidence, scoring, and next steps. ~5 min.",plan:"ANALYST"},
 {name:"Compare Ideas",icon:Layers3,text:"Open completed reports and compare them side by side.",plan:"PRINCIPAL",route:"/compare"},
 {name:"Find Opportunities in Market",icon:Waypoints,text:"Market whitespace discovery is coming soon.",plan:"COMING SOON",disabled:true},
];
export function ResearchForm({projectId}:{projectId?:string}){
 const router=useRouter(); const [mode,setMode]=useState<ResearchMode>("Deep Validation"); const [idea,setIdea]=useState(""); const [submitting,setSubmitting]=useState(false); const [error,setError]=useState("");
 const submit=async(e:FormEvent<HTMLFormElement>)=>{e.preventDefault();setSubmitting(true);setError("");try{const form=new FormData(e.currentTarget);const project=projectId?{id:projectId}:await createProject({name:"Default Project"});const result=await startResearchRun({project_id:project.id,idea_name:String(form.get("ideaName")??idea),idea_description:String(form.get("ideaDescription")??""),target_customer:String(form.get("targetCustomer")??""),market_type:String(form.get("marketType")??"B2B") as MarketType,target_region:String(form.get("targetRegion")??"Global"),mode});router.push(`/research/${result.id}/progress`)}catch(caught){let message=caught instanceof Error?caught.message:"Something went wrong. Try again.";try{const parsed=JSON.parse(message);message=parsed.message??message}catch{}setError(message)}finally{setSubmitting(false)}};
 return <form onSubmit={submit} className="research-form">
   <section className={`form-section ${revealUpClass}`} style={getStaggerDelay(0)}>
     <div>
       <p className="eyebrow">Your idea</p>
       <h2>What do you want to build?</h2>
       <p>Be specific about the product and who it&apos;s for. The more detail, the better the validation.</p>
     </div>
     <div className="field-grid">
       <label className="field full"><span>Idea name</span><input name="ideaName" value={idea} onChange={e=>setIdea(e.target.value)} placeholder="e.g. Invoice reminder tool for freelancers" required/></label>
       <label className="field full"><span>What does it do?</span><textarea name="ideaDescription" placeholder="Describe the product and who it helps. What problem does it solve?" required/></label>
       <label className="field"><span>Who would pay for this?</span><input name="targetCustomer" placeholder="e.g. Freelance designers billing $5k+/month" required/></label>
       <label className="field"><span>Target region</span><input name="targetRegion" defaultValue="Global"/></label>
       <label className="field full"><span>Market type</span><select name="marketType" defaultValue="B2B">{markets.map(m=><option key={m}>{m}</option>)}</select></label>
     </div>
   </section>
   <section className={`form-section ${revealUpClass}`} style={getStaggerDelay(1)}>
     <div>
       <p className="eyebrow">Your constraints</p>
       <h2>What matters most to you?</h2>
       <p>These shape the scoring model — not the evidence. Adjust to match your priorities.</p>
     </div>
     <div className="field-grid">
       <label className="field"><span>Revenue target</span><select defaultValue="$5k MRR"><option>$1k MRR</option><option>$5k MRR</option><option>$10k MRR</option><option>Venture-scale</option></select></label>
       <label className="field"><span>Monetization preference</span><select><option>Subscription</option><option>Usage-based</option><option>One-time purchase</option><option>Service + software</option></select></label>
       <label className="field"><span>Build complexity tolerance</span><select><option>Low — weeks, not months</option><option>Medium</option><option>High</option></select></label>
       <label className="field"><span>Platform dependency tolerance</span><select><option>Low — minimize it</option><option>Medium</option><option>High</option></select></label>
       <label className="field full"><span>Regulatory risk tolerance</span><select><option>Low — avoid regulated markets</option><option>Medium</option><option>High</option></select></label>
     </div>
   </section>
   <section className={`form-section mode-section ${revealUpClass}`} style={getStaggerDelay(2)}>
     <div>
       <p className="eyebrow">Validation depth</p>
       <h2>How deep should we go?</h2>
     </div>
     <div className="mode-grid">{modes.map(({name,icon:Icon,text,plan,route,disabled})=><button type="button" onClick={()=>route?router.push(route):setMode(name)} disabled={disabled} className={`${mode===name&&!route?"mode-card selected":"mode-card"} ${motion.transitionBase} ${motion.hoverElevateSubtle} ${motion.press}`} key={name}><span><Icon size={18}/>{mode===name&&!route&&<Check size={14}/>} {plan&&<i className="feature-plan-badge">{plan}</i>}</span><b>{name}</b><small>{text}</small></button>)}</div>
   </section>
   <footer className="form-footer">
     {error && <p style={{color: "var(--signal-red)"}}>{error}</p>}
     {!error && <p>Your idea will be analyzed against real market signals from 10+ source categories.</p>}
     <button className={`button ${motion.buttonBase} ${submitting ? "is-loading" : error ? "is-error" : ""}`} type="submit" disabled={submitting}>
       {submitting ? <><Loader2 className="animate-spin" size={17}/> Validating…</> : <>Validate this idea <ArrowRight size={17}/></>}
     </button>
   </footer>
 </form>
}
