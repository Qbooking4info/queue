import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NavLinks } from '@/components/dashboard/NavLinks'
import type { ReactNode } from 'react'

const ROLE_LABEL: Record<string, string> = {
  admin:      'Admin',
  specialist: 'Specialist',
  front_desk: 'Front Desk',
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()
  const { data: profile } = await db.from('users').select('id').eq('auth_id', user.id).single()
  const { data: adminRecord } = profile
    ? await db.from('hospital_admins').select('role').eq('user_id', profile.id).single()
    : { data: null }

  const role = adminRecord?.role ?? 'admin'

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-[#0D1610] border-r border-white/7 flex flex-col">
        <div className="p-5 border-b border-white/7">
          <div className="text-xl font-bold tracking-tight">Queue</div>
          <div className="text-xs text-[#4A6058] tracking-widest uppercase mt-0.5">
            {ROLE_LABEL[role] ?? 'Portal'}
          </div>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-1">
          <NavLinks role={role} />
        </nav>
        <div className="p-3 border-t border-white/7">
          <form action="/api/auth/signout" method="post">
            <button type="submit" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#4A6058] hover:text-red-400 hover:bg-red-500/5 transition-all">
              <span>⎋</span><span>Sign Out</span>
            </button>
          </form>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-auto">{children}</main>
    </div>
  )
}
