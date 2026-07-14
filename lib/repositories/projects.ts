import { createClient } from '../supabase/server'
import { Tables } from '../types'

export type ProjectRow = Tables<'projects'>

export const ProjectsRepository = {
  async getTeamProjects(teamId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })
      
    if (error) throw error
    return data
  },

  async createProject(project: Omit<ProjectRow, 'id' | 'created_at' | 'updated_at'>) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('projects')
      .insert(project)
      .select()
      .single()
      
    if (error) throw error
    return data
  }
}
