import { getHospitalContext } from '@/lib/getHospitalContext'
import { redirect } from 'next/navigation'
import { FrontDeskActions } from './FrontDeskActions'
import { AutoRefresh } from './AutoRefresh'

export const dynamic = 'force-dynamic'

const STATUS_COLOR: Record<string, string> = {
  pending:     'text-amber-400 bg-amber-500/10 border-amber-500/20',
  confirmed:   'text-green-400 bg-green-500/10 border-green-500/20',
  checked_in:  'text-blue-400 bg-blue-500/10 border-blue-500/20',
  in_progress: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  completed:   'text-gray-500 bg-white/5 border-white/10',
  cancelled:   'text-red-400 bg-red-500/10 border-red-500/20',
  no_show:     'text-red-400 bg-red-500/10 border-red-500/20',
}

const QUEUE_STATUSES = ['pending', 'confirmed', 'checked_in', 'in_progress']

export default async function FrontDeskPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { db, adminRecord } = await getHospitalContext()
  const params = await searchParams

  if (adminRecord.role !== 'front_desk' && adminRecord.role !== 'admin' && adminRecord.role !== 'owner') redirect('/dashboard')

  const today = new Date().toISOString().split('T')[0]
  const isValidDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  const selectedDate = (params.date && isValidDate(params.date)) ? params.date : today

  const [{ data: appointments }, { count: pending }, { count: checkedIn }] = await Promise.all([
    db.from('appointments')
      .select('id, booking_ref, start_time, type, status, queue_position, users(full_name, phone), doctors(full_name, title)')
      .eq('hospital_id', adminRecord.hospital_id)
      .eq('appointment_date', selectedDate)
      .in('status', QUEUE_STATUSES)
      .order('queue_position', { ascending: true, nullsFirst: false })
      .order('start_time'),
    db.from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('hospital_id', adminRecord.hospital_id)
      .eq('appointment_date', selectedDate)
      .eq('status', 'pending'),
    db.from('appointments')
      .select('*', { count: 'exact', head: true })
      .eq('hospital_id', adminRecord.hospital_id)
      .eq('appointment_date', selectedDate)
      .eq('status', 'checked_in'),
  ])

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
      <AutoRefresh hospitalId={adminRecord.hospital_id} />
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Front Desk Queue</h1>
          <p className="text-sm text-[#7A9089] mt-0.5">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {/* Date picker */}
        <form method="get" className="flex items-center gap-2">
          <input type="date" name="date" defaultValue={selectedDate}
            className="bg-[#111915] border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-green-500/50" />
          <button type="submit" className="px-4 py-2 bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-semibold rounded-xl hover:bg-green-500/20 transition-all">
            Go
          </button>
        </form>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Awaiting',    value: pending ?? 0,    color: 'text-amber-400' },
          { label: 'Checked In',  value: checkedIn ?? 0,  color: 'text-blue-400'  },
          { label: 'In Queue',    value: appointments?.length ?? 0, color: 'text-green-400' },
        ].map(s => (
          <div key={s.label} className="bg-[#111915] border border-white/7 rounded-2xl p-4 text-center">
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-[#7A9089] mt-1">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Queue list */}
      {!appointments?.length ? (
        <div className="bg-[#111915] border border-white/7 rounded-2xl p-16 text-center text-[#4A6058]">
          <div className="text-4xl mb-3">🎉</div>
          <div className="font-medium text-[#7A9089]">Queue is clear for this date</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {appointments.map((a, idx) => {
            const patient = Array.isArray(a.users)  ? a.users[0]  : a.users
            const doctor  = Array.isArray(a.doctors) ? a.doctors[0] : a.doctors
            const statusClass = STATUS_COLOR[a.status] ?? 'text-gray-400 bg-white/5 border-white/10'
            return (
              <div key={a.id} className="bg-[#111915] border border-white/7 rounded-2xl p-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/7 flex items-center justify-center text-lg font-bold text-[#7A9089] shrink-0">
                    {a.queue_position ?? idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <div className="font-semibold">{patient?.full_name ?? '—'}</div>
                        <div className="text-xs text-[#7A9089] mt-0.5">
                          {doctor?.title} {doctor?.full_name} · {a.start_time?.slice(0, 5)} · {a.type === 'virtual' ? '💻 Virtual' : '🏥 In-person'}
                        </div>
                        {patient?.phone && (
                          <div className="text-xs text-[#4A6058] mt-0.5">📞 {patient.phone}</div>
                        )}
                      </div>
                      <span className={`text-xs font-bold px-2.5 py-1 rounded-full border capitalize shrink-0 ${statusClass}`}>
                        {a.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <FrontDeskActions appointmentId={a.id} currentStatus={a.status} bookingRef={a.booking_ref} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
