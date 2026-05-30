import { getHospitalContext } from '@/lib/getHospitalContext'
import { StatusButton } from './StatusButton'

const STATUS_COLOR: Record<string, string> = {
  confirmed:   'text-green-400 bg-green-500/10 border-green-500/20',
  pending:     'text-amber-400 bg-amber-500/10 border-amber-500/20',
  completed:   'text-gray-500 bg-white/5 border-white/10',
  cancelled:   'text-red-400 bg-red-500/10 border-red-500/20',
  no_show:     'text-red-400 bg-red-500/10 border-red-500/20',
  checked_in:  'text-blue-400 bg-blue-500/10 border-blue-500/20',
  in_progress: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; date?: string }>
}) {
  const { db, adminRecord } = await getHospitalContext()
  const params = await searchParams

  let query = db
    .from('appointments')
    .select('id, booking_ref, appointment_date, start_time, type, status, created_at, doctors(full_name, title), users(full_name, phone)')
    .eq('hospital_id', adminRecord.hospital_id)
    .order('appointment_date', { ascending: false })
    .order('start_time', { ascending: true })

  if (params.status && params.status !== 'all') query = query.eq('status', params.status)
  if (params.date) query = query.eq('appointment_date', params.date)

  const { data: appointments } = await query.limit(50)

  const filters = ['all','pending','confirmed','checked_in','in_progress','completed','cancelled','no_show']

  return (
    <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Appointments</h1>
        <span className="text-sm text-[#7A9089]">{appointments?.length ?? 0} shown</span>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap mb-6">
        {filters.map(f => (
          <a key={f} href={`/dashboard/appointments${f === 'all' ? '' : `?status=${f}`}`}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border capitalize transition-all ${
              (params.status ?? 'all') === f
                ? 'border-green-500/50 bg-green-500/10 text-green-400'
                : 'border-white/10 text-[#7A9089] hover:border-white/20'
            }`}>
            {f === 'all' ? 'All' : f.replace(/_/g, ' ')}
          </a>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {!appointments?.length ? (
          <div className="text-center py-20 text-[#4A6058]">
            <div className="text-4xl mb-3">📅</div>
            <div className="font-medium text-[#7A9089]">No appointments found</div>
          </div>
        ) : appointments.map(a => {
          const doctor  = Array.isArray(a.doctors) ? a.doctors[0] : a.doctors
          const patient = Array.isArray(a.users)   ? a.users[0]   : a.users
          const statusClass = STATUS_COLOR[a.status] ?? 'text-gray-400 bg-white/5 border-white/10'
          return (
            <div key={a.id} className="bg-[#111915] border border-white/7 rounded-2xl p-4">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/7 flex items-center justify-center text-lg shrink-0">
                  {a.type === 'virtual' ? '💻' : '🏥'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div className="font-semibold text-sm">{patient?.full_name ?? '—'}</div>
                      <div className="text-xs text-[#7A9089]">{doctor?.title} {doctor?.full_name}</div>
                      <div className="text-xs text-[#4A6058] mt-0.5">{a.appointment_date} · {a.start_time?.slice(0,5)} · <span className="capitalize">{a.type}</span></div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border capitalize ${statusClass}`}>
                        {a.status.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs font-mono text-[#4A6058]">{a.booking_ref}</span>
                    </div>
                  </div>
                  {patient?.phone && (
                    <div className="text-xs text-[#4A6058] mt-1">📞 {patient.phone}</div>
                  )}
                </div>
              </div>
              {/* Status action buttons */}
              <div className="mt-3 flex justify-end">
                <StatusButton appointmentId={a.id} currentStatus={a.status} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
