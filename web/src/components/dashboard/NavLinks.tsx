'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, CalendarDays, Stethoscope, Users,
  Settings, ClipboardList, Monitor, type LucideIcon,
} from 'lucide-react'

type NavItem = { href: string; icon: LucideIcon; label: string }

const NAV: Record<string, NavItem[]> = {
  admin: [
    { href: '/dashboard',              icon: LayoutDashboard, label: 'Overview'     },
    { href: '/dashboard/appointments', icon: CalendarDays,    label: 'Appointments' },
    { href: '/dashboard/doctors',      icon: Stethoscope,     label: 'Doctors'      },
    { href: '/dashboard/staff',        icon: Users,           label: 'Staff'        },
    { href: '/dashboard/settings',     icon: Settings,        label: 'Settings'     },
  ],
  specialist: [
    { href: '/dashboard/specialist',   icon: ClipboardList,   label: 'My Schedule'  },
    { href: '/dashboard/appointments', icon: CalendarDays,    label: 'All Bookings' },
  ],
  front_desk: [
    { href: '/dashboard/frontdesk',    icon: Monitor,         label: 'Queue'        },
    { href: '/dashboard/appointments', icon: CalendarDays,    label: 'Appointments' },
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
        const Icon = item.icon
        return (
          <Link key={item.href} href={item.href}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
              isActive
                ? 'text-green-400 bg-green-500/10'
                : 'text-[#7A9089] hover:text-white hover:bg-white/5'
            }`}>
            <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </>
  )
}
