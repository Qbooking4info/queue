// Trimmed from mobile/contexts/AuthContext.tsx -- this app only ever resolves a
// doctor identity. staffProfile/crewProfile/staffMode/pendingHospitalOnboarding are
// dropped. signUp is doctor-app-specific: doctors here register their own independent
// account (a plain `users` row, same infra a patient sign-up uses) and start with no
// hospital link at all -- App.tsx shows the "share your Doctor ID" screen for that
// state. A real account that signs in but isn't a doctor is rejected by signIn()
// below (signed back out immediately) -- this app is doctors-only.
import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { User } from '../types/database'

export interface LinkedHospital {
  doctorId:     string
  hospitalId:   string
  hospitalName: string
}

export interface DoctorProfile {
  doctorId:    string
  hospitalId:  string
  fullName:    string
  specialtyId: string | null
  // Every hospital this account is linked to, not just the active one -- drives the
  // hospital switcher in HospitalsScreen. Always includes the active hospital.
  linkedHospitals: LinkedHospital[]
}

interface AuthState {
  session:       Session       | null
  user:          User          | null
  doctorProfile: DoctorProfile | null
  loading:       boolean
  signIn:        (email: string, password: string) => Promise<string | null>
  signUp:        (email: string, password: string, fullName: string, phone: string) => Promise<string | null>
  signOut:       () => Promise<void>
  refreshProfile: () => Promise<void>
  // Switches which linked hospital is "active" -- persisted to users.active_hospital_id
  // (RLS only allows pointing it at a hospital this account actually has an active
  // doctors-row link to, see 20260816000001_doctor_independent_accounts.sql).
  switchHospital: (hospitalId: string) => Promise<string | null>
}

const AuthContext = createContext<AuthState>({} as AuthState)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,       setSession]       = useState<Session | null>(null)
  const [user,          setUser]          = useState<User | null>(null)
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null)
  const [loading,       setLoading]       = useState(true)

  const initialLoadDone = useRef(false)

  // Monotonic token for profile loads -- fetchProfile is re-entrant (cold-start
  // getSession() and the INITIAL_SESSION auth event both fire it, every
  // TOKEN_REFRESHED fires it again, refreshProfile() is called from screens), so two
  // loads are routinely in flight at once. Every setter below is gated on still being
  // current so a stale load can't overwrite a newer one.
  const profileSeq = useRef(0)

  // One account can now be linked to multiple hospitals (one doctors row each, see
  // migration 20260816000001) -- fetch all matching rows, not just one, and pick the
  // active one by users.active_hospital_id (falling back to the earliest-linked row
  // if unset or stale).
  async function fetchDoctorProfile(authUid: string, usersRowId: string, activeHospitalId: string | null, seq: number): Promise<boolean> {
    const current = () => seq === profileSeq.current
    const orConditions = [`auth_user_id.eq.${authUid}`]
    if (usersRowId) orConditions.push(`user_id.eq.${usersRowId}`)

    const { data: rows } = await supabase
      .from('doctors')
      .select('id, hospital_id, full_name, specialty_id, hospital:hospitals!doctors_hospital_id_fkey(name)')
      .eq('is_active', true)
      .or(orConditions.join(','))
      .order('created_at', { ascending: true })

    if (rows && rows.length > 0) {
      const linkedHospitals: LinkedHospital[] = rows.map(r => ({
        doctorId: r.id,
        hospitalId: r.hospital_id,
        hospitalName: (Array.isArray(r.hospital) ? r.hospital[0]?.name : (r.hospital as any)?.name) ?? 'Hospital',
      }))
      const active = activeHospitalId ? rows.find(d => d.hospital_id === activeHospitalId) : undefined
      const row = active ?? rows[0]
      if (current()) {
        setDoctorProfile({
          doctorId: row.id, hospitalId: row.hospital_id, fullName: row.full_name,
          specialtyId: row.specialty_id ?? null, linkedHospitals,
        })
      }
      return true
    }

    if (current()) setDoctorProfile(null)
    return false
  }

  // Returns whether the account resolved as a doctor -- used by signIn() to reject
  // non-doctor accounts, resolved directly off this function's result rather than off
  // React state, since the state setters above haven't necessarily flushed yet.
  async function fetchProfile(authId: string): Promise<boolean> {
    const seq = ++profileSeq.current
    const current = () => seq === profileSeq.current

    // maybeSingle, not single: a doctor mid-registration or an unrelated auth account
    // may legitimately have no users row yet.
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle()

    if (!current()) return false
    setUser(data ?? null)
    return fetchDoctorProfile(authId, data?.id ?? '', (data as any)?.active_hospital_id ?? null, seq)
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
      else { setUser(null); setDoctorProfile(null) }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email: string, password: string): Promise<string | null> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    if (!data.user) return null

    const isDoctor = await fetchProfile(data.user.id)
    // A doctor who self-registered here but hasn't been linked to a hospital yet
    // also fails fetchProfile's doctors-row lookup -- identical, at the `users`
    // table level, to a patient/staff account that never touched this app. The
    // registered_via metadata (set at signUp below) is the only way to tell them
    // apart, so it's an escape hatch from the reject below, not the doctor check.
    const registeredHere = data.user.user_metadata?.registered_via === 'doctors_app'
    if (!isDoctor && !registeredHere) {
      await signOut()
      return "This account isn't registered as a doctor. Please use the Queue patient app, or your hospital's dashboard if you're staff."
    }
    return null
  }

  // Doctor self-registration -- creates the same shape of `users` row a patient
  // sign-up would (nothing marks this row as "a doctor" -- that's entirely determined
  // by whether a doctors row later links to it). Starts with zero hospital links; the
  // account's own id is what the doctor shares with a hospital admin to get linked.
  // registered_via is set purely so signIn() above can tell "pending doctor, not
  // linked yet" apart from "not a doctor account at all" -- both look identical
  // otherwise (no doctors row either way).
  async function signUp(email: string, password: string, fullName: string, phone: string): Promise<string | null> {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { registered_via: 'doctors_app' } } })
    if (error) return error.message
    if (data.user) {
      const { error: profileError } = await supabase.from('users').insert({
        auth_id:   data.user.id,
        email,
        full_name: fullName,
        phone,
      })
      if (profileError) {
        // auth.signUp() above already created a real auth account, which never
        // gets rolled back just because this insert failed -- signing back out
        // at least avoids leaving the app half-authenticated with a null
        // profile in a state nothing else expects (see mobile/contexts/
        // AuthContext.tsx's signUp() for the incident that prompted this).
        await signOut()
        return profileError.message
      }
      // The onAuthStateChange listener's own fetchProfile() races this insert -- it
      // fires as soon as auth.signUp() resolves a session, which is before the insert
      // above completes, so it routinely finds no row yet and leaves `user` null with
      // nothing to re-fetch afterward. Force a fetch now that the row definitely exists.
      await fetchProfile(data.user.id)
    }
    return null
  }

  async function switchHospital(hospitalId: string): Promise<string | null> {
    if (!user) return 'Not signed in'
    const { error } = await supabase.from('users').update({ active_hospital_id: hospitalId } as any).eq('id', user.id)
    if (error) return error.message
    await refreshProfile()
    return null
  }

  async function signOut() {
    // Invalidate any profile load still in flight before clearing state —
    // otherwise it resolves after this and repopulates user/doctorProfile for
    // the account that just signed out.
    profileSeq.current++
    setDoctorProfile(null)
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
  }

  return (
    <AuthContext.Provider value={{
      session, user, doctorProfile, loading,
      signIn, signUp, signOut, refreshProfile, switchHospital,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
