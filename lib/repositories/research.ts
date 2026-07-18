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
  }
}
