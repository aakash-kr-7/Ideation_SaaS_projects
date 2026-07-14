import { ResearchRepository, ResearchRunRow } from '../repositories/research'

export const ResearchService = {
  async startResearchRun(run: Omit<ResearchRunRow, 'id' | 'created_at' | 'updated_at' | 'progress' | 'status' | 'error_message'>) {
    try {
      // Create the record. A Supabase webhook triggers the background worker.
      return await ResearchRepository.createResearchRun(run)
    } catch (error) {
      console.error("ResearchService.startResearchRun error:", error)
      throw error
    }
  },

  async getResearchRuns(projectId: string) {
    try {
      return await ResearchRepository.getProjectRuns(projectId)
    } catch (error) {
      console.error("ResearchService.getResearchRuns error:", error)
      throw error
    }
  }
}
