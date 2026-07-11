import { PipelineRun } from "./types";
const globalStore = globalThis as typeof globalThis & { __buildsignalRuns?: Map<string, PipelineRun> };
const runs = globalStore.__buildsignalRuns ?? new Map<string, PipelineRun>();
globalStore.__buildsignalRuns = runs;
export const researchStore = { create(run: PipelineRun) { runs.set(run.id, run); return run; }, get(id: string) { return runs.get(id); }, update(id: string, patch: Partial<PipelineRun>) { const current=runs.get(id); if(!current) return undefined; const next={...current,...patch,updatedAt:new Date().toISOString()}; runs.set(id,next); return next; }, list() { return [...runs.values()]; } };
