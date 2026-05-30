import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const isWelcome = params.welcome === 'true'

  const { data: adminRecord } = await supabase
    .from('hospital_admins')
    .select('hospital_id, role, hospitals(name, city, state, is_verified, avg_rating, total_bookings)')
    .eq('user_id', (await supabase.from('users').select('id').eq('auth_id', user.id).single()).data?.id ?? '')
    .single()

  if (!adminRecord) redirect('/onboarding')

  const hospital = adminRecord.hospitals as { name: string; city: string; state: string; is_verified: boolean; avg_rating: number; total_bookings: number } | null

  const { count: appointmentCount } = await supabase
    .from('appointments')
    .select('*', { count: 'exact', head: true })
    .eq('hospital_id', adminRecord.hospital_id)
    .eq('status', 'confirmed')

  const { count: doctorCount } = await supabase
    .from('doctors')
    .select('*', { count: 'exact', head: true })
    .eq('hospital_id', adminRecord.hospital_id)
    .eq('is_active', true)

  const { data: recentAppointments } = await supabase
    .from('appointments')
    .select('id, booking_ref, appointment_date, start_time, type, status, doctors(full_name, title)')
    .eq('hospital_id', adminRecord.hospital_id)
    .order('appointment_date', { ascending: true })
    .gte('appointment_date', new Date().toISOString().split('T')[0])
    .limit(5)

  const stats = [
    { label: "Today's Appointments", value: appointmentCount ?? 0, icon: '📅', color: '#00E87A' },
    { label: 'Active Doctors',        value: doctorCount ?? 0,      icon: '👨‍⚕️', color: '#5B9EFF' },
    { label: 'Rating',                value: hospital?.avg_rating ? `${hospital.avg_rating}★` : 'N/A', icon: '⭐', color: '#FFB547' },
    { label: 'Total Bookings',        value: hospital?.total_bookings ?? 0, icon: '📋', color: '#00E87A' },
  ]

  return (
    <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
      {isWelcome && (
        <div className="mb-6 p-4 rounded-2xl border border-green-500/30 bg-green-500/8">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🎉</span>
            <div>
              <div className="font-bold text-green-400">Welcome to Queue!</div>
              <div className="text-sm text-[#7A9089]">Your hospital profile is under review. We&apos;ll verify it within 24 hours.</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">{hospital?.name ?? 'Dashboard'}</h1>
          <p className="text-sm text-[#7A9089] mt-0.5">{hospital?.city}, {hospital?.state} · {adminRecord.role}</p>
        </div>
        {!hospital?.is_verified && (
          <span className="text-xs bg-amber-500/10 border border-amber-500/25 text-amber-400 px-3 py-1.5 rounded-full font-medium">
            Pending Verification
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        {stats.map(s => (
          <div key={s.label} className="bg-[#111915] border border-white/7 rounded-2xl p-4">
            <div className="text-2xl mb-2">{s.icon}</div>
            <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-[#7A9089] mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-[#111915] border border-white/7 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Upcoming Appointments</h2>
            <Link href="/dashboard/appointments" className="text-xs text-green-400 hover:text-green-300">View all →</Link>
          </div>
          {recentAppointments && recentAppointments.length > 0 ? (
            <div className="flex flex-col gap-2">
              {recentAppointments.map((a) => {
                const doctor = Array.isArray(a.doctors) ? a.doctors[0] : a.doctors
                return (
                  <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/3 border border-white/5">
                    <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center text-sm">
                      {a.type === 'virtual' ? '💻' : '🏥'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{doctor?.title} {doctor?.full_name}</div>
                      <div className="text-xs text-[#7A9089]">{a.appointment_date} · {a.start_time.slice(0, 5)}</div>
                    </div>
                    <span className="text-xs font-mono text-[#4A6058]">{a.booking_ref}</span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-[#4A6058] text-center py-6">No upcoming appointments</p>
          )}
        </div>

        <div className="bg-[#111915] border border-white/7 rounded-2xl p-5">
          <h2 className="font-bold mb-4">Quick Actions</h2>
          <div className="flex flex-col gap-2">
            {[
              { href: '/dashboard/doctors',      icon: '👨‍⚕️', label: 'Add a Doctor',           sub: 'Register doctors and set their availability' },
              { href: '/dashboard/appointments', icon: '📅', label: 'Manage Appointments',    sub: 'View, confirm, or reschedule bookings' },
              { href: '/dashboard/settings',     icon: '⚙️',  label: 'Hospital Settings',     sub: 'Update profile, hours, and EMR settings' },
            ].map(a => (
              <Link key={a.href} href={a.href}
                className="flex items-center gap-3 p-3 rounded-xl border border-white/7 hover:border-white/12 hover:bg-white/3 transition-all">
                <span className="text-xl">{a.icon}</span>
                <div>
                  <div className="text-sm font-medium">{a.label}</div>
                  <div className="text-xs text-[#7A9089]">{a.sub}</div>
                </div>
                <span className="ml-auto text-[#4A6058]">›</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
