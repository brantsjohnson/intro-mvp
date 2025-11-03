export interface User {
  id: string
  email?: string
  user_metadata?: {
    first_name?: string
    last_name?: string
    avatar_url?: string
  }
}

export interface Profile {
  id: string
  first_name: string
  last_name: string
  email: string
  avatar_url: string | null
  job_title: string | null
  company: string | null
  what_do_you_do: string | null
  location: string | null
  linkedin_url: string | null
  mbti: string | null
  enneagram: string | null
  networking_goals: string[] | null // Not in current schema but kept for compatibility
  hobbies: string[] | null // Not in current schema but kept for compatibility
  expertise_tags: string[] | null // Not in current schema but kept for compatibility
  consent: boolean
}

export interface Event {
  id: string
  name: string
  code: string
  starts_at: string | null
  ends_at: string | null
  header_image_url: string | null
  is_active: boolean
  matchmaking_enabled: boolean
}

// Old interfaces removed - hobbies, matches, and old connection schema no longer used
// New schema uses connections table with a_id, b_id, connection_kind, match_explanation_text, etc.

export interface Message {
  id: string
  event_id: string
  thread_id: string
  sender: string | null
  recipient: string | null
  body: string
  created_at: string
}
