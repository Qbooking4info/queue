import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import * as SecureStore from 'expo-secure-store'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { requestDependentSwitchToken } from '../lib/api'
import type { User } from '../types/database'

// Stashes the caretaker's own session while switched into a dependent's account (see
// switchToDependent/switchBackToCaretaker below) -- a separate SecureStore key from
// whatever the Supabase client itself uses, since only one session can be "live" in
// the client at a time (confirmed: @supabase/supabase-js's GoTrueClient backs one
// storage key, no multi-session support).
const CARETAKER_STASH_KEY = 'queue-caretaker-stash'

// Which app's sign-in door the credentials were entered on. One per shipped app --
// Queue (patient), Queue Hospital, Queue Doctor, Queue Ambulance -- so a mismatched
// account is turned away with the name of the app it actually belongs to, instead of
// being let in and then parked on that app's "no access" screen.
export type AuthSurface = 'patient' | 'hospital' | 'doctor' | 'crew'

const WRONG_APP: Record<AuthSurface, string> = {
  doctor:   'This is a doctor account. Please sign in from the Queue Doctor app.',
  hospital: 'This is a hospital staff account. Please sign in from the Queue Hospital app.',
  // Covers both today's crew accounts and an independent operator's admin/owner
  // account -- both belong to Queue Ambulance, the one app that serves this surface.
  crew:     'This is an ambulance account. Please sign in from the Queue Ambulance app.',
  patient:  'This is a patient account. Please sign in from the Queue app.',
}

// Written into auth user_metadata at sign-up so a half-finished registration survives
// an app restart -- the only signal that tells a brand-new owner/doctor apart from a
// plain patient, since neither has their hospital_admins/doctors row yet.
export const REGISTERED_VIA_HOSPITAL = 'hospital_onboarding'
export const REGISTERED_VIA_DOCTOR   = 'doctor_signup'
// Same idea for an independent (private or government) ambulance operator
// self-registering through the Ambulance app -- they have no
// ambulance_provider_admins row until POST /api/ambulances/register runs,
// which would otherwise drop them on Queue Ambulance's "not ambulance crew"
// screen the instant they finish signing up.
export const REGISTERED_VIA_AMBULANCE_PROVIDER = 'ambulance_provider_signup'

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
  // hospital switcher in DoctorHospitalsScreen. Always includes the active hospital.
  linkedHospitals: LinkedHospital[]
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

export interface ProviderAdminProfile {
  providerId:   string
  role:         'owner' | 'admin'
  providerName: string
  providerType: 'hospital_fleet' | 'third_party'
  // Set only when providerType is 'hospital_fleet' -- which hospital this
  // ambulance service is part of. Independent and hospital-owned providers
  // are managed identically otherwise; this is the one thing that still
  // differs (e.g. the private-fleet setting only means anything here).
  hospitalId:   string | null
}

interface AuthState {
  session:       Session       | null
  user:          User          | null
  doctorProfile: DoctorProfile | null
  staffProfile:  StaffProfile  | null
  crewProfile:   CrewProfile   | null
  // An independent ambulance operator's admin/owner identity -- distinct from
  // staffProfile (a hospital's own admin managing a hospital_fleet provider
  // keeps resolving as staffProfile.role='hospital_admin'; this is only set
  // for someone with no hospital at all, see get_my_ambulance_admin_profile).
  providerAdminProfile: ProviderAdminProfile | null
  loading:       boolean
  staffMode:     boolean
  setStaffMode:  (v: boolean) => void
  // Switches which linked hospital is "active" -- persisted to users.active_hospital_id
  // (RLS only allows pointing it at a hospital this account actually has an active
  // doctors-row link to, see 20260816000001_doctor_independent_accounts.sql).
  switchHospital: (hospitalId: string) => Promise<string | null>
  // Set right after sign-up on the "Register a new hospital" flow — the auth
  // state change mounts the authenticated app tree before that screen's own
  // navigation call would take effect, so AppNavigator reads this to open
  // straight into HospitalOnboardingScreen instead of the default patient home.
  pendingHospitalOnboarding:    boolean
  setPendingHospitalOnboarding: (v: boolean) => void
  // Same idea for a self-registered doctor: they have no `doctors` row until a hospital
  // links them (hospital_id is NOT NULL there, so there is no hospital-less row to
  // create), which would otherwise drop them on Queue Doctor's "not a doctor" screen
  // the instant they finish signing up.
  pendingDoctorOnboarding:      boolean
  setPendingDoctorOnboarding:   (v: boolean) => void
  // Same idea again for an independent ambulance operator: they have no
  // ambulance_provider_admins row until POST /api/ambulances/register runs.
  pendingAmbulanceProviderOnboarding:    boolean
  setPendingAmbulanceProviderOnboarding: (v: boolean) => void
  signIn:        (email: string, password: string, surface: AuthSurface) => Promise<string | null>
  signUp:        (email: string, password: string, fullName: string, phone: string, dateOfBirth: string, registeredVia?: string) => Promise<string | null>
  signOut:       () => Promise<void>
  refreshProfile: () => Promise<void>
  // Set while a caretaker has switched their live session into a dependent's account
  // (see switchToDependent) -- lets the app show a persistent "managing X's account"
  // banner and suspend that device's own push-token registration so it doesn't
  // silently overwrite the dependent's push_token.
  switchedInto:        { fullName: string } | null
  switchToDependent:   (dependentId: string) => Promise<string | null>
  switchBackToCaretaker: () => Promise<string | null>
}

const AuthContext = createContext<AuthState>({} as AuthState)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session,       setSession]       = useState<Session | null>(null)
  const [user,          setUser]          = useState<User | null>(null)
  const [doctorProfile, setDoctorProfile] = useState<DoctorProfile | null>(null)
  const [staffProfile,  setStaffProfile]  = useState<StaffProfile  | null>(null)
  const [crewProfile,   setCrewProfile]   = useState<CrewProfile   | null>(null)
  const [providerAdminProfile, setProviderAdminProfile] = useState<ProviderAdminProfile | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [staffMode,     setStaffMode]     = useState(false)
  const [pendingHospitalOnboarding, setPendingHospitalOnboarding] = useState(false)
  const [pendingDoctorOnboarding,   setPendingDoctorOnboarding]   = useState(false)
  const [pendingAmbulanceProviderOnboarding, setPendingAmbulanceProviderOnboarding] = useState(false)
  const [switchedInto,  setSwitchedInto]  = useState<{ fullName: string } | null>(null)

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
      .select('id, hospital_id, full_name, specialty_id, hospital:hospitals!doctors_hospital_id_fkey(name)')
      .eq('is_active', true)
      .or(orConditions.join(','))
      .order('created_at', { ascending: true })

    if (rows && rows.length > 0) {
      const linkedHospitals: LinkedHospital[] = rows.map(r => ({
        doctorId:     r.id,
        hospitalId:   r.hospital_id,
        // The embed comes back as an array or an object depending on how the FK is
        // resolved, so normalise both shapes rather than trusting one.
        hospitalName: (Array.isArray((r as any).hospital)
          ? (r as any).hospital[0]?.name
          : (r as any).hospital?.name) ?? 'Hospital',
      }))
      const active = activeHospitalId ? rows.find(d => d.hospital_id === activeHospitalId) : undefined
      const row = active ?? rows[0]
      if (current()) setDoctorProfile({
        doctorId: row.id, hospitalId: row.hospital_id, fullName: row.full_name,
        specialtyId: row.specialty_id ?? null, linkedHospitals,
      })
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

  async function fetchProviderAdminProfile(seq: number): Promise<boolean> {
    const current = () => seq === profileSeq.current
    // Same SECURITY DEFINER pattern as fetchCrewProfile -- ambulance_provider_admins
    // has no self-read RLS policy, so this must go through an RPC, not a direct query.
    const { data, error } = await supabase.rpc('get_my_ambulance_admin_profile')

    if (error || !data || data.length === 0) {
      if (current()) setProviderAdminProfile(null)
      return false
    }

    const row = data[0]
    if (!current()) return true
    setProviderAdminProfile({
      providerId:   row.provider_id,
      role:         row.role,
      providerName: row.provider_name,
      providerType: row.provider_type,
      hospitalId:   row.hospital_id ?? null,
    })
    return true
  }

  // Return value (isDoctor / staffRole / isCrew / isProviderAdmin) is used by
  // signIn() to reject an account logging in through the wrong surface —
  // resolved synchronously off this function's result rather than off React
  // state, since the state setters above haven't necessarily flushed by the
  // time signIn's caller needs an answer.
  async function fetchProfile(authId: string): Promise<{ isDoctor: boolean; staffRole: StaffProfile['role'] | null; isCrew: boolean; isProviderAdmin: boolean }> {
    const seq = ++profileSeq.current
    const current = () => seq === profileSeq.current

    // maybeSingle, not single: doctor accounts may legitimately have no users
    // row, and single() turns that expected case into a logged error.
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .maybeSingle()

    if (!current()) return { isDoctor: false, staffRole: null, isCrew: false, isProviderAdmin: false }
    setUser(data ?? null)

    // Always check doctor first — doctor accounts may not have a users row
    const isDoctor = await fetchDoctorProfile(authId, data?.id ?? '', data?.active_hospital_id ?? null, seq)
    if (!isDoctor) {
      const staffRole = await fetchStaffProfile(data?.full_name ?? '', seq)
      if (!staffRole) {
        const isCrew = await fetchCrewProfile(seq)
        if (isCrew) {
          if (current()) setProviderAdminProfile(null)
          // Auto-enable staff mode on first login for staff/crew accounts with no patient booking history
          if (current()) setStaffMode(true)
          return { isDoctor: false, staffRole: null, isCrew: true, isProviderAdmin: false }
        }
        // Independent ambulance operator admin/owner -- checked last, since it's
        // the narrowest identity: no hospital, no doctors row, no crew row, just
        // an ambulance_provider_admins row from self-registration.
        const isProviderAdmin = await fetchProviderAdminProfile(seq)
        if (isProviderAdmin && current()) setStaffMode(true)
        return { isDoctor: false, staffRole: null, isCrew: false, isProviderAdmin }
      } else {
        if (current()) {
          setCrewProfile(null)
          setProviderAdminProfile(null)
          setStaffMode(true)
        }
        return { isDoctor: false, staffRole, isCrew: false, isProviderAdmin: false }
      }
    } else {
      if (current()) {
        // Doctors auto-enter specialist mode. staffProfile is cleared explicitly
        // here because the staff lookup is skipped on this branch, so a profile
        // left over from a previously signed-in staff account would survive.
        setStaffProfile(null)
        setCrewProfile(null)
        setProviderAdminProfile(null)
        setStaffMode(true)
      }
      return { isDoctor: true, staffRole: null, isCrew: false, isProviderAdmin: false }
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
      else { setUser(null); setDoctorProfile(null); setStaffProfile(null); setCrewProfile(null); setProviderAdminProfile(null) }
    })

    return () => subscription.unsubscribe()
  }, [])

  // surface tells us which app's door the credentials were entered on, so a mismatched
  // account is rejected here instead of being silently auto-routed into whatever stack
  // its resolved role happens to match (or, worse, let in and stranded on the target
  // app's "no access" screen). Each of the four apps passes its own surface.
  async function signIn(email: string, password: string, surface: AuthSurface): Promise<string | null> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    if (!data.user) return null

    const profile = await fetchProfile(data.user.id)
    const registeredVia = (data.user.user_metadata as Record<string, unknown> | undefined)?.registered_via

    // Crew arrive either as a dedicated crew row or as a hospital-fleet staff row whose
    // role is 'ambulance_crew'; an independent OR hospital-owned provider's admin/owner
    // is a third path into the same app -- both register and are managed identically
    // now, so a hospital_admin account itself has no business here at all (ambulance
    // management lives in its own account, never the hospital login).
    const isCrew  = profile.isCrew || profile.staffRole === 'ambulance_crew' || profile.isProviderAdmin
    const isStaff = !!profile.staffRole && profile.staffRole !== 'ambulance_crew'
    const kind: AuthSurface = profile.isDoctor ? 'doctor' : isCrew ? 'crew' : isStaff ? 'hospital' : 'patient'

    // Escape hatches: someone who registered a hospital (or a doctor account) but logged
    // out before being linked has no hospital_admins / doctors row yet -- at this point
    // they are indistinguishable from a plain patient, and registered_via is the only
    // thing that tells them apart. These *widen* what a patient-shaped account may enter;
    // they never narrow it, so an abandoned registration can't lock anyone out of the
    // patient app they'd otherwise still be entitled to.
    const resumingHospital = kind === 'patient' && registeredVia === REGISTERED_VIA_HOSPITAL
    const resumingDoctor   = kind === 'patient' && registeredVia === REGISTERED_VIA_DOCTOR
    const resumingAmbulanceProvider = kind === 'patient' && registeredVia === REGISTERED_VIA_AMBULANCE_PROVIDER

    const allowed = kind === surface
      || (surface === 'hospital' && resumingHospital)
      || (surface === 'doctor'   && resumingDoctor)
      || (surface === 'crew'     && resumingAmbulanceProvider)

    if (!allowed) {
      await signOut()
      return WRONG_APP[kind]
    }

    // Resume the relevant onboarding rather than dropping them on a dashboard that has
    // no hospital/doctor/provider row behind it yet.
    if (surface === 'hospital' && resumingHospital)           setPendingHospitalOnboarding(true)
    if (surface === 'doctor'   && resumingDoctor)             setPendingDoctorOnboarding(true)
    if (surface === 'crew'     && resumingAmbulanceProvider)  setPendingAmbulanceProviderOnboarding(true)
    return null
  }

  async function signUp(
    email: string, password: string, fullName: string, phone: string, dateOfBirth: string,
    registeredVia?: string
  ): Promise<string | null> {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      // registered_via lives on the auth user (not the `users` row) so it survives a
      // restart and is readable straight off the session, before any profile fetch.
      options: { data: { full_name: fullName, ...(registeredVia ? { registered_via: registeredVia } : {}) } },
    })
    if (error) return error.message
    // With email confirmation on, signUp returns a user but no session. The `users`
    // insert below needs an authenticated session -- INSERT is revoked from `anon`
    // (20260816000002) -- so without this check it fails with a bare permission error
    // that says nothing about the actual cause.
    if (data.user && !data.session) {
      return 'Account created — check your email to confirm it, then sign in.'
    }
    if (data.user) {
      const { error: profileError } = await supabase.from('users').insert({
        auth_id:   data.user.id,
        email,
        full_name: fullName,
        phone,
        // Doctors sign up without a date of birth; '' is not a valid date literal, so
        // an empty value has to go in as NULL rather than being passed straight through.
        date_of_birth: dateOfBirth || null,
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

  async function switchHospital(hospitalId: string): Promise<string | null> {
    if (!user) return 'Not signed in'
    const { error } = await supabase
      .from('users')
      .update({ active_hospital_id: hospitalId } as any)
      .eq('id', user.id)
    if (error) return error.message
    await refreshProfile()
    return null
  }

  async function signOut() {
    // Invalidate any profile load still in flight before clearing state —
    // otherwise it resolves after this and repopulates user/staffProfile for
    // the account that just signed out.
    profileSeq.current++
    setStaffMode(false)
    setPendingHospitalOnboarding(false)
    setPendingDoctorOnboarding(false)
    setPendingAmbulanceProviderOnboarding(false)
    setDoctorProfile(null)
    setStaffProfile(null)
    setCrewProfile(null)
    setProviderAdminProfile(null)
    setSwitchedInto(null)
    // An explicit, final logout should never leave an orphaned stashed session
    // behind for someone to accidentally switch back into later.
    await SecureStore.deleteItemAsync(CARETAKER_STASH_KEY).catch(() => {})
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
  }

  // Real account switching, not just RLS-scoped viewing: a caretaker's device signs
  // in as the dependent's own account via a magic-link token minted server-side
  // (POST /api/dependents/switch, authorized by an active dependent_links row), then
  // stashes the caretaker's own session so switchBackToCaretaker can restore it.
  // Never call the existing signOut() as part of this -- it does a global revoke that
  // would make switching back impossible; only setSession()/verifyOtp() swaps.
  async function switchToDependent(dependentId: string): Promise<string | null> {
    const result = await requestDependentSwitchToken(dependentId)
    if (!result.ok) return result.error

    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (!currentSession) return 'Not signed in'

    await SecureStore.setItemAsync(CARETAKER_STASH_KEY, JSON.stringify({
      access_token:  currentSession.access_token,
      refresh_token: currentSession.refresh_token,
      fullName:      user?.full_name ?? 'Your account',
    }))

    // Any profile load in flight for the caretaker must not land after we've
    // switched identity underneath it.
    profileSeq.current++
    const { error } = await supabase.auth.verifyOtp({ token_hash: result.tokenHash, type: 'magiclink' })
    if (error) {
      await SecureStore.deleteItemAsync(CARETAKER_STASH_KEY).catch(() => {})
      return error.message
    }
    setSwitchedInto({ fullName: result.fullName })
    return null
  }

  async function switchBackToCaretaker(): Promise<string | null> {
    const stashed = await SecureStore.getItemAsync(CARETAKER_STASH_KEY)
    if (!stashed) return 'No caretaker session to switch back to'
    const { access_token, refresh_token } = JSON.parse(stashed)

    profileSeq.current++
    // setSession transparently refreshes an expired access_token given a still-valid
    // refresh_token, so this works even if the caretaker was switched away for a while.
    const { error } = await supabase.auth.setSession({ access_token, refresh_token })
    if (error) return error.message

    await SecureStore.deleteItemAsync(CARETAKER_STASH_KEY).catch(() => {})
    setSwitchedInto(null)
    return null
  }

  return (
    <AuthContext.Provider value={{
      session, user, doctorProfile, staffProfile, crewProfile, providerAdminProfile, loading,
      staffMode, setStaffMode,
      switchHospital,
      pendingHospitalOnboarding, setPendingHospitalOnboarding,
      pendingDoctorOnboarding,   setPendingDoctorOnboarding,
      pendingAmbulanceProviderOnboarding, setPendingAmbulanceProviderOnboarding,
      signIn, signUp, signOut, refreshProfile,
      switchedInto, switchToDependent, switchBackToCaretaker,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
