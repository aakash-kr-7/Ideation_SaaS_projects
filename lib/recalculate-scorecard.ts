import { calculateDeterministicScore, verdictFor, type FactorResult } from "@/supabase/functions/_shared/research/scoring-engine";
import type { OpportunityScorecard, ScoringWeights } from "@/lib/types";

export function recalculateScorecard(scorecard:OpportunityScorecard,weights:ScoringWeights):OpportunityScorecard{
  const factors=Object.entries(scorecard.scores).map(([criterion,score])=>({criterion,score,evidenceIds:scorecard.evidenceRefs[criterion as keyof typeof scorecard.evidenceRefs]??[],note:scorecard.notes[criterion as keyof typeof scorecard.notes]})) as FactorResult[];
  const total=calculateDeterministicScore(factors,Object.entries(weights).map(([criterion,weight])=>({criterion,weight})));
  return {...scorecard,weights,total,verdict:verdictFor(total)};
}
