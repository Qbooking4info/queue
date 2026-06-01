'use server'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHospitalContext } from '@/lib/getHospitalContext'

export async function updateHospitalProfile(formData: FormData) {
  const { adminRecord } = await getHospitalContext()
  const db = createAdminClient()

  const allVirtual = formData.getAll('accepts_virtual')
  const allEmergency = formData.getAll('emergency_hours')

  const { error } = await db.from('hospitals').update({
    phone:            (formData.get('phone') as string).trim() || null,
    email:            (formData.get('email') as string).trim() || null,
    whatsapp:         (formData.get('whatsapp') as string).trim() || null,
    description:      (formData.get('description') as string).trim() || null,
    address:          (formData.get('address') as string).trim() || null,
    accepts_virtual:  allVirtual.includes('true'),
    emergency_hours:  allEmergency.includes('true'),
    updated_at:       new Date().toISOString(),
  }).eq('id', adminRecord.hospital_id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/settings')
}

export async function upsertOperatingHours(hospitalId: string, day: number, open: string, close: string, closed: boolean) {
  const { adminRecord } = await getHospitalContext()
  if (adminRecord.hospital_id !== hospitalId) throw new Error('Unauthorized')
  const db = createAdminClient()

  if (closed) {
    const { error } = await db.from('hospital_operating_hours').delete()
      .eq('hospital_id', hospitalId).eq('day_of_week', day)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await db.from('hospital_operating_hours')
      .upsert(
        { hospital_id: hospitalId, day_of_week: day, open_time: open, close_time: close },
        { onConflict: 'hospital_id,day_of_week' },
      )
    if (error) throw new Error(error.message)
  }
  revalidatePath('/dashboard/settings')
}
