'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHospitalContext } from '@/lib/getHospitalContext'

export async function addStaff(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  try {
    const { adminRecord } = await getHospitalContext()
    if (adminRecord.role !== 'admin') return { error: 'Unauthorized' }

    const email    = (formData.get('email') as string ?? '').trim().toLowerCase()
    const role     = (formData.get('role')  as string ?? '').trim()
    const doctorId = (formData.get('doctor_id') as string ?? '') || null

    if (!email) return { error: 'Email is required.' }
    if (!['specialist', 'front_desk', 'admin'].includes(role)) return { error: 'Please select a role.' }

    const db = createAdminClient()

    const { data: user } = await db.from('users').select('id').eq('email', email).single()
    if (!user) return { error: `No account found for "${email}". The person must first register on the patient mobile app.` }

    const { data: existing } = await db
      .from('hospital_admins')
      .select('id')
      .eq('hospital_id', adminRecord.hospital_id)
      .eq('user_id', user.id)
      .single()

    if (existing) return { error: 'This person is already a staff member of your hospital.' }

    if (role === 'specialist' && doctorId) {
      await db.from('doctors')
        .update({ user_id: user.id })
        .eq('id', doctorId)
        .eq('hospital_id', adminRecord.hospital_id)
    }

    const { error } = await db.from('hospital_admins').insert({
      hospital_id: adminRecord.hospital_id,
      user_id:     user.id,
      role,
    })

    if (error) return { error: error.message }

    revalidatePath('/dashboard/staff')
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Something went wrong.' }
  }

  redirect('/dashboard/staff')
}

export async function removeStaff(formData: FormData) {
  const { adminRecord } = await getHospitalContext()
  if (adminRecord.role !== 'admin') return

  const staffId = formData.get('staff_id') as string
  const db = createAdminClient()

  const { data: member } = await db
    .from('hospital_admins')
    .select('id, hospital_id')
    .eq('id', staffId)
    .single()

  if (!member || member.hospital_id !== adminRecord.hospital_id) return

  await db.from('hospital_admins').delete().eq('id', staffId)

  revalidatePath('/dashboard/staff')
}
