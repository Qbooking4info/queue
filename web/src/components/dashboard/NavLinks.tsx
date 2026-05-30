'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV: Record<string, { href: string; icon: string; label: string }[]> = {
  admin: [
    { href: '/dashboard',              icon: '⊞',  label: 'Overview'     },
    { href: '/dashboard/appointments', icon: '📅',  label: 'Appointments' },
    { href: '/dashboard/doctors',      icon: '👨‍⚕️', label: 'Doctors'      },
    { href: '/dashboard/staff',        icon: '👥',  label: 'Staff'        },
    { href: '/dashboard/settings',     icon: '⚙️',  label: 'Settings'     },
  ],
  specialist: [
    { href: '/dashboard/specialist',   icon: '📋',  label: 'My Schedule'  },
    { href: '/dashboard/appointments', icon: '📅',  label: 'All Bookings' },
  ],
  front_desk: [
    { href: '/dashboard/frontdesk',    icon: '🖥️',  label: 'Queue'        },
    { href: '/dashboard/appointments', icon: '📅',  label: 'Appointments' },
  ],
}

export function NavLinks({ role }: { role: string }) {
  const pathname = usePathname()
  const items = NAV[role] ?? NAV.admin

  return (
    <>
      {items.map(item => {
        const isActive = item.href === '/dashboard'
          ? pathname === '/dashboard'
          : pathname.startsWith(item.href)
        return (
          <Link key={item.href} href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              isActive
                ? 'text-green-400 bg-green-500/10'
                : 'text-[#7A9089] hover:text-white hover:bg-white/5'
            }`}>
            <span className="text-base">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        )
      })}
    </>
  )
}
