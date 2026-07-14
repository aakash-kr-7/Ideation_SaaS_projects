import { createClient } from '../supabase/server'
import { Tables } from '../types'

export type UserRow = Tables<'users'>
export type UserPreferencesRow = Tables<'user_preferences'>

export const UsersRepository = {
  async getCurrentUser() {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    if (!user) return null

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profileError) throw profileError
    return profile
  },

  async getUserPreferences(userId: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', userId)
      .single()
      
    if (error) throw error
    return data
  },

  async updateUserPreferences(userId: string, updates: Partial<UserPreferencesRow>) {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('user_preferences')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single()
      
    if (error) throw error
    return data
  }
}
