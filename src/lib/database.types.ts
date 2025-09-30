// TODO: Rebuild when Supabase is restored
// This file contains placeholder types for the database schema
// The actual database was wiped and needs to be rebuilt

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// PLACEHOLDER: Database interface - needs to be rebuilt when Supabase is restored
export interface Database {
  public: {
    Tables: {
      // TODO: Rebuild these tables in Supabase:
      // - profiles (with career_goals field instead of what_do_you_do)
      // - events  
      // - event_members
      // - hobbies
      // - profile_hobbies
      // - expertise_tags
      // - profile_expertise
      // - event_networking_goals
      // - matches
      // - connections
      // - messages
      // - message_threads
      // - notifications
      // - ai_jobs
      // - user_event_stats
      [_ in never]: never
    }
    Views: {
      // TODO: Rebuild these views in Supabase:
      // - all_events_members
      [_ in never]: never
    }
    Functions: {
      // TODO: Rebuild these functions in Supabase:
      // - matchmaking triggers
      // - RLS policies
      [_ in never]: never
    }
    Enums: {
      // TODO: Rebuild these enums in Supabase:
      // - match_basis: "career" | "personality" | "interests"
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
