"use client";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { defaultWeights, scoringCriteria, weightPresets } from "@/lib/scoring";
import { ScoringWeights } from "@/lib/types";

export function WeightEditor({weights,onChange,defaultValue=defaultWeights}:{weights:ScoringWeights;onChange:(weights:ScoringWeights)=>void;defaultValue?:ScoringWeights}){
  const update=(key:keyof ScoringWeights,value:number)=>onChange({...weights,[key]:value});
  return <section className="engine-card weight-editor"><header><div><p className="eyebrow">Scoring controls</p><h3><SlidersHorizontal size={17}/> Weight editor</h3><p>Weights define what “good” means for this decision. They normalize to 100 automatically.</p></div><button onClick={()=>onChange(defaultValue)}><RotateCcw size={14}/>Reset</button></header><div className="preset-row">{Object.keys(weightPresets).map(name=><button key={name} onClick={()=>onChange(weightPresets[name])}>{name}</button>)}</div><div className="weight-list">{scoringCriteria.map(c=><label key={c.key}><span><b>{c.label}</b><small>{c.risk?"Risk — automatically inverted":"Positive factor"}</small></span><input type="range" min="0" max="25" value={Math.round(weights[c.key])} onChange={e=>update(c.key,Number(e.target.value))}/><output>{Math.round(weights[c.key])}%</output></label>)}</div></section>;
}
