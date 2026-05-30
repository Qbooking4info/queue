import { getHospitalContext } from '@/lib/getHospitalContext'
import Link from 'next/link'
import { redirect } from 'next/navigation'

const STATUS_COLOR: Record<string, string> = {
  confirmed:   'text-green-400 bg-green-500/10 border-green-500/20',
  pending:     'text-amber-400 bg-amber-500/10 border-amber-500/20',
  completed:   'text-gray-500 bg-white/5 border-white/10',
  cancelled:   'text-red-400 bg-red-500/10 border-red-500/20',
  no_show:     'text-red-400 bg-red-500/10 border-red-500/20',
  checked_in:  'text-blue-400 bg-blue-500/10 border-blue-500/20',
  in_progress: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
}

export default async function SpecialistPage() {
  const { db, profile, adminRecord } = await getHospitalContext()

  if (adminRecord.role !== 'specialist' && adminRecord.role !== 'admin') redirect('/dashboard')

  // Find the doctor record linked to this user
  const { data: doctor } = await db
    .from('doctors')
    .select('id, full_name, title, specialties(name)')
    .eq('hospital_id', adminRecord.hospital_id)
    .eq('user_id', profile.id)
    .single()

  const today = new Date().toISOString().split('T')[0]

  const [{ data: todayAppts }, { data: upcomingAppts }, { count: completedCount }] = await Promise.all([
    db.from('appointments')
      .select('id, booking_ref, start_time, type, status, users(full_name, phone, date_of_birth, gender)')
      .eq('hospital_id', adminRecord.hospital_id)
      .eq('doctor_id', doctor?.id ?? '')
      .eq('appointment_date', today)
      .in('status', ['pending', 'confirmed', 'checked_in', 'in_progress'])
      .order('start_time'),
    db.from('appointments')
      .select('id, booking_ref, appointment_date, start_time, type, status, users(full_name)')
      .eq('hospital_id', adminRecord.hospital_id)
      .eq('doctor_id', doctor?.id ?? '')
      .gt('appointment_date', today)
      .in('status', ['pending', 'confirmed'])
      .order('appointment_date')
      .order('start_time')
      .limit(5),
    db.from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('doctor_id', doctor?.id ?? '')
      .eq('status', 'completed'),
  ])

  const specialty = Array.isArray(doctor?.specialties) ? doctor?.specialties[0] : doctor?.specialties

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {doctor ? `${doctor.title} ${doctor.full_name}` : 'My Schedule'}
          </h1>
          <p className="text-sm text-[#7A9089] mt-0.5">
            {specialty?.name ?? 'Specialist'} · {new Date(today + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="bg-[#111915] border border-white/7 rounded-2xl px-4 py-3 text-center">
          <div className="text-2xl font-bold text-green-400">{completedCount ?? 0}</div>
          <div className="text-xs text-[#7A9089] mt-0.5">Total Completed</div>
        </div>
      </div>

      {!doctor && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-6 text-sm text-amber-400">
          ⚠️ Your account is not linked to a doctor record. Ask your admin to link your profile to a doctor entry.
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Today's queue */}
        <div className="md:col-span-2">
          <h2 className="font-bold mb-3">Today&apos;s Queue ({todayAppts?.length ?? 0})</h2>
          {!todayAppts?.length ? (
            <div className="bg-[#111915] border border-white/7 rounded-2xl p-8 text-center text-[#4A6058]">
              <div className="text-3xl mb-2">✅</div>
              <div className="text-sm">No appointments scheduled for today</div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {todayAppts.map((a, idx) => {
                const patient = Array.isArray(a.users) ? a.users[0] : a.users
                const statusClass = STATUS_COLOR[a.status] ?? 'text-gray-400 bg-white/5 border-white/10'
                return (
                  <Link key={a.id} href={`/dashboard/specialist/${a.id}`}
                    className="bg-[#111915] border border-white/7 hover:border-green-500/20 hover:bg-green-500/3 rounded-2xl p-4 flex items-center gap-4 transition-all group">
                    <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/7 flex items-center justify-center text-sm font-bold text-[#7A9089] shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm group-hover:text-green-400 transition-colors">{patient?.full_name ?? '—'}</div>
                      <div className="text-xs text-[#7A9089] mt-0.5">
                        {a.start_time?.slice(0, 5)} · {a.type === 'virtual' ? '💻 Virtual' : '🏥 In-person'}
                        {patient?.gender ? ` · ${patient.gender}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border capitalize ${statusClass}`}>
                        {a.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-[#4A6058] group-hover:text-green-400 transition-colors">›</span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Upcoming */}
        <div>
          <h2 className="font-bold mb-3">Upcoming</h2>
          <div className="bg-[#111915] border border-white/7 rounded-2xl p-4 flex flex-col gap-3">
            {!upcomingAppts?.length ? (
              <p className="text-sm text-[#4A6058] text-center py-4">No upcoming appointments</p>
            ) : upcomingAppts.map(a => {
              const patient = Array.isArray(a.users) ? a.users[0] : a.users
              return (
                <Link key={a.id} href={`/dashboard/specialist/${a.id}`}
                  className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/3 transition-all group">
                  <div className="w-8 h-8 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center text-xs font-bold text-green-400 shrink-0">
                    {new Date(a.appointment_date + 'T00:00:00').getDate()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate group-hover:text-green-400 transition-colors">{patient?.full_name ?? '—'}</div>
                    <div className="text-xs text-[#4A6058]">{a.appointment_date} · {a.start_time?.slice(0, 5)}</div>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
