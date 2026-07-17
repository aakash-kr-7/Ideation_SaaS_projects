import { createClient } from '../supabase/server'
import { Tables } from '../types'

export type ResearchRunRow = Tables<'research_runs'>

type ResearchRunCreate = Omit<ResearchRunRow, 'id' | 'created_at' | 'updated_at' | 'progress' | 'status' | 'error_message' | 'progress_detail' | 'retrieval_budget_limited' | 'retrieval_coverage' | 'retrieval_coverage_gaps' | 'retrieval_sufficient'>

export const ResearchRepository = {
  async getProjectRuns(projectId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('research_runs')
      .select('*, research_stages(*)')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      
    if (error) throw error
    return data
  },

  async createResearchRun(run: ResearchRunCreate) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('research_runs')
      .insert({
        ...run,
        status: 'Queued',
        progress: 0
      })
      .select()
      .single()
      
    if (error) throw error
    return data
  }
}
