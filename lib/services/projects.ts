import { ProjectsRepository, ProjectRow } from '../repositories/projects'

export const ProjectsService = {
  async createProject(project: Omit<ProjectRow, 'id' | 'created_at' | 'updated_at'>) {
    try {
      // Potentially perform validation or trigger analytics events here
      return await ProjectsRepository.createProject(project)
    } catch (error) {
      console.error("ProjectsService.createProject error:", error)
      throw error
    }
  },

  async getTeamProjects(teamId: string) {
    try {
      return await ProjectsRepository.getTeamProjects(teamId)
    } catch (error) {
      console.error("ProjectsService.getTeamProjects error:", error)
      throw error
    }
  }
}
