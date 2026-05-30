import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function getHospitalContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const [{ data: profile }, ] = await Promise.all([
    db.from('users').select('id').eq('auth_id', user.id).single(),
  ])
  if (!profile) redirect('/onboarding')

  const { data: adminRecord } = await db
    .from('hospital_admins')
    .select('hospital_id, role')
    .eq('user_id', profile.id)
    .single()
  if (!adminRecord) redirect('/onboarding')

  return { user, db, profile, adminRecord }
}
