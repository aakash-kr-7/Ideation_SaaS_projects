import { TeamsRepository } from '../repositories/teams'

export const TeamsService = {
  async getTeamInfo(teamId: string) {
    try {
      return await TeamsRepository.getTeamById(teamId)
    } catch (error) {
      console.error("TeamsService.getTeamInfo error:", error)
      throw error
    }
  },

  async getUserTeams() {
    try {
      return await TeamsRepository.getUserTeams()
    } catch (error) {
      console.error("TeamsService.getUserTeams error:", error)
      throw error
    }
  }
}
