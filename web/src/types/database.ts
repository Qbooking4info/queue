// Auto-generated from Supabase schema — do not edit by hand
// Regenerate with: supabase gen types typescript --linked (from repo root)

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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          actor_auth_id: string
          actor_role: string
          created_at: string
          id: string
          ip_address: unknown
          new_value: Json | null
          old_value: Json | null
          target_id: string | null
          target_table: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_auth_id: string
          actor_role: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_auth_id?: string
          actor_role?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          new_value?: Json | null
          old_value?: Json | null
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      appointment_documents: {
        Row: {
          appointment_id: string
          created_at: string | null
          doc_type: string | null
          file_name: string | null
          file_size: number | null
          id: string
          mime_type: string | null
          uploaded_by: string
          url: string
        }
        Insert: {
          appointment_id: string
          created_at?: string | null
          doc_type?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          uploaded_by: string
          url: string
        }
        Update: {
          appointment_id?: string
          created_at?: string | null
          doc_type?: string | null
          file_name?: string | null
          file_size?: number | null
          id?: string
          mime_type?: string | null
          uploaded_by?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_documents_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_documents_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments_with_vitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          appointment_date: string
          approval_note: string | null
          approval_status: string | null
          assigned_doctor_id: string | null
          booked_by_staff_id: string | null
          booking_mode: string | null
          booking_ref: string
          cancellation_reason: string | null
          cancelled_at: string | null
          check_in_date: string | null
          clinic_id: string | null
          consult_duration_secs: number | null
          consult_ended_at: string | null
          consult_started_at: string | null
          created_at: string | null
          dependent_id: string | null
          diagnosis: string | null
          doctor_id: string | null
          doctor_notes: string | null
          emr_record_id: string | null
          emr_synced: boolean | null
          estimated_wait: number | null
          evidence_url: string | null
          hospital_id: string
          id: string
          no_show_at: string | null
          patient_id: string | null
          payment_method: string | null
          prescription_url: string | null
          queue_position: number | null
          reason: string | null
          refund_pct: number | null
          reminder_sent_1h: boolean | null
          reminder_sent_24h: boolean | null
          reschedule_deadline: string | null
          rescheduled_from: string | null
          service_id: string | null
          slot_id: string | null
          start_time: string
          status: string
          symptom_description: string | null
          type: string
          updated_at: string | null
          urgency: string | null
          walkin_patient_name: string | null
          walkin_patient_phone: string | null
        }
        Insert: {
          appointment_date: string
          approval_note?: string | null
          approval_status?: string | null
          assigned_doctor_id?: string | null
          booked_by_staff_id?: string | null
          booking_mode?: string | null
          booking_ref?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          check_in_date?: string | null
          clinic_id?: string | null
          consult_duration_secs?: number | null
          consult_ended_at?: string | null
          consult_started_at?: string | null
          created_at?: string | null
          dependent_id?: string | null
          diagnosis?: string | null
          doctor_id?: string | null
          doctor_notes?: string | null
          emr_record_id?: string | null
          emr_synced?: boolean | null
          estimated_wait?: number | null
          evidence_url?: string | null
          hospital_id: string
          id?: string
          no_show_at?: string | null
          patient_id?: string | null
          payment_method?: string | null
          prescription_url?: string | null
          queue_position?: number | null
          reason?: string | null
          refund_pct?: number | null
          reminder_sent_1h?: boolean | null
          reminder_sent_24h?: boolean | null
          reschedule_deadline?: string | null
          rescheduled_from?: string | null
          service_id?: string | null
          slot_id?: string | null
          start_time: string
          status?: string
          symptom_description?: string | null
          type: string
          updated_at?: string | null
          urgency?: string | null
          walkin_patient_name?: string | null
          walkin_patient_phone?: string | null
        }
        Update: {
          appointment_date?: string
          approval_note?: string | null
          approval_status?: string | null
          assigned_doctor_id?: string | null
          booked_by_staff_id?: string | null
          booking_mode?: string | null
          booking_ref?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          check_in_date?: string | null
          clinic_id?: string | null
          consult_duration_secs?: number | null
          consult_ended_at?: string | null
          consult_started_at?: string | null
          created_at?: string | null
          dependent_id?: string | null
          diagnosis?: string | null
          doctor_id?: string | null
          doctor_notes?: string | null
          emr_record_id?: string | null
          emr_synced?: boolean | null
          estimated_wait?: number | null
          evidence_url?: string | null
          hospital_id?: string
          id?: string
          no_show_at?: string | null
          patient_id?: string | null
          payment_method?: string | null
          prescription_url?: string | null
          queue_position?: number | null
          reason?: string | null
          refund_pct?: number | null
          reminder_sent_1h?: boolean | null
          reminder_sent_24h?: boolean | null
          reschedule_deadline?: string | null
          rescheduled_from?: string | null
          service_id?: string | null
          slot_id?: string | null
          start_time?: string
          status?: string
          symptom_description?: string | null
          type?: string
          updated_at?: string | null
          urgency?: string | null
          walkin_patient_name?: string | null
          walkin_patient_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_assigned_doctor_id_fkey"
            columns: ["assigned_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_booked_by_staff_id_fkey"
            columns: ["booked_by_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "hospital_clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_dependent_id_fkey"
            columns: ["dependent_id"]
            isOneToOne: false
            referencedRelation: "dependents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_rescheduled_from_fkey"
            columns: ["rescheduled_from"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_rescheduled_from_fkey"
            columns: ["rescheduled_from"]
            isOneToOne: false
            referencedRelation: "appointments_with_vitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "time_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      availability_templates: {
        Row: {
          created_at: string | null
          day_of_week: number
          doctor_id: string
          end_time: string
          id: string
          is_active: boolean | null
          is_virtual: boolean | null
          max_concurrent: number | null
          slot_duration: number | null
          start_time: string
        }
        Insert: {
          created_at?: string | null
          day_of_week: number
          doctor_id: string
          end_time: string
          id?: string
          is_active?: boolean | null
          is_virtual?: boolean | null
          max_concurrent?: number | null
          slot_duration?: number | null
          start_time: string
        }
        Update: {
          created_at?: string | null
          day_of_week?: number
          doctor_id?: string
          end_time?: string
          id?: string
          is_active?: boolean | null
          is_virtual?: boolean | null
          max_concurrent?: number | null
          slot_duration?: number | null
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_templates_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_admins: {
        Row: {
          auth_user_id: string | null
          clinic_id: string
          created_at: string | null
          hospital_id: string
          id: string
          is_active: boolean | null
          role: string | null
          user_id: string
        }
        Insert: {
          auth_user_id?: string | null
          clinic_id: string
          created_at?: string | null
          hospital_id: string
          id?: string
          is_active?: boolean | null
          role?: string | null
          user_id: string
        }
        Update: {
          auth_user_id?: string | null
          clinic_id?: string
          created_at?: string | null
          hospital_id?: string
          id?: string
          is_active?: boolean | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_admins_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "hospital_clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_admins_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          created_at: string | null
          description: string | null
          display_order: number | null
          hospital_id: string
          id: string
          is_active: boolean
          is_opd: boolean
          name: string
          requires_referral: boolean
          specialty_id: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          hospital_id: string
          id?: string
          is_active?: boolean
          is_opd?: boolean
          name: string
          requires_referral?: boolean
          specialty_id?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          display_order?: number | null
          hospital_id?: string
          id?: string
          is_active?: boolean
          is_opd?: boolean
          name?: string
          requires_referral?: boolean
          specialty_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinics_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinics_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      dependents: {
        Row: {
          created_at: string | null
          date_of_birth: string | null
          full_name: string
          gender: string | null
          id: string
          relationship: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          date_of_birth?: string | null
          full_name: string
          gender?: string | null
          id?: string
          relationship?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          date_of_birth?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          relationship?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dependents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      doctor_specialties: {
        Row: {
          doctor_id: string
          specialty_id: string
        }
        Insert: {
          doctor_id: string
          specialty_id: string
        }
        Update: {
          doctor_id?: string
          specialty_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "doctor_specialties_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctor_specialties_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      doctors: {
        Row: {
          accepts_virtual: boolean | null
          auth_user_id: string | null
          availability_status: string | null
          avatar_url: string | null
          avg_rating: number | null
          bio: string | null
          clinic_id: string | null
          consultation_fee: number | null
          created_at: string | null
          doctor_id: string | null
          email: string | null
          full_name: string
          hospital_id: string
          id: string
          is_active: boolean | null
          mdcn_number: string | null
          qualification: string | null
          review_count: number | null
          specialty_id: string | null
          title: string | null
          updated_at: string | null
          user_id: string | null
          virtual_fee: number | null
          years_experience: number | null
        }
        Insert: {
          accepts_virtual?: boolean | null
          auth_user_id?: string | null
          availability_status?: string | null
          avatar_url?: string | null
          avg_rating?: number | null
          bio?: string | null
          clinic_id?: string | null
          consultation_fee?: number | null
          created_at?: string | null
          doctor_id?: string | null
          email?: string | null
          full_name: string
          hospital_id: string
          id?: string
          is_active?: boolean | null
          mdcn_number?: string | null
          qualification?: string | null
          review_count?: number | null
          specialty_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
          virtual_fee?: number | null
          years_experience?: number | null
        }
        Update: {
          accepts_virtual?: boolean | null
          auth_user_id?: string | null
          availability_status?: string | null
          avatar_url?: string | null
          avg_rating?: number | null
          bio?: string | null
          clinic_id?: string | null
          consultation_fee?: number | null
          created_at?: string | null
          doctor_id?: string | null
          email?: string | null
          full_name?: string
          hospital_id?: string
          id?: string
          is_active?: boolean | null
          mdcn_number?: string | null
          qualification?: string | null
          review_count?: number | null
          specialty_id?: string | null
          title?: string | null
          updated_at?: string | null
          user_id?: string | null
          virtual_fee?: number | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "hospital_clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "doctors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      emr_integrations: {
        Row: {
          auth_type: string | null
          created_at: string | null
          credentials: Json | null
          error_message: string | null
          fhir_base_url: string | null
          hospital_id: string
          id: string
          is_active: boolean | null
          last_sync_at: string | null
          sync_status: string | null
          system_name: string
          updated_at: string | null
        }
        Insert: {
          auth_type?: string | null
          created_at?: string | null
          credentials?: Json | null
          error_message?: string | null
          fhir_base_url?: string | null
          hospital_id: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          sync_status?: string | null
          system_name: string
          updated_at?: string | null
        }
        Update: {
          auth_type?: string | null
          created_at?: string | null
          credentials?: Json | null
          error_message?: string | null
          fhir_base_url?: string | null
          hospital_id?: string
          id?: string
          is_active?: boolean | null
          last_sync_at?: string | null
          sync_status?: string | null
          system_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "emr_integrations_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: true
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_admins: {
        Row: {
          admin_id: string | null
          created_at: string | null
          credentials: Json | null
          hospital_id: string
          id: string
          is_active: boolean
          role: string | null
          user_id: string
        }
        Insert: {
          admin_id?: string | null
          created_at?: string | null
          credentials?: Json | null
          hospital_id: string
          id?: string
          is_active?: boolean
          role?: string | null
          user_id: string
        }
        Update: {
          admin_id?: string | null
          created_at?: string | null
          credentials?: Json | null
          hospital_id?: string
          id?: string
          is_active?: boolean
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospital_admins_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_clinic_hours: {
        Row: {
          clinic_id: string
          close_time: string
          created_at: string
          day_of_week: number
          id: string
          is_closed: boolean
          open_time: string
        }
        Insert: {
          clinic_id: string
          close_time?: string
          created_at?: string
          day_of_week: number
          id?: string
          is_closed?: boolean
          open_time?: string
        }
        Update: {
          clinic_id?: string
          close_time?: string
          created_at?: string
          day_of_week?: number
          id?: string
          is_closed?: boolean
          open_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospital_clinic_hours_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "hospital_clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_clinics: {
        Row: {
          created_at: string | null
          daily_booking_limit: number | null
          description: string | null
          hospital_id: string
          id: string
          is_active: boolean | null
          is_emergency: boolean
          is_opd: boolean
          name: string
          service_tags: string[]
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          daily_booking_limit?: number | null
          description?: string | null
          hospital_id: string
          id?: string
          is_active?: boolean | null
          is_emergency?: boolean
          is_opd?: boolean
          name: string
          service_tags?: string[]
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          daily_booking_limit?: number | null
          description?: string | null
          hospital_id?: string
          id?: string
          is_active?: boolean | null
          is_emergency?: boolean
          is_opd?: boolean
          name?: string
          service_tags?: string[]
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hospital_clinics_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_images: {
        Row: {
          caption: string | null
          created_at: string | null
          hospital_id: string
          id: string
          sort_order: number | null
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string | null
          hospital_id: string
          id?: string
          sort_order?: number | null
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string | null
          hospital_id?: string
          id?: string
          sort_order?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospital_images_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_operating_hours: {
        Row: {
          close_time: string
          day_of_week: number
          hospital_id: string
          id: string
          is_closed: boolean | null
          open_time: string
        }
        Insert: {
          close_time: string
          day_of_week: number
          hospital_id: string
          id?: string
          is_closed?: boolean | null
          open_time: string
        }
        Update: {
          close_time?: string
          day_of_week?: number
          hospital_id?: string
          id?: string
          is_closed?: boolean | null
          open_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospital_operating_hours_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_specialties: {
        Row: {
          hospital_id: string
          specialty_id: string
        }
        Insert: {
          hospital_id: string
          specialty_id: string
        }
        Update: {
          hospital_id?: string
          specialty_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hospital_specialties_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_specialties_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_subscriptions: {
        Row: {
          billing_cycle: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          grace_period_ends_at: string | null
          hospital_id: string
          id: string
          paystack_customer_id: string | null
          paystack_sub_code: string | null
          plan_id: string
          status: string
          trial_ends_at: string | null
          updated_at: string | null
        }
        Insert: {
          billing_cycle?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          grace_period_ends_at?: string | null
          hospital_id: string
          id?: string
          paystack_customer_id?: string | null
          paystack_sub_code?: string | null
          plan_id: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Update: {
          billing_cycle?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          grace_period_ends_at?: string | null
          hospital_id?: string
          id?: string
          paystack_customer_id?: string | null
          paystack_sub_code?: string | null
          plan_id?: string
          status?: string
          trial_ends_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hospital_subscriptions_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: true
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hospital_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      hospitals: {
        Row: {
          accepts_virtual: boolean | null
          address: string
          approval_mode: string | null
          avg_rating: number | null
          city: string
          clinic_model: string | null
          country: string | null
          cover_url: string | null
          created_at: string | null
          daily_booking_limit: number | null
          description: string | null
          email: string | null
          emergency_hours: boolean | null
          emr_system: string | null
          hospital_id: string | null
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          mdcn_accreditation: string | null
          name: string
          opd_fee: number | null
          phone: string | null
          registration_number: string | null
          requires_referral: boolean | null
          review_count: number | null
          slug: string
          state: string
          total_bookings: number | null
          type: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          accepts_virtual?: boolean | null
          address: string
          approval_mode?: string | null
          avg_rating?: number | null
          city: string
          clinic_model?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string | null
          daily_booking_limit?: number | null
          description?: string | null
          email?: string | null
          emergency_hours?: boolean | null
          emr_system?: string | null
          hospital_id?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          mdcn_accreditation?: string | null
          name: string
          opd_fee?: number | null
          phone?: string | null
          registration_number?: string | null
          requires_referral?: boolean | null
          review_count?: number | null
          slug: string
          state: string
          total_bookings?: number | null
          type?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          accepts_virtual?: boolean | null
          address?: string
          approval_mode?: string | null
          avg_rating?: number | null
          city?: string
          clinic_model?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string | null
          daily_booking_limit?: number | null
          description?: string | null
          email?: string | null
          emergency_hours?: boolean | null
          emr_system?: string | null
          hospital_id?: string | null
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          mdcn_accreditation?: string | null
          name?: string
          opd_fee?: number | null
          phone?: string | null
          registration_number?: string | null
          requires_referral?: boolean | null
          review_count?: number | null
          slug?: string
          state?: string
          total_bookings?: number | null
          type?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          sent_at: string | null
          sent_via: string[] | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          sent_at?: string | null
          sent_via?: string[] | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          sent_at?: string | null
          sent_via?: string[] | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_medical_history: {
        Row: {
          allergies: string[]
          conditions: string[]
          family_history: string | null
          id: string
          medications: string | null
          other_conditions: string | null
          patient_id: string
          surgeries: string | null
          updated_at: string
        }
        Insert: {
          allergies?: string[]
          conditions?: string[]
          family_history?: string | null
          id?: string
          medications?: string | null
          other_conditions?: string | null
          patient_id: string
          surgeries?: string | null
          updated_at?: string
        }
        Update: {
          allergies?: string[]
          conditions?: string[]
          family_history?: string | null
          id?: string
          medications?: string | null
          other_conditions?: string | null
          patient_id?: string
          surgeries?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_medical_history_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          appointment_id: string | null
          created_at: string | null
          currency: string
          hospital_id: string
          hospital_payout: number | null
          id: string
          metadata: Json | null
          method: string | null
          paid_at: string | null
          patient_id: string
          paystack_access_code: string | null
          paystack_ref: string | null
          platform_fee: number
          refund_reason: string | null
          refunded_at: string | null
          status: string
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          created_at?: string | null
          currency?: string
          hospital_id: string
          hospital_payout?: number | null
          id?: string
          metadata?: Json | null
          method?: string | null
          paid_at?: string | null
          patient_id: string
          paystack_access_code?: string | null
          paystack_ref?: string | null
          platform_fee?: number
          refund_reason?: string | null
          refunded_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          created_at?: string | null
          currency?: string
          hospital_id?: string
          hospital_payout?: number | null
          id?: string
          metadata?: Json | null
          method?: string | null
          paid_at?: string | null
          patient_id?: string
          paystack_access_code?: string | null
          paystack_ref?: string | null
          platform_fee?: number
          refund_reason?: string | null
          refunded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments_with_vitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          bank_account: string | null
          booking_count: number | null
          created_at: string | null
          hospital_id: string
          id: string
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          transfer_ref: string | null
        }
        Insert: {
          amount: number
          bank_account?: string | null
          booking_count?: number | null
          created_at?: string | null
          hospital_id: string
          id?: string
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string
          transfer_ref?: string | null
        }
        Update: {
          amount?: number
          bank_account?: string | null
          booking_count?: number | null
          created_at?: string | null
          hospital_id?: string
          id?: string
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string
          transfer_ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_admins_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_log: {
        Row: {
          created_at: string
          id: number
          key: string
        }
        Insert: {
          created_at?: string
          id?: never
          key: string
        }
        Update: {
          created_at?: string
          id?: never
          key?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          appointment_id: string
          body: string | null
          created_at: string | null
          doctor_id: string
          hospital_id: string
          hospital_reply: string | null
          id: string
          is_visible: boolean | null
          patient_id: string
          rating: number
          replied_at: string | null
        }
        Insert: {
          appointment_id: string
          body?: string | null
          created_at?: string | null
          doctor_id: string
          hospital_id: string
          hospital_reply?: string | null
          id?: string
          is_visible?: boolean | null
          patient_id: string
          rating: number
          replied_at?: string | null
        }
        Update: {
          appointment_id?: string
          body?: string | null
          created_at?: string | null
          doctor_id?: string
          hospital_id?: string
          hospital_reply?: string | null
          id?: string
          is_visible?: boolean | null
          patient_id?: string
          rating?: number
          replied_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments_with_vitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          base_price: number | null
          clinic_id: string | null
          created_at: string | null
          description: string | null
          duration_mins: number | null
          hospital_id: string
          id: string
          is_active: boolean | null
          name: string
          specialty_id: string | null
          virtual_price: number | null
        }
        Insert: {
          base_price?: number | null
          clinic_id?: string | null
          created_at?: string | null
          description?: string | null
          duration_mins?: number | null
          hospital_id: string
          id?: string
          is_active?: boolean | null
          name: string
          specialty_id?: string | null
          virtual_price?: number | null
        }
        Update: {
          base_price?: number | null
          clinic_id?: string | null
          created_at?: string | null
          description?: string | null
          duration_mins?: number | null
          hospital_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          specialty_id?: string | null
          virtual_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "services_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "hospital_clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "services_specialty_id_fkey"
            columns: ["specialty_id"]
            isOneToOne: false
            referencedRelation: "specialties"
            referencedColumns: ["id"]
          },
        ]
      }
      slot_overrides: {
        Row: {
          created_at: string | null
          doctor_id: string
          id: string
          is_blocked: boolean | null
          override_date: string
          reason: string | null
        }
        Insert: {
          created_at?: string | null
          doctor_id: string
          id?: string
          is_blocked?: boolean | null
          override_date: string
          reason?: string | null
        }
        Update: {
          created_at?: string | null
          doctor_id?: string
          id?: string
          is_blocked?: boolean | null
          override_date?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "slot_overrides_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      specialties: {
        Row: {
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          sort_order: number | null
        }
        Insert: {
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          sort_order?: number | null
        }
        Update: {
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          created_at: string | null
          display_name: string
          features: Json | null
          id: string
          is_active: boolean | null
          max_doctors: number | null
          max_monthly_bookings: number | null
          name: string
          price_annual: number | null
          price_monthly: number
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_doctors?: number | null
          max_monthly_bookings?: number | null
          name: string
          price_annual?: number | null
          price_monthly: number
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          features?: Json | null
          id?: string
          is_active?: boolean | null
          max_doctors?: number | null
          max_monthly_bookings?: number | null
          name?: string
          price_annual?: number | null
          price_monthly?: number
          sort_order?: number | null
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          message: string
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          message: string
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          message?: string
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      time_slots: {
        Row: {
          booked_count: number | null
          created_at: string | null
          doctor_id: string
          end_time: string
          hospital_id: string
          id: string
          is_available: boolean | null
          is_virtual: boolean | null
          max_capacity: number | null
          slot_date: string
          start_time: string
        }
        Insert: {
          booked_count?: number | null
          created_at?: string | null
          doctor_id: string
          end_time: string
          hospital_id: string
          id?: string
          is_available?: boolean | null
          is_virtual?: boolean | null
          max_capacity?: number | null
          slot_date: string
          start_time: string
        }
        Update: {
          booked_count?: number | null
          created_at?: string | null
          doctor_id?: string
          end_time?: string
          hospital_id?: string
          id?: string
          is_available?: boolean | null
          is_virtual?: boolean | null
          max_capacity?: number | null
          slot_date?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_slots_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_slots_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      user_insurance: {
        Row: {
          created_at: string | null
          group_number: string | null
          id: string
          member_id: string
          plan_name: string | null
          provider: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          group_number?: string | null
          id?: string
          member_id: string
          plan_name?: string | null
          provider: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          group_number?: string | null
          id?: string
          member_id?: string
          plan_name?: string | null
          provider?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_insurance_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          address: string | null
          auth_id: string | null
          avatar_url: string | null
          blood_group: string | null
          city: string | null
          country: string | null
          created_at: string | null
          date_of_birth: string | null
          email: string
          full_name: string
          gender: string | null
          id: string
          is_verified: boolean | null
          patient_id: string | null
          patient_number: string | null
          phone: string | null
          push_token: string | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          address?: string | null
          auth_id?: string | null
          avatar_url?: string | null
          blood_group?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email: string
          full_name: string
          gender?: string | null
          id?: string
          is_verified?: boolean | null
          patient_id?: string | null
          patient_number?: string | null
          phone?: string | null
          push_token?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          address?: string | null
          auth_id?: string | null
          avatar_url?: string | null
          blood_group?: string | null
          city?: string | null
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          email?: string
          full_name?: string
          gender?: string | null
          id?: string
          is_verified?: boolean | null
          patient_id?: string | null
          patient_number?: string | null
          phone?: string | null
          push_token?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      virtual_sessions: {
        Row: {
          appointment_id: string
          created_at: string | null
          duration_secs: number | null
          ended_at: string | null
          guest_token: string | null
          host_token: string | null
          id: string
          recording_url: string | null
          room_name: string | null
          room_url: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          appointment_id: string
          created_at?: string | null
          duration_secs?: number | null
          ended_at?: string | null
          guest_token?: string | null
          host_token?: string | null
          id?: string
          recording_url?: string | null
          room_name?: string | null
          room_url?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          appointment_id?: string
          created_at?: string | null
          duration_secs?: number | null
          ended_at?: string | null
          guest_token?: string | null
          host_token?: string | null
          id?: string
          recording_url?: string | null
          room_name?: string | null
          room_url?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "virtual_sessions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_sessions_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments_with_vitals"
            referencedColumns: ["id"]
          },
        ]
      }
      vitals_audit_log: {
        Row: {
          appointment_id: string
          blood_sugar: number | null
          bmi: number | null
          bp_diastolic: number | null
          bp_systolic: number | null
          height_cm: number | null
          id: string
          recorded_at: string
          recorded_by_auth_id: string | null
          weight_kg: number | null
        }
        Insert: {
          appointment_id: string
          blood_sugar?: number | null
          bmi?: number | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          height_cm?: number | null
          id?: string
          recorded_at?: string
          recorded_by_auth_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          appointment_id?: string
          blood_sugar?: number | null
          bmi?: number | null
          bp_diastolic?: number | null
          bp_systolic?: number | null
          height_cm?: number | null
          id?: string
          recorded_at?: string
          recorded_by_auth_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vitals_audit_log_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vitals_audit_log_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments_with_vitals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      appointments_with_vitals: {
        Row: {
          appointment_date: string | null
          approval_note: string | null
          approval_status: string | null
          assigned_doctor_id: string | null
          booked_by_staff_id: string | null
          booking_mode: string | null
          booking_ref: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          check_in_date: string | null
          clinic_id: string | null
          consult_duration_secs: number | null
          consult_ended_at: string | null
          consult_started_at: string | null
          created_at: string | null
          dependent_id: string | null
          diagnosis: string | null
          doctor_id: string | null
          doctor_notes: string | null
          emr_record_id: string | null
          emr_synced: boolean | null
          estimated_wait: number | null
          evidence_url: string | null
          hospital_id: string | null
          id: string | null
          no_show_at: string | null
          patient_id: string | null
          prescription_url: string | null
          queue_position: number | null
          reason: string | null
          refund_pct: number | null
          reminder_sent_1h: boolean | null
          reminder_sent_24h: boolean | null
          reschedule_deadline: string | null
          rescheduled_from: string | null
          service_id: string | null
          slot_id: string | null
          start_time: string | null
          status: string | null
          symptom_description: string | null
          type: string | null
          updated_at: string | null
          urgency: string | null
          vitals_blood_sugar: number | null
          vitals_bmi: number | null
          vitals_bp_diastolic: number | null
          vitals_bp_systolic: number | null
          vitals_height_cm: number | null
          vitals_recorded_at: string | null
          vitals_recorded_by_auth_id: string | null
          vitals_weight_kg: number | null
          walkin_patient_name: string | null
          walkin_patient_phone: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_assigned_doctor_id_fkey"
            columns: ["assigned_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_booked_by_staff_id_fkey"
            columns: ["booked_by_staff_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "hospital_clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_dependent_id_fkey"
            columns: ["dependent_id"]
            isOneToOne: false
            referencedRelation: "dependents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_rescheduled_from_fkey"
            columns: ["rescheduled_from"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_rescheduled_from_fkey"
            columns: ["rescheduled_from"]
            isOneToOne: false
            referencedRelation: "appointments_with_vitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "time_slots"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      fn_get_my_admin_hospital_ids: { Args: never; Returns: string[] }
      get_daily_booking_count: {
        Args: { p_clinic_id?: string; p_date: string; p_hospital_id: string }
        Returns: number
      }
      get_my_staff_profile: {
        Args: never
        Returns: {
          clinic_id: string
          hospital_id: string
          staff_role: string
        }[]
      }
      increment_slot_booking: { Args: { slot_id: string }; Returns: string }
      is_hospital_admin: { Args: { hospital_uuid: string }; Returns: boolean }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      unaccent: { Args: { "": string }; Returns: string }
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

// ── Convenience row types ────────────────────────────────────────────────────
// Named `TableRow` (not `Tables`) to avoid colliding with the generated
// `Tables<>` helper type above.

type TableRow<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']

export type User               = TableRow<'users'>
export type Hospital           = TableRow<'hospitals'>
export type HospitalAdmin      = TableRow<'hospital_admins'>
export type Specialty          = TableRow<'specialties'>
export type Service            = TableRow<'services'>
export type Doctor             = TableRow<'doctors'>
export type TimeSlot           = TableRow<'time_slots'>
export type Appointment        = TableRow<'appointments'>
export type Payment            = TableRow<'payments'>
export type Review             = TableRow<'reviews'>
export type SubscriptionPlan   = TableRow<'subscription_plans'>
export type HospitalSubscription = TableRow<'hospital_subscriptions'>
export type HospitalClinic      = TableRow<'hospital_clinics'>
export type ClinicAdmin         = TableRow<'clinic_admins'>
