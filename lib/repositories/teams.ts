import { createClient } from '../supabase/server'
import { Tables } from '../types'

export type TeamRow = Tables<'teams'>
export type TeamMemberRow = Tables<'team_members'>

export const TeamsRepository = {
  async getUserTeams() {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('teams')
      .select('*, team_members(*)')
      
    if (error) throw error
    return data
  },

  async getTeamById(teamId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('teams')
      .select('*, team_members(*), feature_limits(*)')
      .eq('id', teamId)
      .single()
      
    if (error) throw error
    return data
  }
}
