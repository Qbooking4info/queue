import { unstable_noStore as noStore } from 'next/cache'
import { getHospitalContext } from '@/lib/getHospitalContext'
import Link from 'next/link'
import { linkDoctorToUser, unlinkDoctorFromUser } from './actions'

export default async function DoctorsPage() {
  noStore()
  const { db, adminRecord } = await getHospitalContext()

  const isAdmin = adminRecord.role === 'admin' || adminRecord.role === 'owner'

  const [
    { data: doctors, error: doctorsErr },
    { data: allSpecialists },
  ] = await Promise.all([
    db.from('doctors')
      .select('id, full_name, title, qualification, specialty_id, consultation_fee, virtual_fee, accepts_virtual, is_active, avg_rating, review_count, user_id, specialties(name), users(id, full_name, email)')
      .eq('hospital_id', adminRecord.hospital_id)
      .order('full_name'),
    db.from('hospital_admins')
      .select('user_id, users(id, full_name, email)')
      .eq('hospital_id', adminRecord.hospital_id)
      .eq('role', 'specialist'),
  ])

  if (doctorsErr) console.error('[DoctorsPage] query error:', doctorsErr)

  // Specialist users already linked to a doctor
  const linkedUserIds = new Set(doctors?.map(d => d.user_id).filter(Boolean))

  // Available (unlinked) specialists for the dropdown
  const availableSpecialists = (allSpecialists ?? []).filter(s => {
    const u = Array.isArray(s.users) ? s.users[0] : s.users
    return u?.id && !linkedUserIds.has(s.user_id)
  })

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
            const linkedUser = Array.isArray(d.users) ? d.users[0] : d.users
            const isLinked = !!d.user_id

            return (
              <div key={d.id} className="bg-[#111915] border border-white/7 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex items-center gap-4">
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

                {/* Link status row */}
                {isAdmin && (
                  isLinked ? (
                    <div className="flex items-center justify-between bg-green-500/5 border border-green-500/15 rounded-xl px-3 py-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-green-400">✓ Linked to</span>
                        <span className="text-white font-medium">{linkedUser?.full_name ?? '—'}</span>
                        <span className="text-[#4A6058]">{linkedUser?.email}</span>
                      </div>
                      <form action={unlinkDoctorFromUser}>
                        <input type="hidden" name="doctor_id" value={d.id} />
                        <button type="submit"
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all">
                          Unlink
                        </button>
                      </form>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 bg-amber-500/5 border border-amber-500/15 rounded-xl px-3 py-2">
                      <span className="text-xs text-amber-400 shrink-0">⚠️ No staff login linked</span>
                      {availableSpecialists.length > 0 ? (
                        <form action={linkDoctorToUser} className="flex items-center gap-2 flex-1">
                          <input type="hidden" name="doctor_id" value={d.id} />
                          <select name="user_id" required
                            className="flex-1 bg-[#060A07] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-green-500/40">
                            <option value="">Select specialist…</option>
                            {availableSpecialists.map(s => {
                              const u = Array.isArray(s.users) ? s.users[0] : s.users
                              return (
                                <option key={s.user_id} value={s.user_id}>
                                  {u?.full_name} — {u?.email}
                                </option>
                              )
                            })}
                          </select>
                          <button type="submit"
                            className="text-xs px-2.5 py-1 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 border border-green-500/20 transition-all shrink-0">
                            Link
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-[#4A6058]">
                          Add a doctor via <Link href="/dashboard/doctors/add" className="underline underline-offset-2 hover:text-white">Add Doctor</Link> to auto-create a linked login.
                        </span>
                      )}
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
