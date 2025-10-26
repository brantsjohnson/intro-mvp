export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      ai_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          event_id: string | null
          id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          event_id?: string | null
          id?: string
          status: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          event_id?: string | null
          id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_jobs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          a: string | null
          b: string | null
          created_at: string | null
          event_id: string | null
          id: string
          source: string
        }
        Insert: {
          a?: string | null
          b?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          source: string
        }
        Update: {
          a?: string | null
          b?: string | null
          created_at?: string | null
          event_id?: string | null
          id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_members: {
        Row: {
          event_code: string | null
          event_id: string
          event_name: string | null
          first_name: string | null
          is_present: boolean | null
          joined_at: string | null
          last_name: string | null
          user_id: string
        }
        Insert: {
          event_code?: string | null
          event_id: string
          event_name?: string | null
          first_name?: string | null
          is_present?: boolean | null
          joined_at?: string | null
          last_name?: string | null
          user_id: string
        }
        Update: {
          event_code?: string | null
          event_id?: string
          event_name?: string | null
          first_name?: string | null
          is_present?: boolean | null
          joined_at?: string | null
          last_name?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_networking_goals: {
        Row: {
          created_at: string | null
          event_id: string
          networking_goals: string[]
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          event_id: string
          networking_goals: string[]
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          event_id?: string
          networking_goals?: string[]
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_networking_goals_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          code: string
          created_at: string | null
          ends_at: string | null
          header_image_url: string | null
          id: string
          is_active: boolean | null
          matchmaking_enabled: boolean | null
          name: string
          starts_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          ends_at?: string | null
          header_image_url?: string | null
          id?: string
          is_active?: boolean | null
          matchmaking_enabled?: boolean | null
          name: string
          starts_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          ends_at?: string | null
          header_image_url?: string | null
          id?: string
          is_active?: boolean | null
          matchmaking_enabled?: boolean | null
          name?: string
          starts_at?: string | null
        }
        Relationships: []
      }
      matches: {
        Row: {
          a: string | null
          b: string | null
          bases: string[]
          connected_at: string | null
          created_at: string | null
          dive_deeper: string
          event_id: string | null
          id: string
          is_connected: boolean | null
          is_met: boolean | null
          is_system: boolean | null
          match_type: string
          met_at: string | null
          shared_activities: string
          summary: string
          why_meet: string
        }
        Insert: {
          a?: string | null
          b?: string | null
          bases: string[]
          connected_at?: string | null
          created_at?: string | null
          dive_deeper: string
          event_id?: string | null
          id?: string
          is_connected?: boolean | null
          is_met?: boolean | null
          is_system?: boolean | null
          match_type?: string
          met_at?: string | null
          shared_activities: string
          summary: string
          why_meet: string
        }
        Update: {
          a?: string | null
          b?: string | null
          bases?: string[]
          connected_at?: string | null
          created_at?: string | null
          dive_deeper?: string
          event_id?: string | null
          id?: string
          is_connected?: boolean | null
          is_met?: boolean | null
          is_system?: boolean | null
          match_type?: string
          met_at?: string | null
          shared_activities?: string
          summary?: string
          why_meet?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      message_threads: {
        Row: {
          created_at: string | null
          event_id: string | null
          id: string
          last_message_at: string | null
          participant_a: string | null
          participant_b: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          event_id?: string | null
          id: string
          last_message_at?: string | null
          participant_a?: string | null
          participant_b?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          event_id?: string | null
          id?: string
          last_message_at?: string | null
          participant_a?: string | null
          participant_b?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_threads_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string | null
          event_id: string | null
          id: string
          is_read: boolean | null
          read_at: string | null
          recipient: string | null
          sender: string | null
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          event_id?: string | null
          id?: string
          is_read?: boolean | null
          read_at?: string | null
          recipient?: string | null
          sender?: string | null
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          event_id?: string | null
          id?: string
          is_read?: boolean | null
          read_at?: string | null
          recipient?: string | null
          sender?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          id: string
          payload: Json | null
          sent_at: string | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          id?: string
          payload?: Json | null
          sent_at?: string | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          id?: string
          payload?: Json | null
          sent_at?: string | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          career_goals: string | null
          company: string | null
          consent: boolean | null
          created_at: string | null
          email: string
          enneagram: string | null
          expertise_tags: string[] | null
          first_name: string
          hobbies: string[] | null
          id: string
          job_title: string | null
          last_name: string
          linkedin_url: string | null
          location: string | null
          mbti: string | null
          networking_goals: string[] | null
          what_do_you_do: string | null
          who_they_want_to_meet: string | null
        }
        Insert: {
          avatar_url?: string | null
          career_goals?: string | null
          company?: string | null
          consent?: boolean | null
          created_at?: string | null
          email: string
          enneagram?: string | null
          expertise_tags?: string[] | null
          first_name: string
          hobbies?: string[] | null
          id: string
          job_title?: string | null
          last_name: string
          linkedin_url?: string | null
          location?: string | null
          mbti?: string | null
          networking_goals?: string[] | null
          what_do_you_do?: string | null
          who_they_want_to_meet?: string | null
        }
        Update: {
          avatar_url?: string | null
          career_goals?: string | null
          company?: string | null
          consent?: boolean | null
          created_at?: string | null
          email?: string
          enneagram?: string | null
          expertise_tags?: string[] | null
          first_name?: string
          hobbies?: string[] | null
          id?: string
          job_title?: string | null
          last_name?: string
          linkedin_url?: string | null
          location?: string | null
          mbti?: string | null
          networking_goals?: string[] | null
          what_do_you_do?: string | null
          who_they_want_to_meet?: string | null
        }
        Relationships: []
      }
      user_event_stats: {
        Row: {
          event_id: string
          match_connections: number | null
          qr_connections: number | null
          user_id: string
        }
        Insert: {
          event_id: string
          match_connections?: number | null
          qr_connections?: number | null
          user_id: string
        }
        Update: {
          event_id?: string
          match_connections?: number | null
          qr_connections?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_event_stats_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      all_events_members: {
        Row: {
          avatar_url: string | null
          career_goals: string | null
          company: string | null
          enneagram: string | null
          event_code: string | null
          event_id: string | null
          event_name: string | null
          expertise_tags: string[] | null
          first_name: string | null
          hobbies: string[] | null
          is_present: boolean | null
          job_title: string | null
          joined_at: string | null
          last_name: string | null
          mbti: string | null
          networking_goals: string[] | null
          user_id: string | null
          what_do_you_do: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
