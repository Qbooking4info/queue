'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHospitalContext } from '@/lib/getHospitalContext'

const VALID_ROLES = ['specialist', 'front_desk', 'admin']

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
    if (!VALID_ROLES.includes(role)) return { error: 'Please select a role.' }

    const db = createAdminClient()

    // Check if already a staff member regardless of path
    const { data: existingUser } = await db.from('users').select('id').eq('email', email).single()
    if (existingUser) {
      const { data: alreadyStaff } = await db
        .from('hospital_admins').select('id')
        .eq('hospital_id', adminRecord.hospital_id)
        .eq('user_id', existingUser.id).single()
      if (alreadyStaff) return { error: 'This person is already a staff member.' }
    }

    let userId: string

    if (existingUser) {
      // User already has an account — just grant access
      userId = existingUser.id
    } else {
      // No account yet — send an invite email via Supabase Auth
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://web-roan-kappa-39.vercel.app'
      const { data: inviteData, error: inviteErr } = await db.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/staff/accept`,
        data: { hospital_id: adminRecord.hospital_id, role },
      })

      if (inviteErr) return { error: inviteErr.message }
      if (!inviteData.user) return { error: 'Failed to create invite.' }

      // Pre-create users record so hospital_admins FK is satisfiable
      const { data: newProfile, error: profileErr } = await db.from('users').insert({
        auth_id:   inviteData.user.id,
        email,
        full_name: 'Invited Staff',
      }).select('id').single()

      if (profileErr) return { error: profileErr.message }
      userId = newProfile.id
    }

    // Link to doctor record if specialist
    if (role === 'specialist' && doctorId) {
      await db.from('doctors')
        .update({ user_id: userId })
        .eq('id', doctorId)
        .eq('hospital_id', adminRecord.hospital_id)
    }

    const { error } = await db.from('hospital_admins').insert({
      hospital_id: adminRecord.hospital_id,
      user_id:     userId,
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
    .from('hospital_admins').select('id, hospital_id')
    .eq('id', staffId).single()

  if (!member || member.hospital_id !== adminRecord.hospital_id) return

  await db.from('hospital_admins').delete().eq('id', staffId)
  revalidatePath('/dashboard/staff')
}
