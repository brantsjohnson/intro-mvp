export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          user_id: string
          email: string | null
          first_name: string | null
          last_name: string | null
          photo_url: string | null
          career_title: string | null
          career_years_experience: number | null
          company_name: string | null
          company_summary: string | null
          expertise_summary: string | null
          hobbies: string[] | null
          linkedin_raw_json: Json | null
          linkedin_skills: string[] | null
          linkedin_titles: string[] | null
          linkedin_companies: string[] | null
          offer_summary_text: string | null
          offer_embedding: unknown | null
          offer_tags: string[] | null
          want_summary_text: string | null
          want_embedding: unknown | null
          want_tags: string[] | null
          need_embedding: unknown | null
          need_tags: string[] | null
          profile_embedding: unknown | null
          career_goals_tags: string[] | null
          industry_tags: string[] | null
          hobby_tags: string[] | null
          personality_embedding: unknown | null
          engagement_availability_status: string | null
          collaboration_role_intent: string | null
          personality_json: Json | null
          bigfive_scores: Json | null
          mbti_type: string | null
          enneagram_type: string | null
          love_language_primary: string | null
          communication_style: string | null
          clifton_strengths: string[] | null
          personality_confidence: Json | null
          personality_last_updated: string | null
          admin_event_codes: string[] | null
          phone_number: string | null
          sms_notifications_enabled: boolean | null
          email_notifications_enabled: boolean | null
        }
        Insert: Partial<Database["public"]["Tables"]["users"]["Row"]> & {
          user_id: string
        }
        Update: Partial<Database["public"]["Tables"]["users"]["Row"]>
        Relationships: []
      }
      events: {
        Row: {
          event_id: string
          event_code: string
          event_name: string
          event_location: string | null
          event_starts_at: string | null
          event_ends_at: string | null
          onboarding_question_schema: Json | null
          matching_config: Json | null
        }
        Insert: Partial<Database["public"]["Tables"]["events"]["Row"]> & {
          event_code: string
          event_name: string
        }
        Update: Partial<Database["public"]["Tables"]["events"]["Row"]>
        Relationships: []
      }
      attendance: {
        Row: {
          event_id: string
          user_id: string
          attendance_id: string | null
          attendee_first_name: string | null
          attendee_last_name: string | null
          why_attending_text: string | null
          connection_types_selected: string[] | null
          connection_followups_json: Json | null
          business_need_text: string | null
          event_profile_summary_text: string | null
          event_profile_embedding: unknown | null
          profile_embedding: unknown | null
          event_offer_tags: string[] | null
          event_want_tags: string[] | null
          event_need_tags: string[] | null
          event_industry_tags: string[] | null
          event_hobby_tags: string[] | null
          event_goals_tags: string[] | null
          event_availability_status: string | null
          event_role_intent: string | null
          is_sponsor: boolean | null
          match_count: number | null
          user_connection_count: number | null
          checked_in_at: string | null
          last_seen_at: string | null
          last_profile_change_at: string | null
          onboarding_completed: boolean | null
          adaptive_qna_json: Json | null
          created_at: string | null
          updated_at: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["attendance"]["Row"]> & {
          event_id: string
          user_id: string
        }
        Update: Partial<Database["public"]["Tables"]["attendance"]["Row"]>
        Relationships: [
          {
            foreignKeyName: "attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "attendance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          }
        ]
      }
      connections: {
        Row: {
          connection_id: string
          event_id: string
          a_id: string
          b_id: string
          connection_kind: string
          user_add_method: string | null
          created_by_user_id: string | null
          match_score: number | null
          match_score_breakdown_json: Json | null
          match_explanation_text: string | null
          locked_until_utc: string | null
          is_superseded: boolean | null
          superseded_by_connection_id: string | null
          match_algorithm_version: string | null
          matched_by_model_id: string | null
          matched_by_job_id: string | null
          created_at: string | null
        }
        Insert: Omit<Database["public"]["Tables"]["connections"]["Row"], "connection_id"> & {
          connection_id?: string
        }
        Update: Partial<Database["public"]["Tables"]["connections"]["Row"]>
        Relationships: []
      }
      conversations: {
        Row: {
          conversation_id: string
          event_id: string | null
          conversation_title: string | null
          participant_user_ids: string[]
          created_by_user_id: string | null
          created_at: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["conversations"]["Row"]>
        Update: Partial<Database["public"]["Tables"]["conversations"]["Row"]>
        Relationships: []
      }
      messages: {
        Row: {
          message_id: string
          conversation_id: string
          sender_user_id: string
          message_body: string
          created_at: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["messages"]["Row"]> & {
          conversation_id: string
          sender_user_id: string
          message_body: string
        }
        Update: Partial<Database["public"]["Tables"]["messages"]["Row"]>
        Relationships: []
      }
      event_survey_tokens: {
        Row: {
          id: string
          event_id: string
          recipient_user_id: string | null
          recipient_email: string
          token: string
          expires_at: string
          used_at: string | null
          created_at: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["event_survey_tokens"]["Row"]> & {
          event_id: string
          recipient_email: string
          token: string
          expires_at?: string
        }
        Update: Partial<Database["public"]["Tables"]["event_survey_tokens"]["Row"]>
        Relationships: [
          {
            foreignKeyName: "event_survey_tokens_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_survey_tokens_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          }
        ]
      }
      event_survey_responses: {
        Row: {
          id: string
          event_id: string
          token_id: string | null
          recipient_user_id: string | null
          recipient_email: string | null
          rating_custom: number | null
          rating_useful: number | null
          rating_business: number | null
          open_answer: string | null
          custom_question: string | null
          created_at: string | null
        }
        Insert: Partial<Database["public"]["Tables"]["event_survey_responses"]["Row"]> & {
          event_id: string
        }
        Update: Partial<Database["public"]["Tables"]["event_survey_responses"]["Row"]>
        Relationships: [
          {
            foreignKeyName: "event_survey_responses_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_survey_responses_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "event_survey_tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_survey_responses_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["user_id"]
          }
        ]
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
    CompositeTypes: {}
  }
}

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"]
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"]
