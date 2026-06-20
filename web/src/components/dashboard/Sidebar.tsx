'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'

const baseNavItems = [
  { href: '/dashboard',              icon: '⊞', label: 'Overview'     },
  { href: '/dashboard/appointments', icon: '📅', label: 'Appointments' },
  { href: '/dashboard/schedule',     icon: '📆', label: 'Schedule'     },
  { href: '/dashboard/doctors',      icon: '👨‍⚕️', label: 'Doctors'      },
  { href: '/dashboard/analytics',    icon: '📊', label: 'Analytics'    },
  { href: '/dashboard/services',     icon: '🏥', label: 'Services'     },
  { href: '/dashboard/settings',     icon: '⚙️',  label: 'Settings'     },
]

export function Sidebar() {
  const { theme: C } = useTheme()
  const { hospital, stats, signOut } = useAdmin()
  const pathname = usePathname()

  const navItems = hospital?.clinic_model === 'multi'
    ? [
        baseNavItems[0], baseNavItems[1], baseNavItems[2],
        { href: '/dashboard/clinics', icon: '🏗️', label: 'Clinics' },
        ...baseNavItems.slice(3),
      ]
    : baseNavItems

  const initials = hospital?.name
    ? hospital.name.split(' ').filter(Boolean).slice(0, 3).map(w => w[0]).join('').toUpperCase().slice(0, 3)
    : 'QUE'

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
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '.06em' }}>HOSPITAL PORTAL</div>
          </div>
        </div>
      </div>

      {/* Hospital chip */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#1A4A32',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: '#a0e8c0', flexShrink: 0 }}>
            {initials}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#FFFFFF',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {hospital?.name ?? 'Loading…'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.accent }} />
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)' }}>
                {hospital?.is_verified ? 'Verified' : 'Pending'} · PRO
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '10px', overflowY: 'auto' }}>
        {navItems.map(item => {
          const isActive = item.href === '/dashboard'
            ? pathname === '/dashboard'
            : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                background: isActive ? C.accentMid : 'none',
                color: isActive ? C.accent : 'rgba(255,255,255,0.55)',
                fontSize: 13, fontWeight: isActive ? 700 : 500,
                marginBottom: 2, transition: 'all .15s', textDecoration: 'none' }}>
              <span style={{ fontSize: 15, width: 20, textAlign: 'center' }}>{item.icon}</span>
              {item.label}
              {item.href === '/dashboard/appointments' && stats.todayTotal > 0 && (
                <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700,
                  background: C.accent, color: C.id === 'forest' ? '#061208' : '#fff',
                  padding: '1px 7px', borderRadius: 99 }}>
                  {stats.todayTotal}
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
            fontSize: 11, fontWeight: 800, color: C.accent, flexShrink: 0 }}>HA</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Hospital Admin
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {hospital?.email ?? '—'}
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
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Sign Out
        </button>
      </div>
    </div>
  )
}
