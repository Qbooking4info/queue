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
  signIn:        (email: string, password: string, surface: 'patient' | 'hospital') => Promise<string | null>
  signUp:        (email: string, password: string, fullName: string, phone: string, dateOfBirth: string) => Promise<string | null>
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

  // Monotonic token for profile loads. fetchProfile is re-entrant — the cold-start
  // getSession() and the INITIAL_SESSION auth event both fire it, every
  // TOKEN_REFRESHED fires it again, and refreshProfile() is called from screens —
  // so two loads are routinely in flight at once. Without this, whichever query
  // happens to resolve last wins, which lets a stale load overwrite a newer one
  // and lets a load started before signOut() repopulate user/session *after* the
  // sign-out cleared them. Every setter below is gated on still being current.
  const profileSeq = useRef(0)

  // MH1: matches on user_id OR auth_user_id (portal-created vs self-registered doctors).
  // One person can now have MULTIPLE doctors rows -- one per hospital they've linked
  // their independent account to (see the doctors/ app) -- so this can return more than
  // one match. activeHospitalId (users.active_hospital_id) picks which is "current" for
  // this app; falls back to the earliest-linked row if unset or stale. The mobile app
  // doesn't offer a hospital switcher itself (that lives in doctors/) -- it just needs to
  // not crash and to show a sensible default when a doctor has multiple links.
  async function fetchDoctorProfile(authUid: string, usersRowId: string, activeHospitalId: string | null, seq: number): Promise<boolean> {
    const current = () => seq === profileSeq.current
    const orConditions = [`auth_user_id.eq.${authUid}`]
    if (usersRowId) orConditions.push(`user_id.eq.${usersRowId}`)

    const { data: rows } = await supabase
      .from('doctors')
      .select('id, hospital_id, full_name, specialty_id')
      .eq('is_active', true)
      .or(orConditions.join(','))
      .order('created_at', { ascending: true })

    if (rows && rows.length > 0) {
      const active = activeHospitalId ? rows.find(d => d.hospital_id === activeHospitalId) : undefined
      const row = active ?? rows[0]
      if (current()) setDoctorProfile({ doctorId: row.id, hospitalId: row.hospital_id, fullName: row.full_name, specialtyId: row.specialty_id ?? null })
      return true
    }

    if (current()) setDoctorProfile(null)
    return false
  }

  // Returns the resolved role (or null if not a staff account) directly, rather than
  // just a boolean, so callers (fetchProfile -> signIn's surface check) can act on it
  // without reading back staffProfile state, which may not have flushed yet.
  async function fetchStaffProfile(name: string, seq: number): Promise<StaffProfile['role'] | null> {
    const current = () => seq === profileSeq.current
    // Use a SECURITY DEFINER function to bypass RLS on hospital_admins / clinic_admins.
    const { data, error } = await supabase.rpc('get_my_staff_profile')

    if (error || !data || data.length === 0) {
      if (current()) setStaffProfile(null)
      return null
    }

    const row = data[0]
    const role: string = row.staff_role ?? ''
    const isFrontDesk = role === 'front_desk' || role === 'desk_officer'
    const isAdmin     = role === 'admin' || role === 'owner'
    const isCrew      = role === 'ambulance_crew'
    const resolvedRole: StaffProfile['role'] = isFrontDesk ? 'front_desk' : isCrew ? 'ambulance_crew' : isAdmin ? 'hospital_admin' : 'clinic_admin'

    if (!current()) return resolvedRole
    setStaffProfile({
      role:       resolvedRole,
      hospitalId: row.hospital_id,
      clinicId:   row.clinic_id ?? null,
      name,
      crewRole:   row.crew_role ?? undefined,
      crewTier:   row.crew_tier ?? undefined,
    })
    return resolvedRole
  }

  async function fetchCrewProfile(seq: number): Promise<boolean> {
    const current = () => seq === profileSeq.current
    // Same SECURITY DEFINER pattern as fetchStaffProfile — ambulance_crew has
    // no self-read RLS policy, so this must go through an RPC, not a direct query.
    const { data, error } = await supabase.rpc('get_my_crew_profile')

    if (error || !data || data.length === 0) {
      if (current()) setCrewProfile(null)
      return false
    }

    const row = data[0]
    if (!current()) return true
    setCrewProfile({
      crewId:       row.crew_id,
      providerId:   row.provider_id,
      providerName: row.provider_name,
      crewRole:     row.crew_role,
      crewTier:     row.crew_tier,
    })
    return true
  }

  // Return value (isDoctor / staffRole / isCrew) is used by signIn() to reject an
  // account logging in through the wrong surface — resolved synchronously off this
  // function's result rather than off React state, since the state setters above
  // haven't necessarily flushed by the time signIn's caller needs an answer.
  async function fetchProfile(authId: string): Promise<{ isDoctor: boolean; staffRole: StaffProfile['role'] | null; isCrew: boolean }> {
    const seq = ++profileSeq.current
    const current = () => seq === profileSeq.current

    // maybeSingle, not single: doctor accounts may legitimately have no users
    // row, and single() turns that expected case into a logged error.
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle()

    if (!current()) return { isDoctor: false, staffRole: null, isCrew: false }
    setUser(data ?? null)

    // Always check doctor first — doctor accounts may not have a users row
    const isDoctor = await fetchDoctorProfile(authId, data?.id ?? '', data?.active_hospital_id ?? null, seq)
    if (!isDoctor) {
      const staffRole = await fetchStaffProfile(data?.full_name ?? '', seq)
      if (!staffRole) {
        const isCrew = await fetchCrewProfile(seq)
        // Auto-enable staff mode on first login for staff/crew accounts with no patient booking history
        if (isCrew && current()) setStaffMode(true)
        return { isDoctor: false, staffRole: null, isCrew }
      } else {
        if (current()) {
          setCrewProfile(null)
          setStaffMode(true)
        }
        return { isDoctor: false, staffRole, isCrew: false }
      }
    } else {
      if (current()) {
        // Doctors auto-enter specialist mode. staffProfile is cleared explicitly
        // here because the staff lookup is skipped on this branch, so a profile
        // left over from a previously signed-in staff account would survive.
        setStaffProfile(null)
        setCrewProfile(null)
        setStaffMode(true)
      }
      return { isDoctor: true, staffRole: null, isCrew: false }
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

  // surface tells us which door the credentials were entered on ('patient' = the
  // Patient login screen, 'hospital' = the Hospital/Staff portal screen) so a
  // mismatched account type can be rejected instead of silently auto-routing into
  // whatever stack its resolved role happens to match -- see RoleSelectScreen.
  async function signIn(email: string, password: string, surface: 'patient' | 'hospital'): Promise<string | null> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    if (!data.user) return null

    const profile = await fetchProfile(data.user.id)

    if (profile.isDoctor) {
      await signOut()
      return 'This is a doctor account. Please sign in from the Queue Doctors app.'
    }
    if (surface === 'patient' && (profile.staffRole || profile.isCrew)) {
      await signOut()
      return 'This is a hospital/staff account. Please use the Hospital / Staff sign-in instead.'
    }
    // Escape hatch: an owner who registered a hospital but logged out before finishing
    // the onboarding wizard has no hospital_admins row yet either -- identical, at this
    // point, to a plain patient account. registered_via (set by HospitalRegisterScreen's
    // signUp call) is the only way to tell them apart.
    const pendingOnboarding = data.user.user_metadata?.registered_via === 'hospital_onboarding'
    if (surface === 'hospital' && !profile.staffRole && !profile.isCrew) {
      if (!pendingOnboarding) {
        await signOut()
        return 'This is a patient account. Please use the Patient sign-in instead.'
      }
      // Resume the onboarding wizard rather than dropping them into patient home.
      setPendingHospitalOnboarding(true)
    }
    return null
  }

  async function signUp(
    email: string, password: string, fullName: string, phone: string, dateOfBirth: string
  ): Promise<string | null> {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return error.message
    if (data.user) {
      const { error: profileError } = await supabase.from('users').insert({
        auth_id:   data.user.id,
        email,
        full_name: fullName,
        phone,
        date_of_birth: dateOfBirth,
      })
      if (profileError) {
        // auth.signUp() above already created a real auth account -- it's never
        // rolled back just because this insert failed (a column-grant mismatch
        // did exactly this once: confirmed live, an orphaned auth.users row with
        // no matching `users` row, unusable and stuck signed in with a null
        // profile). Signing back out here at least avoids leaving the app
        // half-authenticated in a state nothing else expects.
        await signOut()
        return profileError.message
      }
    }
    return null
  }

  async function signOut() {
    // Invalidate any profile load still in flight before clearing state —
    // otherwise it resolves after this and repopulates user/staffProfile for
    // the account that just signed out.
    profileSeq.current++
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
