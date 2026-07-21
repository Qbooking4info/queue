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

interface AuthState {
  session:       Session       | null
  user:          User          | null
  doctorProfile: DoctorProfile | null
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
  const [loading,       setLoading]       = useState(true)

  // MM5: Prevent double-fetch when both getSession and INITIAL_SESSION fire at startup
  const initialLoadDone = useRef(false)

  // MH1: Try user_id first (reliable under RLS), fall back to auth_user_id
  async function fetchDoctorProfile(authUid: string, userId: string) {
    const { data: byUserId } = await (supabase as any)
      .from('doctors')
      .select('id, hospital_id, full_name, specialty_id')
      .eq('is_active', true)
      .eq('user_id', userId)
      .maybeSingle()

    if (byUserId) {
      setDoctorProfile({
        doctorId:    byUserId.id,
        hospitalId:  byUserId.hospital_id,
        fullName:    byUserId.full_name,
        specialtyId: byUserId.specialty_id ?? null,
      })
      return
    }

    // Fallback: try auth_user_id
    const { data } = await (supabase as any)
      .from('doctors')
      .select('id, hospital_id, full_name, specialty_id')
      .eq('is_active', true)
      .eq('auth_user_id', authUid)
      .maybeSingle()

    setDoctorProfile(data
      ? { doctorId: data.id, hospitalId: data.hospital_id, fullName: data.full_name, specialtyId: data.specialty_id ?? null }
      : null
    )
  }

  async function fetchProfile(authId: string) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('auth_id', authId)
      .single()
    setUser(data ?? null)
    if (data) await fetchDoctorProfile(authId, data.id)
  }

  async function refreshProfile() {
    if (session?.user.id) await fetchProfile(session.user.id)
  }

  useEffect(() => {
    // MM5: getSession is the authoritative startup load; mark done so INITIAL_SESSION is skipped
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
      // MM5: Skip INITIAL_SESSION if getSession already handled startup
      if (event === 'INITIAL_SESSION' && initialLoadDone.current) return

      setSession(session)
      if (session) fetchProfile(session.user.id)
      else { setUser(null); setDoctorProfile(null) }
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
    // ML1: Clear doctorProfile first to prevent brief inconsistency (session null but doctorProfile set)
    setDoctorProfile(null)
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    // MH8: Do NOT call navigation.goBack() — navigator reacts to session becoming null automatically
  }

  return (
    <AuthContext.Provider value={{ session, user, doctorProfile, loading, signIn, signUp, signOut, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
