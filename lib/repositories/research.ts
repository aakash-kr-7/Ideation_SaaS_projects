import { createClient } from '../supabase/server'
import { Tables } from '../types'

export type ResearchRunRow = Tables<'research_runs'>

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

  async createResearchRun(run: Omit<ResearchRunRow, 'id' | 'created_at' | 'updated_at' | 'progress' | 'status' | 'error_message'>) {
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
