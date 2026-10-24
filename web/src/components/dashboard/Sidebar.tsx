'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import type { UserRole } from '@/lib/admin-api'
import { Users, Video, MessageSquare, LayoutDashboard, CalendarDays, ListOrdered, CalendarRange, Stethoscope, Settings, BarChart2, Tag, Building2, Hospital, Monitor, ArrowLeft, Ambulance, type LucideIcon } from 'lucide-react'

type NavItem = { href: string; icon: LucideIcon; label: string }

const SUPER_ADMIN_HOSPITAL_NAV: NavItem[] = [
  { href: '/dashboard',              icon: LayoutDashboard, label: 'Dashboard'     },
  { href: '/dashboard/appointments', icon: CalendarDays,    label: 'Appointments'  },
  { href: '/dashboard/queue',        icon: ListOrdered,     label: 'Live Queue'    },
  { href: '/dashboard/schedule',     icon: CalendarRange,   label: 'Schedule'      },
  { href: '/dashboard/doctors',      icon: Stethoscope,     label: 'Doctors'       },
  { href: '/dashboard/analytics',    icon: BarChart2,       label: 'Reports'       },
  { href: '/dashboard/services',     icon: Tag,             label: 'Services'      },
  { href: '/dashboard/settings',     icon: Settings,        label: 'Settings'      },
]

const NAV: Record<UserRole, NavItem[]> = {
  super_admin: [
    { href: '/dashboard',           icon: LayoutDashboard, label: 'Platform Overview'  },
    { href: '/dashboard/hospitals', icon: Hospital,        label: 'All Hospitals'       },
    { href: '/dashboard/directory', icon: Ambulance,       label: 'Emergency Directory' },
    { href: '/dashboard/analytics', icon: BarChart2,       label: 'Analytics'           },
    { href: '/dashboard/settings',  icon: Settings,        label: 'Platform Settings'   },
  ],
  hospital_admin: [
    { href: '/dashboard',              icon: LayoutDashboard, label: 'Dashboard'     },
    { href: '/dashboard/appointments', icon: CalendarDays,    label: 'Appointments'  },
    { href: '/dashboard/queue',        icon: ListOrdered,     label: 'Live Queue'    },
    { href: '/dashboard/patients',     icon: Users,           label: 'Patients'      },
    { href: '/dashboard/virtual',      icon: Video,           label: 'Virtual Care'  },
    { href: '/dashboard/ambulances',   icon: Ambulance,       label: 'Ambulance'     },
    { href: '/dashboard/messages',     icon: MessageSquare,   label: 'Messages'      },
    { href: '/dashboard/schedule',     icon: CalendarRange,   label: 'Schedule'      },
    { href: '/dashboard/doctors',      icon: Stethoscope,     label: 'Doctors'       },
    { href: '/dashboard/analytics',    icon: BarChart2,       label: 'Reports'       },
    { href: '/dashboard/services',     icon: Tag,             label: 'Services'      },
    { href: '/dashboard/settings',     icon: Settings,        label: 'Settings'      },
  ],
  clinic_admin: [
    { href: '/dashboard',              icon: LayoutDashboard, label: 'Dashboard'     },
    { href: '/dashboard/appointments', icon: CalendarDays,    label: 'Appointments'  },
    { href: '/dashboard/queue',        icon: ListOrdered,     label: 'Live Queue'    },
    { href: '/dashboard/patients',     icon: Users,           label: 'Patients'      },
    { href: '/dashboard/virtual',      icon: Video,           label: 'Virtual Care'  },
    { href: '/dashboard/messages',     icon: MessageSquare,   label: 'Messages'      },
    { href: '/dashboard/schedule',     icon: CalendarRange,   label: 'Schedule'      },
    { href: '/dashboard/doctors',      icon: Stethoscope,     label: 'Doctors'       },
    { href: '/dashboard/analytics',    icon: BarChart2,       label: 'Reports'       },
    { href: '/dashboard/services',     icon: Tag,             label: 'Services'      },
  ],
  doctor: [
    { href: '/dashboard',              icon: LayoutDashboard, label: 'My Dashboard'      },
    { href: '/dashboard/queue',        icon: ListOrdered,     label: "Today's Queue"     },
    { href: '/dashboard/appointments', icon: CalendarDays,    label: 'My Appointments'   },
    { href: '/dashboard/schedule',     icon: CalendarRange,   label: 'My Schedule'       },
  ],
  front_desk: [
    { href: '/dashboard',              icon: Monitor,         label: 'Dashboard'     },
    { href: '/dashboard/queue',        icon: ListOrdered,     label: 'Live Queue'    },
    { href: '/dashboard/ambulances',   icon: Ambulance,       label: 'Ambulance'     },
    { href: '/dashboard/patients',     icon: Users,           label: 'Patients'      },
    { href: '/dashboard/messages',     icon: MessageSquare,   label: 'Messages'      },
    { href: '/dashboard/appointments', icon: CalendarDays,    label: 'Appointments'  },
  ],
  // Ambulance crew work through the mobile crew app, not this dashboard — this
  // nav only covers the rare case of a crew account signing into the web login.
  ambulance_crew: [
    { href: '/dashboard',            icon: LayoutDashboard, label: 'Dashboard'  },
    { href: '/dashboard/ambulances', icon: Ambulance,       label: 'Ambulance'  },
  ],
}

const CLINICS_ITEM: NavItem = { href: '/dashboard/clinics', icon: Building2, label: 'Clinics' }

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin:    'Super Admin',
  hospital_admin: 'Hospital Admin',
  clinic_admin:   'Clinic Admin',
  doctor:         'Doctor',
  front_desk:     'Front Desk',
  ambulance_crew: 'Ambulance Crew',
}

interface SidebarProps {
  mobileOpen?: boolean
  onClose?: () => void
  /** Live inbound ambulances, for the Ambulance badge. */
  inboundCount?: number
  /** Unread messages in the hospital inbox. */
  unreadMessages?: number
}

// v3.1 w-dash: deep teal rail, white logo tile, text items 42px tall, active item
// white on a translucent panel, white count badges. The colours are fixed rather
// than themed because the rail is dark in both themes.
const RAIL_TEXT = '#CCFBF1'
const RAIL_SUB  = '#99F6E4'

export function Sidebar({ mobileOpen = false, inboundCount = 0, unreadMessages = 0 }: SidebarProps) {
  const { theme: C } = useTheme()
  const { hospital, stats, role, clinicId } = useAdmin()
  const pathname = usePathname()

  const currentRole: UserRole = role ?? 'hospital_admin'
  const isSuperWithHospital = currentRole === 'super_admin' && !!hospital

  let navItems: NavItem[] = isSuperWithHospital
    ? SUPER_ADMIN_HOSPITAL_NAV
    : (NAV[currentRole] ?? NAV.hospital_admin)

  if ((currentRole === 'hospital_admin' || isSuperWithHospital) && hospital?.clinic_model === 'multi') {
    const schedIdx = navItems.findIndex(i => i.href === '/dashboard/schedule')
    navItems = [...navItems.slice(0, schedIdx + 1), CLINICS_ITEM, ...navItems.slice(schedIdx + 1)]
  }

  if (currentRole === 'clinic_admin' && clinicId) {
    const schedIdx = navItems.findIndex(i => i.href === '/dashboard/schedule')
    navItems = [
      ...navItems.slice(0, schedIdx + 1),
      { href: `/dashboard/clinics/${clinicId}`, icon: Building2, label: 'My Clinic' },
      ...navItems.slice(schedIdx + 1),
    ]
  }

  const openToday = Math.max(0, stats.todayTotal - stats.todayCompleted)
  const badgeFor = (href: string): number => {
    if (href === '/dashboard/appointments') return openToday
    if (href === '/dashboard/ambulances') return inboundCount
    if (href === '/dashboard/messages') return unreadMessages
    return 0
  }

  const place = (currentRole === 'super_admin' && !hospital) ? 'Platform admin' : (hospital?.name ?? 'Loading…')

  return (
    <>
      <style>{`
        .q-sidebar { width: 240px; flex-shrink: 0; display: flex; flex-direction: column; height: 100vh;
          position: sticky; top: 0; overflow-y: auto; box-sizing: border-box; padding: 22px 14px;
          transition: transform .2s ease-out; }
        .q-nav-item { min-height: 42px; padding: 0 12px; border-radius: 10px; display: flex; align-items: center;
          justify-content: space-between; gap: 8px; font-size: 14px; text-decoration: none; color: ${RAIL_TEXT}; }
        .q-nav-item:hover { background: rgba(255,255,255,0.08); color: #FFFFFF; }
        .q-nav-item[aria-current="page"] { background: rgba(255,255,255,0.14); color: #FFFFFF; font-weight: 700; }
        .q-nav-item:focus-visible { outline: 2px solid #FFFFFF; outline-offset: 2px; }
      `}</style>
      <aside className={`q-sidebar${mobileOpen ? ' is-open' : ''}`} style={{ background: C.sidebar }} aria-label="Dashboard">

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 8px 18px' }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, background: '#FFFFFF', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F766E" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true">
              <path d="M12 4v16M4 12h16" />
            </svg>
          </span>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 16, fontWeight: 800, color: '#FFFFFF' }}>Queue</span>
            <span title={place} style={{ display: 'block', fontSize: 12, color: RAIL_SUB,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
              {place}{hospital && !hospital.is_verified && currentRole !== 'super_admin' ? ' · pending' : ''}
            </span>
          </span>
        </div>

        {isSuperWithHospital && (
          <Link href="/dashboard/hospitals" className="q-nav-item" style={{ justifyContent: 'flex-start', fontSize: 13, marginBottom: 6 }}>
            <ArrowLeft size={14} aria-hidden="true" /> All hospitals
          </Link>
        )}

        <nav aria-label="Main" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(item => {
            const isActive = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href)
            const badge = badgeFor(item.href)
            return (
              <Link key={item.href} href={item.href} className="q-nav-item" aria-current={isActive ? 'page' : undefined}>
                {item.label}
                {badge > 0 && (
                  <span aria-label={`${badge} open`} style={{ minWidth: 20, height: 20, padding: '0 6px', boxSizing: 'border-box',
                    borderRadius: 99, background: '#FFFFFF', color: '#134E4A', fontSize: 11, fontWeight: 800,
                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </aside>
    </>
  )
}
