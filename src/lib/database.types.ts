export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          created_at: string
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
          consent: boolean
        }
        Insert: {
          id: string
          created_at?: string
          first_name: string
          last_name: string
          email: string
          avatar_url?: string | null
          job_title?: string | null
          company?: string | null
          what_do_you_do?: string | null
          location?: string | null
          linkedin_url?: string | null
          mbti?: string | null
          enneagram?: string | null
          networking_goals?: string[] | null
          consent?: boolean
        }
        Update: {
          id?: string
          created_at?: string
          first_name?: string
          last_name?: string
          email?: string
          avatar_url?: string | null
          job_title?: string | null
          company?: string | null
          what_do_you_do?: string | null
          location?: string | null
          linkedin_url?: string | null
          mbti?: string | null
          enneagram?: string | null
          networking_goals?: string[] | null
          consent?: boolean
        }
      }
      events: {
        Row: {
          id: string
          code: string
          name: string
          starts_at: string | null
          ends_at: string | null
          header_image_url: string | null
          is_active: boolean
          matchmaking_enabled: boolean
        }
        Insert: {
          id?: string
          code: string
          name: string
          starts_at?: string | null
          ends_at?: string | null
          header_image_url?: string | null
          is_active?: boolean
          matchmaking_enabled?: boolean
        }
        Update: {
          id?: string
          code?: string
          name?: string
          starts_at?: string | null
          ends_at?: string | null
          header_image_url?: string | null
          is_active?: boolean
          matchmaking_enabled?: boolean
        }
      }
      event_members: {
        Row: {
          event_id: string
          user_id: string
          joined_at: string
          is_present: boolean
        }
        Insert: {
          event_id: string
          user_id: string
          joined_at?: string
          is_present?: boolean
        }
        Update: {
          event_id?: string
          user_id?: string
          joined_at?: string
          is_present?: boolean
        }
      }
      hobbies: {
        Row: {
          id: number
          label: string
        }
        Insert: {
          id?: number
          label: string
        }
        Update: {
          id?: number
          label?: string
        }
      }
      profile_hobbies: {
        Row: {
          user_id: string
          hobby_id: number
        }
        Insert: {
          user_id: string
          hobby_id: number
        }
        Update: {
          user_id?: string
          hobby_id?: number
        }
      }
      expertise_tags: {
        Row: {
          id: number
          label: string
        }
        Insert: {
          id?: number
          label: string
        }
        Update: {
          id?: number
          label?: string
        }
      }
      profile_expertise: {
        Row: {
          user_id: string
          tag_id: number
        }
        Insert: {
          user_id: string
          tag_id: number
        }
        Update: {
          user_id?: string
          tag_id?: number
        }
      }
      event_networking_goals: {
        Row: {
          event_id: string
          user_id: string
          networking_goals: string[]
          created_at: string
          updated_at: string
        }
        Insert: {
          event_id: string
          user_id: string
          networking_goals: string[]
          created_at?: string
          updated_at?: string
        }
        Update: {
          event_id?: string
          user_id?: string
          networking_goals?: string[]
          created_at?: string
          updated_at?: string
        }
      }
      matches: {
        Row: {
          id: string
          event_id: string
          a: string
          b: string
          bases: string[]
          summary: string
          panels: Json
          created_at: string
          is_system: boolean
        }
        Insert: {
          id?: string
          event_id: string
          a: string
          b: string
          bases: string[]
          summary: string
          panels: Json
          created_at?: string
          is_system?: boolean
        }
        Update: {
          id?: string
          event_id?: string
          a?: string
          b?: string
          bases?: string[]
          summary?: string
          panels?: Json
          created_at?: string
          is_system?: boolean
        }
      }
      connections: {
        Row: {
          id: string
          event_id: string
          a: string
          b: string
          source: string
          created_at: string
        }
        Insert: {
          id?: string
          event_id: string
          a: string
          b: string
          source: string
          created_at?: string
        }
        Update: {
          id?: string
          event_id?: string
          a?: string
          b?: string
          source?: string
          created_at?: string
        }
      }
      messages: {
        Row: {
          id: string
          event_id: string
          thread_id: string
          sender: string | null
          recipient: string | null
          body: string
          created_at: string
          is_read: boolean
          read_at: string | null
        }
        Insert: {
          id?: string
          event_id: string
          thread_id: string
          sender?: string | null
          recipient?: string | null
          body: string
          created_at?: string
          is_read?: boolean
          read_at?: string | null
        }
        Update: {
          id?: string
          event_id?: string
          thread_id?: string
          sender?: string | null
          recipient?: string | null
          body?: string
          created_at?: string
          is_read?: boolean
          read_at?: string | null
        }
      }
      message_threads: {
        Row: {
          id: string
          event_id: string
          participant_a: string
          participant_b: string
          created_at: string
          updated_at: string
          last_message_at: string | null
        }
        Insert: {
          id?: string
          event_id: string
          participant_a: string
          participant_b: string
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
        }
        Update: {
          id?: string
          event_id?: string
          participant_a?: string
          participant_b?: string
          created_at?: string
          updated_at?: string
          last_message_at?: string | null
        }
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string | null
          payload: Json | null
          sent_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          type?: string | null
          payload?: Json | null
          sent_at?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          type?: string | null
          payload?: Json | null
          sent_at?: string | null
        }
      }
      ai_jobs: {
        Row: {
          id: string
          event_id: string
          status: string
          created_by: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          event_id: string
          status?: string
          created_by?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Update: {
          id?: string
          event_id?: string
          status?: string
          created_by?: string | null
          created_at?: string
          completed_at?: string | null
        }
      }
      user_event_stats: {
        Row: {
          event_id: string
          user_id: string
          qr_connections: number
          match_connections: number
        }
        Insert: {
          event_id: string
          user_id: string
          qr_connections?: number
          match_connections?: number
        }
        Update: {
          event_id?: string
          user_id?: string
          qr_connections?: number
          match_connections?: number
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      match_basis: "career" | "personality" | "interests"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
