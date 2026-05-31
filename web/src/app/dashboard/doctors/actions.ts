'use server'
import { revalidatePath } from 'next/cache'
import { getHospitalContext } from '@/lib/getHospitalContext'
import { createAdminClient } from '@/lib/supabase/admin'

export async function linkDoctorToUser(formData: FormData) {
  const { adminRecord } = await getHospitalContext()
  if (adminRecord.role !== 'admin' && adminRecord.role !== 'owner') return

  const doctorId = formData.get('doctor_id') as string
  const userId   = formData.get('user_id') as string
  if (!doctorId || !userId) return

  const db = createAdminClient()
  await db.from('doctors')
    .update({ user_id: userId })
    .eq('id', doctorId)
    .eq('hospital_id', adminRecord.hospital_id)

  revalidatePath('/dashboard/doctors')
  revalidatePath('/dashboard/specialist')
}

export async function unlinkDoctorFromUser(formData: FormData) {
  const { adminRecord } = await getHospitalContext()
  if (adminRecord.role !== 'admin' && adminRecord.role !== 'owner') return

  const doctorId = formData.get('doctor_id') as string
  if (!doctorId) return

  const db = createAdminClient()
  await db.from('doctors')
    .update({ user_id: null })
    .eq('id', doctorId)
    .eq('hospital_id', adminRecord.hospital_id)

  revalidatePath('/dashboard/doctors')
  revalidatePath('/dashboard/specialist')
}
