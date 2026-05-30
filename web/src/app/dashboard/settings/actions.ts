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
    phone:            (formData.get('phone') as string) || undefined,
    email:            (formData.get('email') as string) || undefined,
    whatsapp:         (formData.get('whatsapp') as string) || undefined,
    description:      (formData.get('description') as string) || undefined,
    address:          (formData.get('address') as string) || undefined,
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
    const { data: existing } = await db.from('hospital_operating_hours')
      .select('id').eq('hospital_id', hospitalId).eq('day_of_week', day).single()

    if (existing) {
      const { error } = await db.from('hospital_operating_hours')
        .update({ open_time: open, close_time: close })
        .eq('id', existing.id)
      if (error) throw new Error(error.message)
    } else {
      const { error } = await db.from('hospital_operating_hours')
        .insert({ hospital_id: hospitalId, day_of_week: day, open_time: open, close_time: close })
      if (error) throw new Error(error.message)
    }
  }
  revalidatePath('/dashboard/settings')
}
