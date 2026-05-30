import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import type { ReactNode } from 'react'

const navItems = [
  { href: '/dashboard',              icon: '⊞', label: 'Overview'     },
  { href: '/dashboard/appointments', icon: '📅', label: 'Appointments' },
  { href: '/dashboard/doctors',      icon: '👨‍⚕️', label: 'Doctors'      },
  { href: '/dashboard/settings',     icon: '⚙️',  label: 'Settings'     },
]

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 bg-[#0D1610] border-r border-white/7 flex flex-col">
        <div className="p-5 border-b border-white/7">
          <div className="text-xl font-bold tracking-tight">Queue</div>
          <div className="text-xs text-[#4A6058] tracking-widest uppercase mt-0.5">Hospital Portal</div>
        </div>
        <nav className="flex-1 p-3 flex flex-col gap-1">
          {navItems.map(item => (
            <Link key={item.href} href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#7A9089] hover:text-white hover:bg-white/5 transition-all">
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
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
