'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getUserRole, getHospital, getHospitalStats, getClinicStats,
  getDoctors, getTodayAppointments, getDoctorTodayAppointments,
  getAllHospitals, getClinicDetail, getDoctorProfile,
} from '@/lib/admin-api'
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
  reload: () => Promise<void>
  signOut: () => Promise<void>
  switchHospital: (h: AdminHospital) => Promise<void>
  clearHospital: () => void
}

const AdminContext = createContext<AdminContextValue>({
  user: null, role: null, doctorId: null, clinicId: null, clinicName: null, doctorAvailability: null,
  hospital: null, allHospitals: [],
  stats: { todayTotal: 0, todayCompleted: 0, activeDoctors: 0, avgRating: 4.8, totalBookings: 0, reviewCount: 0 },
  doctors: [], todayAppointments: [], loading: true, accessDenied: false,
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

  async function load() {
    let session: any = null
    try {
      const supabase = createClient()
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

    const roleInfo = await getUserRole(session.user.id)
    if (!roleInfo) {
      setAccessDenied(true)
      setLoading(false)
      return
    }

    setRole(roleInfo.role)
    setDoctorId(roleInfo.doctorId ?? null)
    setClinicId(roleInfo.clinicId ?? null)
    if (roleInfo.displayName) {
      setUser(u => u ? { ...u, displayName: roleInfo.displayName } : u)
    }

    // ── Super admin: load all hospitals, no specific hospital context ───────
    if (roleInfo.role === 'super_admin') {
      const hospitals = await getAllHospitals()
      setAllHospitals(hospitals)
      setLoading(false)
      return
    }

    if (!roleInfo.hospitalId) { setAccessDenied(true); setLoading(false); return }

    const h = await getHospital(roleInfo.hospitalId)
    setHospital(h)

    // ── Doctor: load only their own today's appointments + profile ──────────
    if (roleInfo.role === 'doctor' && roleInfo.doctorId) {
      const [a, profile] = await Promise.all([
        getDoctorTodayAppointments(roleInfo.doctorId),
        getDoctorProfile(roleInfo.doctorId),
      ])
      setTodayAppointments(a)
      setDoctorAvailability(profile?.availability_status ?? 'on_duty')
      setStats({
        todayTotal:      a.length,
        todayCompleted:  a.filter(x => x.status === 'completed').length,
        activeDoctors:   0,
        avgRating:       profile?.avg_rating ?? 0,
        reviewCount:     profile?.review_count ?? 0,
        totalBookings:   profile?.total_bookings ?? 0,
      })
      setLoading(false)
      return
    }

    // ── Clinic admin / front desk: scope to their clinic ───────────────────
    if ((roleInfo.role === 'clinic_admin' || roleInfo.role === 'front_desk') && roleInfo.clinicId) {
      const [s, d, a, clinic] = await Promise.all([
        getClinicStats(roleInfo.hospitalId, roleInfo.clinicId),
        getDoctors(roleInfo.hospitalId, roleInfo.clinicId),
        getTodayAppointments(roleInfo.hospitalId, roleInfo.clinicId),
        getClinicDetail(roleInfo.clinicId),
      ])
      setStats(s)
      setDoctors(d)
      setTodayAppointments(a)
      setClinicName(clinic?.name ?? null)
      setLoading(false)
      return
    }

    // ── Hospital admin: full hospital data ──────────────────────────────────
    const [s, d, a] = await Promise.all([
      getHospitalStats(roleInfo.hospitalId),
      getDoctors(roleInfo.hospitalId),
      getTodayAppointments(roleInfo.hospitalId),
    ])
    setStats(s)
    setDoctors(d)
    setTodayAppointments(a)
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
    const [s, d, a] = await Promise.all([
      getHospitalStats(h.id),
      getDoctors(h.id),
      getTodayAppointments(h.id),
    ])
    setStats(s)
    setDoctors(d)
    setTodayAppointments(a)
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
      todayAppointments, loading, accessDenied, reload: load, signOut, switchHospital, clearHospital,
    }}>
      {children}
    </AdminContext.Provider>
  )
}
