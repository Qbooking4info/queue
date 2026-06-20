'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getHospitalIdForUser, getFirstHospitalId, getHospital, getHospitalStats, getDoctors, getTodayAppointments } from '@/lib/admin-api'
import type { AdminHospital, AdminDoctor, AdminAppointment } from '@/lib/admin-api'

interface AdminContextValue {
  user: { id: string; email: string } | null
  hospital: AdminHospital | null
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
  reload: () => Promise<void>
  signOut: () => Promise<void>
}

const AdminContext = createContext<AdminContextValue>({
  user: null, hospital: null,
  stats: { todayTotal: 0, todayCompleted: 0, activeDoctors: 0, avgRating: 4.8, totalBookings: 0, reviewCount: 0 },
  doctors: [], todayAppointments: [], loading: true,
  reload: async () => {}, signOut: async () => {},
})

export const useAdmin = () => useContext(AdminContext)

export function AdminProvider({ children }: { children: ReactNode }) {
  const [user, setUser]     = useState<{ id: string; email: string } | null>(null)
  const [hospital, setHospital] = useState<AdminHospital | null>(null)
  const [stats, setStats]   = useState<AdminContextValue['stats']>({ todayTotal: 0, todayCompleted: 0, activeDoctors: 0, avgRating: 4.8, totalBookings: 0, reviewCount: 0 })
  const [doctors, setDoctors] = useState<AdminDoctor[]>([])
  const [todayAppointments, setTodayAppointments] = useState<AdminAppointment[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) { setLoading(false); return }

    setUser({ id: session.user.id, email: session.user.email ?? '' })

    // Look up the hospital this user owns/manages
    let hospitalId = await getHospitalIdForUser(session.user.id)
    // Fall back to first hospital only for demo accounts with no hospital_admins record
    if (!hospitalId) hospitalId = await getFirstHospitalId()
    if (!hospitalId) { setLoading(false); return }

    const [h, s, d, a] = await Promise.all([
      getHospital(hospitalId),
      getHospitalStats(hospitalId),
      getDoctors(hospitalId),
      getTodayAppointments(hospitalId),
    ])

    setHospital(h)
    setStats(s)
    setDoctors(d)
    setTodayAppointments(a)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <AdminContext.Provider value={{
      user, hospital, stats, doctors, todayAppointments, loading,
      reload: load, signOut,
    }}>
      {children}
    </AdminContext.Provider>
  )
}
