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
      ambulance_crew: {
        Row: {
          created_at: string | null
          crew_role: string
          crew_tier: string
          id: string
          is_active: boolean
          provider_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          crew_role: string
          crew_tier?: string
          id?: string
          is_active?: boolean
          provider_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          crew_role?: string
          crew_tier?: string
          id?: string
          is_active?: boolean
          provider_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambulance_crew_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ambulance_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambulance_crew_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ambulance_providers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambulance_crew_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ambulance_current_location: {
        Row: {
          accuracy_m: number | null
          ambulance_id: string
          heading: number | null
          location: unknown
          received_at: string
          recorded_at: string
          speed_kmh: number | null
        }
        Insert: {
          accuracy_m?: number | null
          ambulance_id: string
          heading?: number | null
          location: unknown
          received_at?: string
          recorded_at: string
          speed_kmh?: number | null
        }
        Update: {
          accuracy_m?: number | null
          ambulance_id?: string
          heading?: number | null
          location?: unknown
          received_at?: string
          recorded_at?: string
          speed_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ambulance_current_location_ambulance_id_fkey"
            columns: ["ambulance_id"]
            isOneToOne: true
            referencedRelation: "ambulances"
            referencedColumns: ["id"]
          },
        ]
      }
      ambulance_locations: {
        Row: {
          accuracy_m: number | null
          ambulance_id: string
          heading: number | null
          id: number
          location: unknown
          received_at: string
          recorded_at: string
          request_id: string | null
          speed_kmh: number | null
        }
        Insert: {
          accuracy_m?: number | null
          ambulance_id: string
          heading?: number | null
          id?: number
          location: unknown
          received_at?: string
          recorded_at: string
          request_id?: string | null
          speed_kmh?: number | null
        }
        Update: {
          accuracy_m?: number | null
          ambulance_id?: string
          heading?: number | null
          id?: number
          location?: unknown
          received_at?: string
          recorded_at?: string
          request_id?: string | null
          speed_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ambulance_locations_ambulance_id_fkey"
            columns: ["ambulance_id"]
            isOneToOne: false
            referencedRelation: "ambulances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambulance_locations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "transport_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      ambulance_providers: {
        Row: {
          commission_rate: number
          contact_email: string | null
          contact_phone: string
          created_at: string | null
          hospital_id: string | null
          id: string
          is_active: boolean
          is_verified: boolean
          name: string
          provider_type: string
          reliability_score: number
          service_area: unknown
          updated_at: string | null
        }
        Insert: {
          commission_rate?: number
          contact_email?: string | null
          contact_phone: string
          created_at?: string | null
          hospital_id?: string | null
          id?: string
          is_active?: boolean
          is_verified?: boolean
          name: string
          provider_type: string
          reliability_score?: number
          service_area?: unknown
          updated_at?: string | null
        }
        Update: {
          commission_rate?: number
          contact_email?: string | null
          contact_phone?: string
          created_at?: string | null
          hospital_id?: string | null
          id?: string
          is_active?: boolean
          is_verified?: boolean
          name?: string
          provider_type?: string
          reliability_score?: number
          service_area?: unknown
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ambulance_providers_hospital_id_fkey"
            columns: ["hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
        ]
      }
      ambulance_shift_crew: {
        Row: {
          crew_member_id: string | null
          hospital_admin_id: string | null
          id: string
          shift_id: string
        }
        Insert: {
          crew_member_id?: string | null
          hospital_admin_id?: string | null
          id?: string
          shift_id: string
        }
        Update: {
          crew_member_id?: string | null
          hospital_admin_id?: string | null
          id?: string
          shift_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambulance_shift_crew_crew_member_id_fkey"
            columns: ["crew_member_id"]
            isOneToOne: false
            referencedRelation: "ambulance_crew"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambulance_shift_crew_hospital_admin_id_fkey"
            columns: ["hospital_admin_id"]
            isOneToOne: false
            referencedRelation: "hospital_admins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambulance_shift_crew_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "ambulance_shifts"
            referencedColumns: ["id"]
          },
        ]
      }
      ambulance_shifts: {
        Row: {
          ambulance_id: string
          created_at: string | null
          crew_tier: string
          ends_at: string
          id: string
          starts_at: string
        }
        Insert: {
          ambulance_id: string
          created_at?: string | null
          crew_tier: string
          ends_at: string
          id?: string
          starts_at: string
        }
        Update: {
          ambulance_id?: string
          created_at?: string | null
          crew_tier?: string
          ends_at?: string
          id?: string
          starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambulance_shifts_ambulance_id_fkey"
            columns: ["ambulance_id"]
            isOneToOne: false
            referencedRelation: "ambulances"
            referencedColumns: ["id"]
          },
        ]
      }
      ambulances: {
        Row: {
          call_sign: string | null
          capabilities: string[]
          created_at: string | null
          home_base: unknown
          id: string
          is_active: boolean
          plate_number: string
          provider_id: string
          status: string
          updated_at: string | null
          vehicle_tier: string
        }
        Insert: {
          call_sign?: string | null
          capabilities?: string[]
          created_at?: string | null
          home_base: unknown
          id?: string
          is_active?: boolean
          plate_number: string
          provider_id: string
          status?: string
          updated_at?: string | null
          vehicle_tier: string
        }
        Update: {
          call_sign?: string | null
          capabilities?: string[]
          created_at?: string | null
          home_base?: unknown
          id?: string
          is_active?: boolean
          plate_number?: string
          provider_id?: string
          status?: string
          updated_at?: string | null
          vehicle_tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "ambulances_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ambulance_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ambulances_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ambulance_providers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
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
          checked_in_at: string | null
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
          referral_reason: string | null
          referred_by_doctor_id: string | null
          referring_clinic_id: string | null
          referring_hospital_id: string | null
          refund_pct: number | null
          reminder_sent_1h: boolean | null
          reminder_sent_24h: boolean | null
          reschedule_count: number
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
          waiting_time_secs: number | null
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
          checked_in_at?: string | null
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
          referral_reason?: string | null
          referred_by_doctor_id?: string | null
          referring_clinic_id?: string | null
          referring_hospital_id?: string | null
          refund_pct?: number | null
          reminder_sent_1h?: boolean | null
          reminder_sent_24h?: boolean | null
          reschedule_count?: number
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
          waiting_time_secs?: number | null
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
          checked_in_at?: string | null
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
          referral_reason?: string | null
          referred_by_doctor_id?: string | null
          referring_clinic_id?: string | null
          referring_hospital_id?: string | null
          refund_pct?: number | null
          reminder_sent_1h?: boolean | null
          reminder_sent_24h?: boolean | null
          reschedule_count?: number
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
          waiting_time_secs?: number | null
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
            foreignKeyName: "appointments_referred_by_doctor_id_fkey"
            columns: ["referred_by_doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_referring_clinic_id_fkey"
            columns: ["referring_clinic_id"]
            isOneToOne: false
            referencedRelation: "hospital_clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_referring_hospital_id_fkey"
            columns: ["referring_hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
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
          clinic_id: string
          created_at: string | null
          hospital_id: string
          id: string
          is_active: boolean | null
          role: string | null
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string | null
          hospital_id: string
          id?: string
          is_active?: boolean | null
          role?: string | null
          user_id: string
        }
        Update: {
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
      counter_reconciliation_log: {
        Row: {
          column_name: string
          entity_id: string
          entity_type: string
          id: string
          new_value: string | null
          old_value: string | null
          ran_at: string
        }
        Insert: {
          column_name: string
          entity_id: string
          entity_type: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          ran_at?: string
        }
        Update: {
          column_name?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          ran_at?: string
        }
        Relationships: []
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
      dispatch_attempts: {
        Row: {
          active_units_total: number | null
          candidates_after_filter: number
          candidates_found: number
          created_at: string
          id: string
          nearest_unit_m: number | null
          offers_made: number
          on_duty_units_total: number | null
          radius_m: number
          reject_reasons: Json
          request_id: string
          round: number
        }
        Insert: {
          active_units_total?: number | null
          candidates_after_filter?: number
          candidates_found?: number
          created_at?: string
          id?: string
          nearest_unit_m?: number | null
          offers_made?: number
          on_duty_units_total?: number | null
          radius_m: number
          reject_reasons?: Json
          request_id: string
          round: number
        }
        Update: {
          active_units_total?: number | null
          candidates_after_filter?: number
          candidates_found?: number
          created_at?: string
          id?: string
          nearest_unit_m?: number | null
          offers_made?: number
          on_duty_units_total?: number | null
          radius_m?: number
          reject_reasons?: Json
          request_id?: string
          round?: number
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_attempts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "transport_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_offers: {
        Row: {
          ambulance_id: string
          decline_reason: string | null
          eta_seconds: number | null
          expires_at: string
          id: string
          offered_at: string
          rank: number
          request_id: string
          responded_at: string | null
          response: string
          round: number
          score: number
        }
        Insert: {
          ambulance_id: string
          decline_reason?: string | null
          eta_seconds?: number | null
          expires_at: string
          id?: string
          offered_at?: string
          rank: number
          request_id: string
          responded_at?: string | null
          response?: string
          round?: number
          score: number
        }
        Update: {
          ambulance_id?: string
          decline_reason?: string | null
          eta_seconds?: number | null
          expires_at?: string
          id?: string
          offered_at?: string
          rank?: number
          request_id?: string
          responded_at?: string | null
          response?: string
          round?: number
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_offers_ambulance_id_fkey"
            columns: ["ambulance_id"]
            isOneToOne: false
            referencedRelation: "ambulances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_offers_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "transport_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatcher_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string | null
          id: string
          kind: string
          message: string
          request_id: string | null
          severity: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string | null
          id?: string
          kind: string
          message: string
          request_id?: string | null
          severity: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string | null
          id?: string
          kind?: string
          message?: string
          request_id?: string | null
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatcher_alerts_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatcher_alerts_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "transport_requests"
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
      emergency_directory: {
        Row: {
          alt_phone: string | null
          city: string | null
          country: string
          created_at: string
          id: string
          is_active: boolean
          kind: string
          last_verified_at: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          phone: string
          priority: number
          state: string | null
          updated_at: string
          verification_note: string | null
          verified_by: string
        }
        Insert: {
          alt_phone?: string | null
          city?: string | null
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind: string
          last_verified_at: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          phone: string
          priority?: number
          state?: string | null
          updated_at?: string
          verification_note?: string | null
          verified_by: string
        }
        Update: {
          alt_phone?: string | null
          city?: string | null
          country?: string
          created_at?: string
          id?: string
          is_active?: boolean
          kind?: string
          last_verified_at?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          phone?: string
          priority?: number
          state?: string | null
          updated_at?: string
          verification_note?: string | null
          verified_by?: string
        }
        Relationships: []
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
          crew_role: string | null
          crew_tier: string | null
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
          crew_role?: string | null
          crew_tier?: string | null
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
          crew_role?: string | null
          crew_tier?: string | null
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
          ambulance_private_fleet: boolean
          ambulance_service_hours_247: boolean
          ambulance_service_radius_m: number | null
          approval_mode: string | null
          avg_rating: number | null
          bed_space_status: string
          bed_space_updated_at: string | null
          city: string
          clinic_model: string | null
          country: string | null
          cover_url: string | null
          created_at: string | null
          daily_booking_limit: number | null
          description: string | null
          email: string | null
          email_reminders: boolean
          emergency_hours: boolean | null
          emr_system: string | null
          hospital_id: string | null
          id: string
          is_24_hours: boolean
          is_active: boolean | null
          is_verified: boolean | null
          latitude: number | null
          logo_url: string | null
          longitude: number | null
          mdcn_accreditation: string | null
          name: string
          opd_fee: number | null
          paystack_account_last4: string | null
          paystack_bank_name: string | null
          paystack_subaccount_code: string | null
          phone: string | null
          registration_number: string | null
          requires_referral: boolean | null
          review_count: number | null
          slug: string
          sms_reminders: boolean
          state: string
          total_bookings: number | null
          type: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          accepts_virtual?: boolean | null
          address: string
          ambulance_private_fleet?: boolean
          ambulance_service_hours_247?: boolean
          ambulance_service_radius_m?: number | null
          approval_mode?: string | null
          avg_rating?: number | null
          bed_space_status?: string
          bed_space_updated_at?: string | null
          city: string
          clinic_model?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string | null
          daily_booking_limit?: number | null
          description?: string | null
          email?: string | null
          email_reminders?: boolean
          emergency_hours?: boolean | null
          emr_system?: string | null
          hospital_id?: string | null
          id?: string
          is_24_hours?: boolean
          is_active?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          mdcn_accreditation?: string | null
          name: string
          opd_fee?: number | null
          paystack_account_last4?: string | null
          paystack_bank_name?: string | null
          paystack_subaccount_code?: string | null
          phone?: string | null
          registration_number?: string | null
          requires_referral?: boolean | null
          review_count?: number | null
          slug: string
          sms_reminders?: boolean
          state: string
          total_bookings?: number | null
          type?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          accepts_virtual?: boolean | null
          address?: string
          ambulance_private_fleet?: boolean
          ambulance_service_hours_247?: boolean
          ambulance_service_radius_m?: number | null
          approval_mode?: string | null
          avg_rating?: number | null
          bed_space_status?: string
          bed_space_updated_at?: string | null
          city?: string
          clinic_model?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string | null
          daily_booking_limit?: number | null
          description?: string | null
          email?: string | null
          email_reminders?: boolean
          emergency_hours?: boolean | null
          emr_system?: string | null
          hospital_id?: string | null
          id?: string
          is_24_hours?: boolean
          is_active?: boolean | null
          is_verified?: boolean | null
          latitude?: number | null
          logo_url?: string | null
          longitude?: number | null
          mdcn_accreditation?: string | null
          name?: string
          opd_fee?: number | null
          paystack_account_last4?: string | null
          paystack_bank_name?: string | null
          paystack_subaccount_code?: string | null
          phone?: string | null
          registration_number?: string | null
          requires_referral?: boolean | null
          review_count?: number | null
          slug?: string
          sms_reminders?: boolean
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
          other_allergies: string | null
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
          other_allergies?: string | null
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
          other_allergies?: string | null
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
          failure_reason: string | null
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
          verified_at: string | null
          webhook_event: string | null
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          created_at?: string | null
          currency?: string
          failure_reason?: string | null
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
          verified_at?: string | null
          webhook_event?: string | null
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          created_at?: string | null
          currency?: string
          failure_reason?: string | null
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
          verified_at?: string | null
          webhook_event?: string | null
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
      rate_limit_counters: {
        Row: {
          count: number
          key: string
          updated_at: string
          window_bucket: number
        }
        Insert: {
          count?: number
          key: string
          updated_at?: string
          window_bucket: number
        }
        Update: {
          count?: number
          key?: string
          updated_at?: string
          window_bucket?: number
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
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
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
      transport_events: {
        Row: {
          actor_id: string | null
          actor_role: string | null
          from_status: string | null
          id: number
          location: unknown
          note: string | null
          occurred_at: string
          request_id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          actor_role?: string | null
          from_status?: string | null
          id?: number
          location?: unknown
          note?: string | null
          occurred_at?: string
          request_id: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          actor_role?: string | null
          from_status?: string | null
          id?: number
          location?: unknown
          note?: string | null
          occurred_at?: string
          request_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "transport_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_invoices: {
        Row: {
          base_fee: number
          callout_fee: number
          commission: number
          created_at: string | null
          distance_charge: number
          distance_km: number | null
          id: string
          on_scene_charge: number
          on_scene_minutes: number | null
          provider_id: string
          provider_payout: number
          request_id: string
          settlement_path: string
          total: number
        }
        Insert: {
          base_fee?: number
          callout_fee?: number
          commission?: number
          created_at?: string | null
          distance_charge?: number
          distance_km?: number | null
          id?: string
          on_scene_charge?: number
          on_scene_minutes?: number | null
          provider_id: string
          provider_payout?: number
          request_id: string
          settlement_path: string
          total: number
        }
        Update: {
          base_fee?: number
          callout_fee?: number
          commission?: number
          created_at?: string | null
          distance_charge?: number
          distance_km?: number | null
          id?: string
          on_scene_charge?: number
          on_scene_minutes?: number | null
          provider_id?: string
          provider_payout?: number
          request_id?: string
          settlement_path?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "transport_invoices_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ambulance_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_invoices_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ambulance_providers_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_invoices_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "transport_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_rate_cards: {
        Row: {
          base_fee: number
          callout_fee: number
          effective_from: string
          effective_to: string | null
          id: string
          per_km: number
          per_minute_on_scene: number
          provider_id: string
          unit_tier: string
        }
        Insert: {
          base_fee: number
          callout_fee?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          per_km?: number
          per_minute_on_scene?: number
          provider_id: string
          unit_tier: string
        }
        Update: {
          base_fee?: number
          callout_fee?: number
          effective_from?: string
          effective_to?: string | null
          id?: string
          per_km?: number
          per_minute_on_scene?: number
          provider_id?: string
          unit_tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_rate_cards_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ambulance_providers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_rate_cards_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "ambulance_providers_public"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_requests: {
        Row: {
          appointment_id: string | null
          assigned_unit_id: string | null
          booking_ref: string
          caller_patient_name: string | null
          cancellation_reason: string | null
          clinical_summary: string | null
          completed_at: string | null
          contact_phone: string
          created_at: string | null
          dependent_id: string | null
          destination_clinic_id: string | null
          destination_hospital_id: string | null
          disposition: string | null
          eta_seconds: number | null
          eta_updated_at: string | null
          failure_reason: string | null
          id: string
          matched_at: string | null
          origin_hospital_id: string | null
          patient_id: string | null
          payment_method: string | null
          pickup_address: string | null
          pickup_notes: string | null
          pickup_point: unknown
          request_type: string
          requester_id: string
          requester_relationship: string | null
          required_capabilities: string[]
          required_tier: string
          route_polyline: string | null
          scheduled_for: string | null
          search_deadline_at: string | null
          status: string
          symptom_description: string | null
          triage_level: number | null
          updated_at: string | null
        }
        Insert: {
          appointment_id?: string | null
          assigned_unit_id?: string | null
          booking_ref: string
          caller_patient_name?: string | null
          cancellation_reason?: string | null
          clinical_summary?: string | null
          completed_at?: string | null
          contact_phone: string
          created_at?: string | null
          dependent_id?: string | null
          destination_clinic_id?: string | null
          destination_hospital_id?: string | null
          disposition?: string | null
          eta_seconds?: number | null
          eta_updated_at?: string | null
          failure_reason?: string | null
          id?: string
          matched_at?: string | null
          origin_hospital_id?: string | null
          patient_id?: string | null
          payment_method?: string | null
          pickup_address?: string | null
          pickup_notes?: string | null
          pickup_point: unknown
          request_type: string
          requester_id: string
          requester_relationship?: string | null
          required_capabilities?: string[]
          required_tier?: string
          route_polyline?: string | null
          scheduled_for?: string | null
          search_deadline_at?: string | null
          status: string
          symptom_description?: string | null
          triage_level?: number | null
          updated_at?: string | null
        }
        Update: {
          appointment_id?: string | null
          assigned_unit_id?: string | null
          booking_ref?: string
          caller_patient_name?: string | null
          cancellation_reason?: string | null
          clinical_summary?: string | null
          completed_at?: string | null
          contact_phone?: string
          created_at?: string | null
          dependent_id?: string | null
          destination_clinic_id?: string | null
          destination_hospital_id?: string | null
          disposition?: string | null
          eta_seconds?: number | null
          eta_updated_at?: string | null
          failure_reason?: string | null
          id?: string
          matched_at?: string | null
          origin_hospital_id?: string | null
          patient_id?: string | null
          payment_method?: string | null
          pickup_address?: string | null
          pickup_notes?: string | null
          pickup_point?: unknown
          request_type?: string
          requester_id?: string
          requester_relationship?: string | null
          required_capabilities?: string[]
          required_tier?: string
          route_polyline?: string | null
          scheduled_for?: string | null
          search_deadline_at?: string | null
          status?: string
          symptom_description?: string | null
          triage_level?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments_with_vitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_assigned_unit_id_fkey"
            columns: ["assigned_unit_id"]
            isOneToOne: false
            referencedRelation: "ambulances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_dependent_id_fkey"
            columns: ["dependent_id"]
            isOneToOne: false
            referencedRelation: "dependents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_destination_clinic_id_fkey"
            columns: ["destination_clinic_id"]
            isOneToOne: false
            referencedRelation: "hospital_clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_destination_hospital_id_fkey"
            columns: ["destination_hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_origin_hospital_id_fkey"
            columns: ["origin_hospital_id"]
            isOneToOne: false
            referencedRelation: "hospitals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      ambulance_providers_public: {
        Row: {
          id: string | null
          is_verified: boolean | null
          name: string | null
          provider_type: string | null
        }
        Insert: {
          id?: string | null
          is_verified?: boolean | null
          name?: string | null
          provider_type?: string | null
        }
        Update: {
          id?: string | null
          is_verified?: boolean | null
          name?: string | null
          provider_type?: string | null
        }
        Relationships: []
      }
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
      emergency_directory_public: {
        Row: {
          alt_phone: string | null
          city: string | null
          country: string | null
          id: string | null
          kind: string | null
          last_verified_at: string | null
          latitude: number | null
          longitude: number | null
          name: string | null
          notes: string | null
          phone: string | null
          priority: number | null
          state: string | null
        }
        Insert: {
          alt_phone?: string | null
          city?: string | null
          country?: string | null
          id?: string | null
          kind?: string | null
          last_verified_at?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          priority?: number | null
          state?: string | null
        }
        Update: {
          alt_phone?: string | null
          city?: string | null
          country?: string | null
          id?: string | null
          kind?: string | null
          last_verified_at?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          notes?: string | null
          phone?: string | null
          priority?: number | null
          state?: string | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      accept_dispatch_offer: {
        Args: { p_auth_id: string; p_offer_id: string }
        Returns: boolean
      }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      assert_can_operate_unit: {
        Args: { p_ambulance_id: string }
        Returns: {
          crew_member_id: string
          crew_tier: string
          hospital_admin_id: string
        }[]
      }
      crew_update_job_status: {
        Args: { p_new_status: string; p_request_id: string }
        Returns: boolean
      }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      emergency_directory_ttl_days: { Args: never; Returns: number }
      enablelongtransactions: { Args: never; Returns: string }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      expire_overdue_searches: { Args: never; Returns: number }
      expire_stale_offers: { Args: never; Returns: number }
      find_candidate_units: {
        Args: { p_limit?: number; p_radius_m?: number; p_request_id: string }
        Returns: {
          capabilities: string[]
          crew_tier: string
          current_lat: number
          current_lng: number
          last_dispatched_at: string
          provider_hospital_id: string
          provider_id: string
          provider_type: string
          reliability_score: number
          shift_ends_at: string
          straight_line_m: number
          unit_id: string
          vehicle_tier: string
        }[]
      }
      flag_stale_tracking: { Args: never; Returns: number }
      fn_get_my_admin_hospital_ids: { Args: never; Returns: string[] }
      generate_transport_ref: { Args: never; Returns: string }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_daily_booking_count: {
        Args: { p_clinic_id?: string; p_date: string; p_hospital_id: string }
        Returns: boolean
      }
      get_doctor_queue: {
        Args: { p_date: string; p_doctor_id: string; p_today: string }
        Returns: {
          appointment_date: string
          id: string
          patient_gender: string
          patient_id: string
          patient_name: string
          patient_phone: string
          queue_position: number
          reason: string
          referral_reason: string
          referred_by_doctor_name: string
          referring_clinic_name: string
          referring_hospital_name: string
          start_time: string
          status: string
          type: string
          urgency: string
        }[]
      }
      get_hospital_staff_roster: {
        Args: { p_hospital_id: string }
        Returns: Json
      }
      get_my_active_job: {
        Args: never
        Returns: {
          assigned_unit_id: string
          booking_ref: string
          contact_phone: string
          destination_hospital_id: string
          destination_hospital_name: string
          pickup_address: string
          pickup_lat: number
          pickup_lng: number
          request_id: string
          status: string
          symptom_description: string
          triage_level: number
        }[]
      }
      get_my_crew_profile: {
        Args: never
        Returns: {
          crew_id: string
          crew_role: string
          crew_tier: string
          provider_id: string
          provider_name: string
        }[]
      }
      get_my_pending_offers: {
        Args: never
        Returns: {
          ambulance_id: string
          eta_seconds: number
          expires_at: string
          offer_id: string
          pickup_address: string
          pickup_lat: number
          pickup_lng: number
          request_id: string
          score: number
          symptom_description: string
          triage_level: number
        }[]
      }
      get_my_staff_profile: {
        Args: never
        Returns: {
          clinic_id: string
          crew_role: string
          crew_tier: string
          hospital_id: string
          staff_role: string
        }[]
      }
      get_my_units: {
        Args: never
        Returns: {
          ambulance_id: string
          call_sign: string
          capabilities: string[]
          last_ping_at: string
          on_duty: boolean
          plate_number: string
          provider_id: string
          provider_name: string
          seconds_since_ping: number
          shift_ends_at: string
          status: string
          vehicle_tier: string
          visible_to_dispatch: boolean
        }[]
      }
      get_request_pickup_latlng: {
        Args: { p_request_id: string }
        Returns: {
          lat: number
          lng: number
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      increment_rate_limit: {
        Args: { p_key: string; p_window_bucket: number }
        Returns: number
      }
      increment_slot_booking: { Args: { slot_id: string }; Returns: string }
      invoke_transport_sweep: { Args: never; Returns: undefined }
      is_hospital_admin: { Args: { hospital_uuid: string }; Returns: boolean }
      is_hospital_open_now: {
        Args: { p_hospital_id: string }
        Returns: boolean
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      nearest_unit_stats: {
        Args: { p_request_id: string }
        Returns: {
          active_units_total: number
          nearest_unit_m: number
          on_duty_units_total: number
        }[]
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      process_missed_appointments: { Args: never; Returns: undefined }
      rank_destination_hospitals: {
        Args: { p_limit?: number; p_radius_m?: number; p_request_id: string }
        Returns: {
          clinic_id: string
          distance_m: number
          has_prior_care: boolean
          hospital_id: string
          hospital_name: string
          is_24_hours: boolean
        }[]
      }
      recompute_denormalised_counters: { Args: never; Returns: undefined }
      record_unit_location: {
        Args: {
          p_accuracy_m: number
          p_ambulance_id: string
          p_heading: number
          p_lat: number
          p_lng: number
          p_recorded_at: string
          p_speed_kmh: number
        }
        Returns: boolean
      }
      renumber_doctor_queue: {
        Args: {
          p_check_in_date: string
          p_doctor_id: string
          p_hospital_id: string
        }
        Returns: undefined
      }
      set_unit_duty: {
        Args: {
          p_ambulance_id: string
          p_crew_tier?: string
          p_hours?: number
          p_on_duty: boolean
        }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      tier_rank: { Args: { p_tier: string }; Returns: number }
      transport_sweep_health: {
        Args: never
        Returns: {
          cron_active: boolean
          failed_last_hour: number
          is_configured: boolean
          last_attempt_at: string
          last_error: string
          last_status_code: number
          ok_last_hour: number
        }[]
      }
      unaccent: { Args: { "": string }; Returns: string }
      unit_location_ttl_seconds: { Args: never; Returns: number }
      unlockrows: { Args: { "": string }; Returns: number }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
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
