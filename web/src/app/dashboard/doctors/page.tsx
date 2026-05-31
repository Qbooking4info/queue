import { getHospitalContext } from '@/lib/getHospitalContext'
import Link from 'next/link'

export default async function DoctorsPage() {
  const { db, adminRecord } = await getHospitalContext()

  const { data: doctors } = await db
    .from('doctors')
    .select('id, full_name, title, qualification, specialty_id, consultation_fee, virtual_fee, accepts_virtual, is_active, avg_rating, review_count, specialties(name)')
    .eq('hospital_id', adminRecord.hospital_id)
    .order('full_name')

  return (
    <div className="flex-1 p-6 max-w-5xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Doctors</h1>
        <Link href="/dashboard/doctors/add"
          className="px-4 py-2 bg-green-500 hover:bg-green-400 text-white text-sm font-bold rounded-xl transition-all">
          + Add Doctor
        </Link>
      </div>

      {!doctors?.length ? (
        <div className="text-center py-20 border border-dashed border-white/10 rounded-2xl">
          <div className="text-4xl mb-3">👨‍⚕️</div>
          <div className="font-medium text-[#7A9089] mb-1">No doctors yet</div>
          <div className="text-sm text-[#4A6058]">Add your first doctor to start accepting bookings</div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {doctors.map(d => {
            const specialty = Array.isArray(d.specialties) ? d.specialties[0] : d.specialties
            return (
              <div key={d.id} className="bg-[#111915] border border-white/7 rounded-2xl p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-lg font-bold text-green-400 shrink-0">
                  {(d.full_name ?? '?').split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase()}
                </div>
                <div className="flex-1">
                  <div className="font-bold">{d.title} {d.full_name}</div>
                  <div className="text-sm text-[#7A9089]">{specialty?.name ?? 'General'} · {d.qualification ?? ''}</div>
                  <div className="flex gap-3 mt-1 text-xs text-[#4A6058]">
                    <span>₦{d.consultation_fee?.toLocaleString() ?? '—'} consult</span>
                    {d.accepts_virtual && <span className="text-blue-400">· Virtual</span>}
                    {d.avg_rating ? <span>· ★ {Number(d.avg_rating).toFixed(1)} ({d.review_count})</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link href={`/dashboard/doctors/${d.id}/schedule`}
                    className="text-xs px-2.5 py-1 rounded-full border border-white/10 text-[#7A9089] hover:border-green-500/30 hover:text-green-400 transition-all">
                    Schedule
                  </Link>
                  <span className={`text-xs px-2.5 py-1 rounded-full border ${d.is_active ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-gray-500 bg-white/5 border-white/10'}`}>
                    {d.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
