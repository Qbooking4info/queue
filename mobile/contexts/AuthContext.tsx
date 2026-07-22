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

  async function fetchStaffProfile(usersRowId: string, name: string): Promise<boolean> {
    // Check clinic_admins (front desk / clinic admin)
    const { data: caRow } = await (supabase as any)
      .from('clinic_admins')
      .select('hospital_id, clinic_id, role')
      .eq('user_id', usersRowId)
      .eq('is_active', true)
      .maybeSingle()

    if (caRow) {
      const isFrontDesk = caRow.role === 'front_desk' || caRow.role === 'desk_officer'
      setStaffProfile({
        role:       isFrontDesk ? 'front_desk' : 'clinic_admin',
        hospitalId: caRow.hospital_id,
        clinicId:   caRow.clinic_id ?? null,
        name,
      })
      return true
    }

    // Check hospital_admins (admin / owner / front_desk at hospital level)
    const { data: haRow } = await (supabase as any)
      .from('hospital_admins')
      .select('hospital_id, role')
      .eq('user_id', usersRowId)
      .eq('is_active', true)
      .maybeSingle()

    if (haRow) {
      const isFrontDesk = haRow.role === 'front_desk'
      const isAdmin     = haRow.role === 'admin' || haRow.role === 'owner'
      setStaffProfile({
        role:       isFrontDesk ? 'front_desk' : isAdmin ? 'hospital_admin' : 'clinic_admin',
        hospitalId: haRow.hospital_id,
        clinicId:   null,
        name,
      })
      return true
    }

    setStaffProfile(null)
    return false
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
    if (!isDoctor && data?.id) {
      // Not a doctor — check for hospital staff role
      await fetchStaffProfile(data.id, data.full_name ?? '')
    } else if (!isDoctor) {
      setStaffProfile(null)
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
