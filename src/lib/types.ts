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
  networking_goals: string[] | null
  hobbies: string[] | null
  expertise_tags: string[] | null
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

export interface Hobby {
  id: number
  label: string
}

export interface CustomHobby {
  id: string
  user_id: string
  label: string
  created_at: string
}

export interface ProfileCustomHobby {
  user_id: string
  custom_hobby_id: string
  details: string | null
}

export interface Match {
  id: string
  event_id: string
  a: string
  b: string
  bases: string[]
  summary: string
  why_meet: string
  shared_activities: string
  dive_deeper: string
  created_at: string
  is_system: boolean
  is_met: boolean
  met_at: string | null
}

export interface Connection {
  id: string
  event_id: string
  a: string
  b: string
  source: string
  created_at: string
}

export interface Message {
  id: string
  event_id: string
  thread_id: string
  sender: string | null
  recipient: string | null
  body: string
  created_at: string
}
