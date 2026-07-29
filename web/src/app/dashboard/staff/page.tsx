import { getHospitalContext } from '@/lib/getHospitalContext'
import { redirect } from 'next/navigation'
import { StaffList } from './StaffList'

export default async function StaffPage() {
  const { db, adminRecord, profile } = await getHospitalContext()

  if (adminRecord.role !== 'admin' && adminRecord.role !== 'owner') redirect('/dashboard')

  const { data: staff } = await db
    .from('hospital_admins')
    .select('id, role, user_id, users(id, full_name, email)')
    .eq('hospital_id', adminRecord.hospital_id)
    .order('role') as {
      data: Array<{
        id: string
        role: string
        user_id: string
        users: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[] | null
      }> | null
    }

  const hasFrontDesk = staff?.some(m => m.role === 'front_desk') ?? false

  return <StaffList staff={staff ?? []} hasFrontDesk={hasFrontDesk} profileId={profile.id} />
}
