import { ResearchRepository, ResearchRunRow } from '../repositories/research'

type ResearchRunCreate = Omit<ResearchRunRow, 'id' | 'created_at' | 'updated_at' | 'progress' | 'status' | 'error_message' | 'progress_detail' | 'retrieval_budget_limited' | 'retrieval_coverage' | 'retrieval_coverage_gaps' | 'retrieval_sufficient'>

export const ResearchService = {
  async startResearchRun(run: ResearchRunCreate) {
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
