'use server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getHospitalContext } from '@/lib/getHospitalContext'

const VALID_ROLES = ['specialist', 'front_desk', 'admin']

const CHARSET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
function genPassword() {
  return Array.from(crypto.getRandomValues(new Uint8Array(12)))
    .map((b: number) => CHARSET[b % CHARSET.length]).join('')
}

// Reset password for an auto-generated staff account and return the new credentials
export async function resetStaffPassword(
  _prev: { email: string; password: string } | { error: string } | null,
  formData: FormData,
): Promise<{ email: string; password: string } | { error: string } | null> {
  const { adminRecord } = await getHospitalContext()
  if (adminRecord.role !== 'admin' && adminRecord.role !== 'owner') return { error: 'Unauthorized' }

  const userId = formData.get('user_id') as string
  const db = createAdminClient()

  const { data: userRow } = await db
    .from('users').select('email, auth_id').eq('id', userId).single()
  if (!userRow?.auth_id) return { error: 'User not found' }

  const newPassword = genPassword()
  const { error } = await db.auth.admin.updateUserById(userRow.auth_id, { password: newPassword })
  if (error) return { error: error.message }

  return { email: userRow.email ?? '', password: newPassword }
}

// Create or repair the front desk login for this hospital
export async function setupFrontDeskLogin(
  _prev: { email: string; password: string } | { error: string } | null,
  _formData: FormData,
): Promise<{ email: string; password: string } | { error: string } | null> {
  const { db, adminRecord } = await getHospitalContext()
  if (adminRecord.role !== 'admin' && adminRecord.role !== 'owner') return { error: 'Unauthorized' }

  const dbAdmin = createAdminClient()
  const newPassword = genPassword()

  // Check if a front_desk record already exists
  const { data: existing } = await db
    .from('hospital_admins')
    .select('user_id, users(id, email, auth_id)')
    .eq('hospital_id', adminRecord.hospital_id)
    .eq('role', 'front_desk')
    .single()

  if (existing) {
    // Account exists — just reset the password
    const u = Array.isArray(existing.users) ? existing.users[0] : existing.users as any
    if (u?.auth_id) {
      const { error } = await dbAdmin.auth.admin.updateUserById(u.auth_id, { password: newPassword })
      if (error) return { error: error.message }
    }
    revalidatePath('/dashboard/staff')
    return { email: u?.email ?? '', password: newPassword }
  }

  // No front desk record — create one from scratch
  const { data: hospital } = await db.from('hospitals').select('slug').eq('id', adminRecord.hospital_id).single()
  const slugBase = (hospital?.slug ?? '').replace(/-[a-z0-9]{5,}$/, '') || 'hospital'
  const fdEmail = `frontdesk.${slugBase}@queue.hospital`

  // Auth user might already exist (creation succeeded but hospital_admins insert failed before)
  let authId: string
  let userId: string

  const { data: existingUserRow } = await db.from('users').select('id, auth_id').eq('email', fdEmail).single()

  if (existingUserRow?.auth_id) {
    authId = existingUserRow.auth_id
    userId = existingUserRow.id
    await dbAdmin.auth.admin.updateUserById(authId, { password: newPassword })
  } else {
    const { data: authUser, error: authErr } = await dbAdmin.auth.admin.createUser({
      email: fdEmail, password: newPassword, email_confirm: true,
    })
    if (authErr || !authUser.user) return { error: authErr?.message ?? 'Failed to create auth user' }
    authId = authUser.user.id

    const { data: profile, error: profileErr } = await db.from('users').insert({
      auth_id: authId, email: fdEmail, full_name: 'Front Desk',
    }).select('id').single()
    if (profileErr || !profile) return { error: profileErr?.message ?? 'Failed to create profile' }
    userId = profile.id
  }

  const { error: adminInsertErr } = await db.from('hospital_admins').insert({
    hospital_id: adminRecord.hospital_id, user_id: userId, role: 'front_desk',
  })
  if (adminInsertErr) return { error: adminInsertErr.message }

  revalidatePath('/dashboard/staff')
  return { email: fdEmail, password: newPassword }
}

export async function addStaff(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  try {
    const { adminRecord } = await getHospitalContext()
    if (adminRecord.role !== 'admin' && adminRecord.role !== 'owner') return { error: 'Unauthorized' }

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
        redirectTo: `${siteUrl}/auth/callback?next=/staff/accept`,
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
  if (adminRecord.role !== 'admin' && adminRecord.role !== 'owner') return

  const staffId = formData.get('staff_id') as string
  const db = createAdminClient()

  const { data: member } = await db
    .from('hospital_admins').select('id, hospital_id')
    .eq('id', staffId).single()

  if (!member || member.hospital_id !== adminRecord.hospital_id) return

  await db.from('hospital_admins').delete().eq('id', staffId)
  revalidatePath('/dashboard/staff')
}
