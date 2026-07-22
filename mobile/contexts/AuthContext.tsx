import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { User } from '../types/database'

export interface DoctorProfile {
  doctorId:    string
  hospitalId:  string
  fullName:    string
  specialtyId: string | null
}

export interface StaffProfile {
  role:       'front_desk' | 'clinic_admin' | 'hospital_admin'
  hospitalId: string
  clinicId:   string | null
  name:       string
}

interface AuthState {
  session:       Session       | null
  user:          User          | null
  doctorProfile: DoctorProfile | null
  staffProfile:  StaffProfile  | null
  loading:       boolean
  signIn:        (email: string, password: string) => Promise<string | null>
  signUp:        (email: string, password: string, fullName: string, phone: string) => Promise<string | null>
  signOut:       () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState>({} as AuthState)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,       setSession]       = useState<Session | null>(null)
  const [user,          setUser]          = useState<User | null>(null)
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null)
  const [staffProfile,  setStaffProfile]  = useState<StaffProfile  | null>(null)
  const [loading,       setLoading]       = useState(true)

  const initialLoadDone = useRef(false)

  // MH1: Try user_id first, fall back to auth_user_id
  async function fetchDoctorProfile(authUid: string, usersRowId: string): Promise<boolean> {
    if (usersRowId) {
      const { data: byUserId } = await (supabase as any)
        .from('doctors')
        .select('id, hospital_id, full_name, specialty_id')
        .eq('is_active', true)
        .eq('user_id', usersRowId)
        .maybeSingle()

      if (byUserId) {
        setDoctorProfile({ doctorId: byUserId.id, hospitalId: byUserId.hospital_id, fullName: byUserId.full_name, specialtyId: byUserId.specialty_id ?? null })
        return true
      }
    }

    const { data } = await (supabase as any)
      .from('doctors')
      .select('id, hospital_id, full_name, specialty_id')
      .eq('is_active', true)
      .eq('auth_user_id', authUid)
      .maybeSingle()

    if (data) {
      setDoctorProfile({ doctorId: data.id, hospitalId: data.hospital_id, fullName: data.full_name, specialtyId: data.specialty_id ?? null })
      return true
    }

    setDoctorProfile(null)
    return false
  }

  async function fetchStaffProfile(name: string): Promise<boolean> {
    // Use a SECURITY DEFINER function to bypass RLS on hospital_admins / clinic_admins.
    const { data, error } = await (supabase as any).rpc('get_my_staff_profile')

    if (error || !data || data.length === 0) {
      setStaffProfile(null)
      return false
    }

    const row = data[0]
    const role: string = row.staff_role ?? ''
    const isFrontDesk = role === 'front_desk' || role === 'desk_officer'
    const isAdmin     = role === 'admin' || role === 'owner'

    setStaffProfile({
      role:       isFrontDesk ? 'front_desk' : isAdmin ? 'hospital_admin' : 'clinic_admin',
      hospitalId: row.hospital_id,
      clinicId:   row.clinic_id ?? null,
      name,
    })
    return true
  }

  async function fetchProfile(authId: string) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .single()

    setUser(data ?? null)

    // Always check doctor first — doctor accounts may not have a users row
    const isDoctor = await fetchDoctorProfile(authId, data?.id ?? '')
    if (!isDoctor) {
      await fetchStaffProfile(data?.full_name ?? '')
    }
  }

  async function refreshProfile() {
    if (session?.user.id) await fetchProfile(session.user.id)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        fetchProfile(session.user.id).finally(() => {
          setLoading(false)
          initialLoadDone.current = true
        })
      } else {
        setLoading(false)
        initialLoadDone.current = true
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' && initialLoadDone.current) return
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setUser(null); setDoctorProfile(null); setStaffProfile(null) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }

  async function signUp(
    email: string, password: string, fullName: string, phone: string
  ): Promise<string | null> {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return error.message
    if (data.user) {
      const { error: profileError } = await supabase.from('users').insert({
        auth_id:   data.user.id,
        email,
        full_name: fullName,
        phone,
      })
      if (profileError) return profileError.message
    }
    return null
  }

  async function signOut() {
    setDoctorProfile(null)
    setStaffProfile(null)
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{ session, user, doctorProfile, staffProfile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
