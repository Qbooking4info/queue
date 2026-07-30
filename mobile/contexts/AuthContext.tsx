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
  role:       'front_desk' | 'clinic_admin' | 'hospital_admin' | 'ambulance_crew'
  hospitalId: string
  clinicId:   string | null
  name:       string
  crewRole?:  string
  crewTier?:  string
}

export interface CrewProfile {
  crewId:       string
  providerId:   string
  providerName: string
  crewRole:     string
  crewTier:     string
}

interface AuthState {
  session:       Session       | null
  user:          User          | null
  doctorProfile: DoctorProfile | null
  staffProfile:  StaffProfile  | null
  crewProfile:   CrewProfile   | null
  loading:       boolean
  staffMode:     boolean
  setStaffMode:  (v: boolean) => void
  // Set right after sign-up on the "Register a new hospital" flow — the auth
  // state change mounts the authenticated app tree before that screen's own
  // navigation call would take effect, so AppNavigator reads this to open
  // straight into HospitalOnboardingScreen instead of the default patient home.
  pendingHospitalOnboarding:    boolean
  setPendingHospitalOnboarding: (v: boolean) => void
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
  const [crewProfile,   setCrewProfile]   = useState<CrewProfile   | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [staffMode,     setStaffMode]     = useState(false)
  const [pendingHospitalOnboarding, setPendingHospitalOnboarding] = useState(false)

  const initialLoadDone = useRef(false)

  // MH1: Try user_id first, fall back to auth_user_id
  async function fetchDoctorProfile(authUid: string, usersRowId: string): Promise<boolean> {
    if (usersRowId) {
      const { data: byUserId } = await supabase
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

    const { data } = await supabase
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
    const { data, error } = await supabase.rpc('get_my_staff_profile')

    if (error || !data || data.length === 0) {
      setStaffProfile(null)
      return false
    }

    const row = data[0]
    const role: string = row.staff_role ?? ''
    const isFrontDesk = role === 'front_desk' || role === 'desk_officer'
    const isAdmin     = role === 'admin' || role === 'owner'
    const isCrew      = role === 'ambulance_crew'

    setStaffProfile({
      role:       isFrontDesk ? 'front_desk' : isCrew ? 'ambulance_crew' : isAdmin ? 'hospital_admin' : 'clinic_admin',
      hospitalId: row.hospital_id,
      clinicId:   row.clinic_id ?? null,
      name,
      crewRole:   row.crew_role ?? undefined,
      crewTier:   row.crew_tier ?? undefined,
    })
    return true
  }

  async function fetchCrewProfile(): Promise<boolean> {
    // Same SECURITY DEFINER pattern as fetchStaffProfile — ambulance_crew has
    // no self-read RLS policy, so this must go through an RPC, not a direct query.
    const { data, error } = await supabase.rpc('get_my_crew_profile')

    if (error || !data || data.length === 0) {
      setCrewProfile(null)
      return false
    }

    const row = data[0]
    setCrewProfile({
      crewId:       row.crew_id,
      providerId:   row.provider_id,
      providerName: row.provider_name,
      crewRole:     row.crew_role,
      crewTier:     row.crew_tier,
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
      const isStaff = await fetchStaffProfile(data?.full_name ?? '')
      if (!isStaff) {
        const isCrew = await fetchCrewProfile()
        // Auto-enable staff mode on first login for staff/crew accounts with no patient booking history
        if (isCrew) setStaffMode(true)
      } else {
        setCrewProfile(null)
        setStaffMode(true)
      }
    } else {
      // Doctors auto-enter specialist mode
      setCrewProfile(null)
      setStaffMode(true)
    }
  }

  async function refreshProfile() {
    if (session?.user.id) await fetchProfile(session.user.id)
  }

  useEffect(() => {
    // Without this catch, any rejection here (e.g. a broken storage adapter) leaves
    // loading stuck true forever with no way for the UI to recover — better to fall
    // back to a logged-out state than spin indefinitely.
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
    }).catch(err => {
      console.warn('[AuthContext] getSession failed:', err)
      setLoading(false)
      initialLoadDone.current = true
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION' && initialLoadDone.current) return
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setUser(null); setDoctorProfile(null); setStaffProfile(null); setCrewProfile(null) }
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
    setStaffMode(false)
    setPendingHospitalOnboarding(false)
    setDoctorProfile(null)
    setStaffProfile(null)
    setCrewProfile(null)
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{
      session, user, doctorProfile, staffProfile, crewProfile, loading,
      staffMode, setStaffMode,
      pendingHospitalOnboarding, setPendingHospitalOnboarding,
      signIn, signUp, signOut, refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
