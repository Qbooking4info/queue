'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { AdminHospital, AdminDoctor, AdminAppointment, UserRole, DoctorAvailabilityStatus } from '@/lib/admin-api'

interface AdminContextValue {
  user: { id: string; email: string; displayName?: string } | null
  role: UserRole | null
  doctorId: string | null
  clinicId: string | null
  clinicName: string | null
  doctorAvailability: DoctorAvailabilityStatus | null
  hospital: AdminHospital | null
  allHospitals: AdminHospital[]   // populated for super_admin
  stats: {
    todayTotal: number
    todayCompleted: number
    activeDoctors: number
    avgRating: number
    totalBookings: number
    reviewCount: number
  }
  doctors: AdminDoctor[]
  todayAppointments: AdminAppointment[]
  loading: boolean
  accessDenied: boolean
  /** Signed in with a valid account that has no dashboard — currently ambulance crew. */
  crewOnly: boolean
  /** Signed in with a valid account that has no dashboard — a plain patient account. */
  patientOnly: boolean
  reload: () => Promise<void>
  signOut: () => Promise<void>
  switchHospital: (h: AdminHospital) => Promise<void>
  clearHospital: () => void
}

const AdminContext = createContext<AdminContextValue>({
  user: null, role: null, doctorId: null, clinicId: null, clinicName: null, doctorAvailability: null,
  hospital: null, allHospitals: [],
  stats: { todayTotal: 0, todayCompleted: 0, activeDoctors: 0, avgRating: 4.8, totalBookings: 0, reviewCount: 0 },
  doctors: [], todayAppointments: [], loading: true, accessDenied: false, crewOnly: false, patientOnly: false,
  reload: async () => {}, signOut: async () => {}, switchHospital: async () => {}, clearHospital: () => {},
})

export const useAdmin = () => useContext(AdminContext)

export function AdminProvider({ children }: { children: ReactNode }) {
  const [user, setUser]         = useState<{ id: string; email: string; displayName?: string } | null>(null)
  const [role, setRole]         = useState<UserRole | null>(null)
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [clinicId, setClinicId] = useState<string | null>(null)
  const [clinicName, setClinicName] = useState<string | null>(null)
  const [doctorAvailability, setDoctorAvailability] = useState<DoctorAvailabilityStatus | null>(null)
  const [hospital, setHospital] = useState<AdminHospital | null>(null)
  const [allHospitals, setAllHospitals] = useState<AdminHospital[]>([])
  const [stats, setStats]       = useState<AdminContextValue['stats']>({ todayTotal: 0, todayCompleted: 0, activeDoctors: 0, avgRating: 4.8, totalBookings: 0, reviewCount: 0 })
  const [doctors, setDoctors]   = useState<AdminDoctor[]>([])
  const [todayAppointments, setTodayAppointments] = useState<AdminAppointment[]>([])
  const [loading, setLoading]   = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [crewOnly, setCrewOnly] = useState(false)
  const [patientOnly, setPatientOnly] = useState(false)

  async function load() {
    let session: any = null
    let supabase: any = null
    try {
      supabase = createClient()
      const result = await supabase.auth.getSession()
      session = result?.data?.session ?? null
    } catch {
      // Corrupted auth cookie in browser — clear it so the next load works
      document.cookie.split(';').forEach(c => {
        const k = c.split('=')[0].trim()
        if (k.startsWith('sb-')) document.cookie = `${k}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
      })
      setLoading(false)
      window.location.href = '/login'
      return
    }

    if (!session) { setLoading(false); return }

    setUser({ id: session.user.id, email: session.user.email ?? '' })

    // Single requireRole-gated route (Task 15) replaces the separate
    // /api/me/role call plus 9 direct admin-api.ts/adminDb calls that used
    // to run in the browser. Scope (whole hospital / one clinic / one
    // doctor / all hospitals for super_admin) is resolved server-side from
    // the caller's session, not from anything this client sends.
    const res = await fetch('/api/dashboard/bootstrap')
    if (!res.ok) {
      // A crew account is a valid login with nowhere to go in this dashboard.
      // Treating it as "access denied" signed them straight back out, which
      // reads as a rejected password rather than a wrong app.
      const body = await res.json().catch(() => ({}))
      if (body?.code === 'CREW_MOBILE_ONLY') setCrewOnly(true)
      else if (body?.code === 'PATIENT_MOBILE_ONLY') setPatientOnly(true)
      else setAccessDenied(true)
      setLoading(false)
      return
    }
    const data = await res.json()

    setRole(data.role as UserRole)
    setDoctorId(data.doctorId ?? null)
    setClinicId(data.clinicId ?? null)
    setClinicName(data.clinicName ?? null)
    if (data.displayName) {
      setUser(u => u ? { ...u, displayName: data.displayName } : u)
    }

    // ── Super admin with no hospital selected yet: just the hospital list ───
    if (data.role === 'super_admin' && data.allHospitals) {
      setAllHospitals(data.allHospitals)
      setLoading(false)
      return
    }

    setHospital(data.hospital ?? null)
    setDoctorAvailability(data.doctorAvailability ?? null)
    setStats(data.stats ?? { todayTotal: 0, todayCompleted: 0, activeDoctors: 0, avgRating: 4.8, totalBookings: 0, reviewCount: 0 })
    setDoctors(data.doctors ?? [])
    setTodayAppointments(data.todayAppointments ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function clearHospital() {
    setHospital(null)
    setDoctors([])
    setTodayAppointments([])
    setStats({ todayTotal: 0, todayCompleted: 0, activeDoctors: 0, avgRating: 4.8, totalBookings: 0, reviewCount: 0 })
  }

  async function switchHospital(h: AdminHospital) {
    setHospital(h)
    setLoading(true)
    // ?hospitalId is only honoured by the route for the super_admin role --
    // trusted there since super_admin already has platform-wide access.
    const res = await fetch(`/api/dashboard/bootstrap?hospitalId=${h.id}`)
    if (res.ok) {
      const data = await res.json()
      setStats(data.stats)
      setDoctors(data.doctors)
      setTodayAppointments(data.todayAppointments)
    }
    setLoading(false)
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <AdminContext.Provider value={{
      user, role, doctorId, clinicId, clinicName, doctorAvailability, hospital, allHospitals, stats, doctors,
      todayAppointments, loading, accessDenied, crewOnly, patientOnly, reload: load, signOut, switchHospital, clearHospital,
    }}>
      {children}
    </AdminContext.Provider>
  )
}
