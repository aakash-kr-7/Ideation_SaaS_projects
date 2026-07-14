import { UsersRepository, UserPreferencesRow } from '../repositories/users'

export const UsersService = {
  async getUserProfile() {
    try {
      const user = await UsersRepository.getCurrentUser()
      if (!user) throw new Error("Not authenticated")
      
      const preferences = await UsersRepository.getUserPreferences(user.id)
      
      return {
        ...user,
        preferences
      }
    } catch (error) {
      console.error("UsersService.getUserProfile error:", error)
      throw error
    }
  },

  async updateUserProfile(userId: string, updates: Partial<UserPreferencesRow>) {
    try {
      return await UsersRepository.updateUserPreferences(userId, updates)
    } catch (error) {
      console.error("UsersService.updateUserProfile error:", error)
      throw error
    }
  }
}
