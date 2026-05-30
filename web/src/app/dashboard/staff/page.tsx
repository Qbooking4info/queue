import { getHospitalContext } from '@/lib/getHospitalContext'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { removeStaff } from './actions'

const ROLE_BADGE: Record<string, string> = {
  admin:      'text-green-400 bg-green-500/10 border-green-500/20',
  specialist: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  front_desk: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
}

const ROLE_LABEL: Record<string, string> = {
  admin:      'Admin',
  specialist: 'Specialist',
  front_desk: 'Front Desk',
}

export default async function StaffPage() {
  const { db, adminRecord, profile } = await getHospitalContext()

  if (adminRecord.role !== 'admin') redirect('/dashboard')

  const { data: staff } = await db
    .from('hospital_admins')
    .select('id, role, user_id, users(full_name, email)')
    .eq('hospital_id', adminRecord.hospital_id)
    .order('role')

  return (
    <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Staff</h1>
          <p className="text-sm text-[#7A9089] mt-0.5">Manage who has access to your hospital portal</p>
        </div>
        <Link href="/dashboard/staff/add"
          className="px-4 py-2 bg-green-500 hover:bg-green-400 text-white text-sm font-bold rounded-xl transition-all">
          + Add Staff
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {staff?.map(member => {
          const user = Array.isArray(member.users) ? member.users[0] : member.users
          const isSelf = member.user_id === profile.id
          return (
            <div key={member.id} className="bg-[#111915] border border-white/7 rounded-2xl p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/7 flex items-center justify-center text-sm font-bold text-[#7A9089] shrink-0">
                {user?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2) ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">
                  {user?.full_name ?? '—'} {isSelf && <span className="text-xs text-[#4A6058]">(you)</span>}
                </div>
                <div className="text-xs text-[#4A6058] mt-0.5">{user?.email}</div>
              </div>
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${ROLE_BADGE[member.role ?? ''] ?? 'text-gray-400 bg-white/5 border-white/10'}`}>
                {ROLE_LABEL[member.role ?? ''] ?? member.role}
              </span>
              {!isSelf && (
                <form action={removeStaff}>
                  <input type="hidden" name="staff_id" value={member.id} />
                  <button type="submit"
                    className="text-xs text-red-400 hover:text-red-300 px-2.5 py-1 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all">
                    Remove
                  </button>
                </form>
              )}
            </div>
          )
        })}
      </div>

      {/* Role guide */}
      <div className="mt-8 grid grid-cols-3 gap-3">
        {[
          { role: 'Admin',      icon: '⚙️',  desc: 'Full access — manage settings, doctors, staff, and all appointments' },
          { role: 'Specialist', icon: '👨‍⚕️', desc: 'View own schedule, add diagnosis and notes to patient appointments' },
          { role: 'Front Desk', icon: '🖥️',  desc: 'Manage the patient queue — confirm, check-in, and track appointments' },
        ].map(r => (
          <div key={r.role} className="bg-[#111915] border border-white/7 rounded-2xl p-4">
            <div className="text-xl mb-2">{r.icon}</div>
            <div className="font-semibold text-sm mb-1">{r.role}</div>
            <div className="text-xs text-[#4A6058] leading-relaxed">{r.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
