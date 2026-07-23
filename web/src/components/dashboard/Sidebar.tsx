'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import type { UserRole } from '@/lib/admin-api'
import {
  LayoutDashboard, CalendarDays, ListOrdered, CalendarRange,
  Stethoscope, Users, Settings, BarChart2, Tag, Building2,
  Hospital, Monitor, LogOut, ArrowLeft, type LucideIcon,
} from 'lucide-react'

type NavItem = { href: string; icon: LucideIcon; label: string }

const SUPER_ADMIN_HOSPITAL_NAV: NavItem[] = [
  { href: '/dashboard',              icon: LayoutDashboard, label: 'Overview'      },
  { href: '/dashboard/appointments', icon: CalendarDays,    label: 'Appointments'  },
  { href: '/dashboard/queue',        icon: ListOrdered,     label: 'Live Queue'    },
  { href: '/dashboard/schedule',     icon: CalendarRange,   label: 'Schedule'      },
  { href: '/dashboard/doctors',      icon: Stethoscope,     label: 'Doctors'       },
  { href: '/dashboard/analytics',    icon: BarChart2,       label: 'Analytics'     },
  { href: '/dashboard/services',     icon: Tag,             label: 'Services'      },
  { href: '/dashboard/settings',     icon: Settings,        label: 'Settings'      },
]

const NAV: Record<UserRole, NavItem[]> = {
  super_admin: [
    { href: '/dashboard',           icon: LayoutDashboard, label: 'Platform Overview'  },
    { href: '/dashboard/hospitals', icon: Hospital,        label: 'All Hospitals'       },
    { href: '/dashboard/analytics', icon: BarChart2,       label: 'Analytics'           },
    { href: '/dashboard/settings',  icon: Settings,        label: 'Platform Settings'   },
  ],
  hospital_admin: [
    { href: '/dashboard',              icon: LayoutDashboard, label: 'Overview'      },
    { href: '/dashboard/appointments', icon: CalendarDays,    label: 'Appointments'  },
    { href: '/dashboard/queue',        icon: ListOrdered,     label: 'Live Queue'    },
    { href: '/dashboard/schedule',     icon: CalendarRange,   label: 'Schedule'      },
    { href: '/dashboard/doctors',      icon: Stethoscope,     label: 'Doctors'       },
    { href: '/dashboard/analytics',    icon: BarChart2,       label: 'Analytics'     },
    { href: '/dashboard/services',     icon: Tag,             label: 'Services'      },
    { href: '/dashboard/settings',     icon: Settings,        label: 'Settings'      },
  ],
  clinic_admin: [
    { href: '/dashboard',              icon: LayoutDashboard, label: 'Overview'      },
    { href: '/dashboard/appointments', icon: CalendarDays,    label: 'Appointments'  },
    { href: '/dashboard/queue',        icon: ListOrdered,     label: 'Live Queue'    },
    { href: '/dashboard/schedule',     icon: CalendarRange,   label: 'Schedule'      },
    { href: '/dashboard/doctors',      icon: Stethoscope,     label: 'Doctors'       },
  ],
  doctor: [
    { href: '/dashboard',              icon: LayoutDashboard, label: 'My Dashboard'      },
    { href: '/dashboard/queue',        icon: ListOrdered,     label: "Today's Queue"     },
    { href: '/dashboard/appointments', icon: CalendarDays,    label: 'My Appointments'   },
    { href: '/dashboard/schedule',     icon: CalendarRange,   label: 'My Schedule'       },
  ],
  front_desk: [
    { href: '/dashboard',              icon: Monitor,         label: 'Overview'      },
    { href: '/dashboard/queue',        icon: ListOrdered,     label: 'Live Queue'    },
    { href: '/dashboard/appointments', icon: CalendarDays,    label: 'Appointments'  },
  ],
}

const CLINICS_ITEM: NavItem = { href: '/dashboard/clinics', icon: Building2, label: 'Clinics' }

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin:    'Super Admin',
  hospital_admin: 'Hospital Admin',
  clinic_admin:   'Clinic Admin',
  doctor:         'Doctor',
  front_desk:     'Front Desk',
}

export function Sidebar() {
  const { theme: C } = useTheme()
  const { hospital, stats, signOut, role, user } = useAdmin()
  const pathname = usePathname()

  const currentRole: UserRole = role ?? 'hospital_admin'
  const isSuperWithHospital = currentRole === 'super_admin' && !!hospital

  let navItems: NavItem[] = isSuperWithHospital
    ? SUPER_ADMIN_HOSPITAL_NAV
    : (NAV[currentRole] ?? NAV.hospital_admin)

  if ((currentRole === 'hospital_admin' || isSuperWithHospital) && hospital?.clinic_model === 'multi') {
    const schedIdx = navItems.findIndex(i => i.href === '/dashboard/schedule')
    navItems = [
      ...navItems.slice(0, schedIdx + 1),
      CLINICS_ITEM,
      ...navItems.slice(schedIdx + 1),
    ]
  }

  const initials = hospital?.name
    ? hospital.name.split(' ').filter(Boolean).slice(0, 3).map(w => w[0]).join('').toUpperCase().slice(0, 3)
    : (currentRole === 'super_admin' ? 'SYS' : 'QUE')

  const userInitials = (user?.displayName ?? user?.email ?? 'U')
    .split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'U'

  return (
    <div style={{ width: 220, flexShrink: 0, background: C.sidebar,
      display: 'flex', flexDirection: 'column', height: '100vh',
      position: 'sticky', top: 0, transition: 'background .3s' }}>

      {/* Logo */}
      <div style={{ padding: '28px 22px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: C.accentMid,
            border: `1px solid ${C.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 40 40" fill="none">
              <rect x="6" y="8" width="28" height="24" rx="6" stroke={C.accent} strokeWidth="2.5"/>
              <line x1="13" y1="16" x2="27" y2="16" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="13" y1="20" x2="22" y2="20" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="30" cy="30" r="8" fill={C.sidebar} stroke={C.accent} strokeWidth="2.5"/>
              <line x1="30" y1="26.5" x2="30" y2="30" stroke={C.accent} strokeWidth="2" strokeLinecap="round"/>
              <circle cx="30" cy="31.5" r="1" fill={C.accent}/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-.03em' }}>Queue</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '.06em' }}>
              {currentRole === 'super_admin' ? 'PLATFORM ADMIN' : 'HOSPITAL PORTAL'}
            </div>
          </div>
        </div>
      </div>

      {/* Hospital context chip */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8,
            background: (currentRole === 'super_admin' && !hospital) ? '#1A2A4A' : '#1A4A32',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800,
            color: (currentRole === 'super_admin' && !hospital) ? '#a0b8f0' : '#a0e8c0', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {(currentRole === 'super_admin' && !hospital) ? 'All Hospitals' : (hospital?.name ?? 'Loading…')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                {(currentRole === 'super_admin' && !hospital) ? 'Platform Admin' : (hospital?.is_verified ? 'Verified' : 'Pending')}
              </span>
            </div>
          </div>
        </div>
        {isSuperWithHospital && (
          <Link href="/dashboard/hospitals"
            style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.4)',
              textDecoration: 'none', fontWeight: 500 }}>
            <ArrowLeft size={11} /> All Hospitals
          </Link>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px', overflowY: 'auto' }}>
        {navItems.map(item => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)
          const Icon = item.icon
          return (
            <Link key={item.href} href={item.href}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                background: isActive ? C.accentMid : 'none',
                color: isActive ? C.accent : 'rgba(255,255,255,0.55)',
                fontSize: 13, fontWeight: isActive ? 700 : 500,
                marginBottom: 2, transition: 'all .15s', textDecoration: 'none' }}>
              <Icon size={16} strokeWidth={isActive ? 2.5 : 2} />
              {item.label}
              {item.href === '/dashboard/appointments' && stats.todayTotal > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                  background: C.accent, color: C.id === 'forest' ? '#061208' : '#fff',
                  padding: '1px 7px', borderRadius: 99 }}>
                  {stats.todayTotal}
                </span>
              )}
              {item.href === '/dashboard/queue' && stats.todayTotal > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                  background: 'rgba(239,159,39,0.8)', color: '#fff',
                  padding: '1px 7px', borderRadius: 99 }}>
                  {stats.todayTotal - stats.todayCompleted}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User chip + sign out */}
      <div style={{ padding: '12px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: C.accentMid,
            border: `1px solid ${C.accentBorder}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 800, color: C.accent, flexShrink: 0 }}>
            {userInitials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user?.displayName ?? ROLE_LABELS[currentRole]}
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ROLE_LABELS[currentRole]}
            </div>
          </div>
        </div>
        <button onClick={signOut}
          style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 8, padding: '9px 12px', borderRadius: 10, cursor: 'pointer',
            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)',
            color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 600,
            transition: 'all .15s', fontFamily: 'inherit' }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(220,60,60,0.12)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(220,60,60,0.3)'
            ;(e.currentTarget as HTMLButtonElement).style.color = '#f07070'
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.10)'
            ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.55)'
          }}>
          <LogOut size={14} />
          Sign Out
        </button>
      </div>
    </div>
  )
}
