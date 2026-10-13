'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme, type ThemePreference } from '@/contexts/ThemeContext'
import { useAdmin } from '@/contexts/AdminContext'
import type { AdminNotification } from '@/lib/admin-api'
import { Search, Bell, XCircle, Star, Wallet, ClipboardList, Menu, Sun, Moon, Monitor, LogOut } from 'lucide-react'
import { ROLE_LABELS } from './Sidebar'

// Destinations for the command bar. Filtered by role so nobody is offered a page
// the sidebar wouldn't show them.
const COMMANDS: { label: string; href: string; roles: string[] }[] = [
  { label: 'Dashboard',          href: '/dashboard',              roles: ['hospital_admin', 'clinic_admin', 'front_desk', 'super_admin', 'doctor'] },
  { label: 'Appointments',       href: '/dashboard/appointments', roles: ['hospital_admin', 'clinic_admin', 'front_desk', 'doctor'] },
  { label: 'New walk-in',        href: '/dashboard/appointments?walkin=1', roles: ['hospital_admin', 'clinic_admin', 'front_desk'] },
  { label: 'Live Queue',         href: '/dashboard/queue',        roles: ['hospital_admin', 'clinic_admin', 'front_desk', 'doctor'] },
  { label: 'Ambulance desk',     href: '/dashboard/ambulances',   roles: ['hospital_admin', 'front_desk'] },
  { label: 'Schedule',           href: '/dashboard/schedule',     roles: ['hospital_admin', 'clinic_admin', 'doctor'] },
  { label: 'Doctors',            href: '/dashboard/doctors',      roles: ['hospital_admin', 'clinic_admin'] },
  { label: 'Staff',              href: '/dashboard/staff',        roles: ['hospital_admin'] },
  { label: 'Reports',            href: '/dashboard/analytics',    roles: ['hospital_admin', 'clinic_admin', 'super_admin'] },
  { label: 'Services',           href: '/dashboard/services',     roles: ['hospital_admin', 'clinic_admin'] },
  { label: 'Settings',           href: '/dashboard/settings',     roles: ['hospital_admin', 'super_admin'] },
  { label: 'All hospitals',      href: '/dashboard/hospitals',    roles: ['super_admin'] },
]

const THEME_OPTIONS: { id: ThemePreference; label: string; Icon: typeof Sun }[] = [
  { id: 'light',  label: 'Light',  Icon: Sun },
  { id: 'dark',   label: 'Dark',   Icon: Moon },
  { id: 'system', label: 'System', Icon: Monitor },
]

const TOPBAR_STYLES = `
  .q-hamburger { display: none !important; }
  .q-cmd-hint { margin-left: auto; font-size: 12px; padding: 3px 8px; border-radius: 6px; }
  @media (max-width: 767px) {
    .q-hamburger { display: flex !important; }
    .q-cmd-hint, .q-cmd-text { display: none; }
    .q-topbar { flex-wrap: nowrap !important; }
    .q-cmd { flex: 1 1 0 !important; }
    .q-walkin-label { display: none; }
    .q-notif-panel { width: min(320px, calc(100vw - 32px)) !important; right: 0 !important; }
  }
`

interface TopBarProps {
  onMenuToggle?: () => void
}

export function TopBar({ onMenuToggle }: TopBarProps) {
  const router = useRouter()
  const { theme: C, preference, setPreference } = useTheme()
  const { hospital, role, user, signOut } = useAdmin()
  const [notifOpen, setNotifOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cmdOpen, setCmdOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const [notifications, setNotifications] = useState<AdminNotification[]>([])
  const [lastSeen, setLastSeen] = useState<string | null>(null)
  const cmdInput = useRef<HTMLInputElement>(null)

  const currentRole = role ?? 'hospital_admin'
  const canWalkIn = ['hospital_admin', 'clinic_admin', 'front_desk'].includes(currentRole)
  const lastSeenKey = hospital?.id ? `q-notif-last-seen-${hospital.id}` : null

  const initials = (user?.displayName ?? user?.email ?? 'U')
    .split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'U'

  useEffect(() => {
    if (!hospital?.id) return
    try { setLastSeen(localStorage.getItem(`q-notif-last-seen-${hospital.id}`)) } catch { /* no storage */ }
    fetch(`/api/hospitals/${hospital.id}/activity`)
      .then(res => res.ok ? res.json() : { notifications: [] })
      .then(body => setNotifications(body.notifications ?? []))
      .catch(() => setNotifications([]))
  }, [hospital?.id])

  // Ctrl/⌘K opens the command bar from anywhere on the dashboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setCmdOpen(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  useEffect(() => { if (cmdOpen) { setQuery(''); setCursor(0); setTimeout(() => cmdInput.current?.focus(), 0) } }, [cmdOpen])

  const results = useMemo(() => COMMANDS
    .filter(c => c.roles.includes(currentRole))
    .filter(c => c.label.toLowerCase().includes(query.trim().toLowerCase())), [currentRole, query])

  function go(href: string) { setCmdOpen(false); router.push(href) }

  const hasUnread = notifications.some(n => !lastSeen || new Date(n.sortAt).getTime() > new Date(lastSeen).getTime())

  function openNotifications() {
    setNotifOpen(o => {
      const next = !o
      if (next && lastSeenKey) {
        const now = new Date().toISOString()
        try { localStorage.setItem(lastSeenKey, now) } catch { /* not persisted */ }
        setLastSeen(now)
      }
      return next
    })
  }

  const iconBtn = { width: 40, height: 40, borderRadius: 12, background: C.card, border: `1px solid ${C.border}`,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textMuted, flexShrink: 0 } as const

  return (
    <>
      <style>{TOPBAR_STYLES}</style>
      <header className="q-topbar" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '14px clamp(16px, 3vw, 36px)', background: C.bg, position: 'sticky', top: 0, zIndex: 10 }}>

        <button onClick={onMenuToggle} className="q-hamburger" aria-label="Open menu" style={iconBtn}>
          <Menu size={20} aria-hidden="true" />
        </button>

        <button type="button" className="q-cmd" onClick={() => setCmdOpen(true)} aria-label="Open command bar"
          style={{ flex: '1 1 280px', height: 44, borderRadius: 12, border: `1px solid ${C.border}`, background: C.card,
            display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', fontFamily: 'inherit', fontSize: 14,
            color: C.textMuted, cursor: 'pointer', minWidth: 0 }}>
          <Search size={18} aria-hidden="true" />
          <span className="q-cmd-text" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Search or jump to…
          </span>
          <span className="q-cmd-hint" style={{ background: C.bgAlt, color: C.textSub }}>Ctrl / ⌘ K</span>
        </button>

        {canWalkIn && (
          <button type="button" onClick={() => router.push('/dashboard/appointments?walkin=1')} aria-label="New walk-in"
            style={{ height: 44, padding: '0 18px', borderRadius: 13, border: 'none', background: C.accent,
              color: C.id === 'forest' ? '#04201D' : '#FFFFFF', fontFamily: 'inherit', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', flexShrink: 0 }}>
            +<span className="q-walkin-label"> Walk in</span>
          </button>
        )}

        {/* Notifications */}
        <div style={{ position: 'relative' }}>
          <button onClick={openNotifications} aria-label={hasUnread ? 'Notifications, unread' : 'Notifications'} style={{ ...iconBtn, position: 'relative' }}>
            <Bell size={17} aria-hidden="true" />
            {hasUnread && <span style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%',
              background: C.accent, border: `2px solid ${C.card}` }} />}
          </button>
          {notifOpen && (
            <>
              <div onClick={() => setNotifOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
              <div className="q-notif-panel" role="dialog" aria-label="Notifications" style={{ position: 'absolute', right: 0, top: 48, width: 320,
                background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                zIndex: 100, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`, fontSize: 13, fontWeight: 700, color: C.text }}>Notifications</div>
                {notifications.length === 0 && (
                  <div style={{ padding: '20px 16px', fontSize: 13, color: C.textMuted, textAlign: 'center' }}>No recent activity</div>
                )}
                {notifications.map((n, i) => (
                  <button key={n.id} type="button" onClick={() => { setNotifOpen(false); router.push(n.href) }}
                    style={{ width: '100%', textAlign: 'left', padding: '10px 16px', cursor: 'pointer', background: 'none', border: 'none',
                      borderBottom: i < notifications.length - 1 ? `1px solid ${C.border}` : 'none', display: 'flex', gap: 10, fontFamily: 'inherit' }}>
                    <span style={{ flexShrink: 0, display: 'flex', color:
                      n.type === 'cancel' ? C.red : n.type === 'review' ? C.amber : n.type === 'payment' ? C.accent : C.blue }} aria-hidden="true">
                      {n.type === 'cancel' ? <XCircle size={16} /> : n.type === 'review' ? <Star size={16} /> : n.type === 'payment' ? <Wallet size={16} /> : <ClipboardList size={16} />}
                    </span>
                    <span>
                      <span style={{ display: 'block', fontSize: 13, color: C.text, lineHeight: 1.4 }}>{n.msg}</span>
                      <span style={{ display: 'block', fontSize: 11, color: C.textMuted, marginTop: 2 }}>{n.time}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Avatar: theme + sign out */}
        <div style={{ position: 'relative' }}>
          <button type="button" onClick={() => setMenuOpen(o => !o)} aria-label="Account menu" aria-expanded={menuOpen}
            style={{ width: 40, height: 40, borderRadius: 99, background: C.accentLight, color: C.accent, border: 'none',
              fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
            {initials}
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
              <div role="menu" style={{ position: 'absolute', right: 0, top: 48, width: 240, background: C.card,
                border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 100, padding: 8 }}>
                <div style={{ padding: '6px 8px 10px' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {user?.displayName ?? user?.email ?? 'Signed in'}
                  </div>
                  <div style={{ fontSize: 12, color: C.textMuted }}>{ROLE_LABELS[currentRole]}</div>
                </div>
                <div role="group" aria-label="Theme" style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 12, background: C.bgAlt, marginBottom: 6 }}>
                  {THEME_OPTIONS.map(({ id, label, Icon }) => (
                    <button key={id} type="button" aria-pressed={preference === id} onClick={() => setPreference(id)}
                      style={{ flex: 1, height: 34, borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                        fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        background: preference === id ? C.card : 'transparent', color: preference === id ? C.text : C.textMuted }}>
                      <Icon size={13} aria-hidden="true" /> {label}
                    </button>
                  ))}
                </div>
                <button type="button" role="menuitem" onClick={signOut}
                  style={{ width: '100%', height: 40, borderRadius: 10, border: 'none', background: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', fontFamily: 'inherit', fontSize: 14, color: C.red }}>
                  <LogOut size={15} aria-hidden="true" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {cmdOpen && (
        <div role="dialog" aria-modal="true" aria-label="Command bar" onClick={() => setCmdOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(8,20,22,0.45)', zIndex: 200,
            display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '12vh 16px 16px' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(560px, 100%)', background: C.card, borderRadius: 14,
            border: `1px solid ${C.border}`, boxShadow: '0 16px 48px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', borderBottom: `1px solid ${C.border}` }}>
              <Search size={18} color={C.textMuted} aria-hidden="true" />
              <input ref={cmdInput} value={query} aria-label="Search pages"
                onChange={e => { setQuery(e.target.value); setCursor(0) }}
                onKeyDown={e => {
                  if (e.key === 'Escape') setCmdOpen(false)
                  else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c + 1, results.length - 1)) }
                  else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c - 1, 0)) }
                  else if (e.key === 'Enter' && results[cursor]) go(results[cursor].href)
                }}
                placeholder="Jump to a page…"
                style={{ flex: 1, height: 52, border: 'none', outline: 'none', background: 'none', fontSize: 15, color: C.text, fontFamily: 'inherit' }} />
              <kbd style={{ fontSize: 11, padding: '3px 7px', borderRadius: 6, background: C.bgAlt, color: C.textSub, fontFamily: 'inherit' }}>Esc</kbd>
            </div>
            <div role="listbox" aria-label="Pages" style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }}>
              {results.length === 0 && <div style={{ padding: 16, fontSize: 13, color: C.textMuted }}>No matching page.</div>}
              {results.map((r, i) => (
                <button key={r.href} type="button" role="option" aria-selected={i === cursor}
                  onMouseEnter={() => setCursor(i)} onClick={() => go(r.href)}
                  style={{ width: '100%', textAlign: 'left', height: 42, padding: '0 12px', borderRadius: 10, border: 'none',
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
                    background: i === cursor ? C.accentLight : 'transparent', color: i === cursor ? C.accent : C.text,
                    fontWeight: i === cursor ? 700 : 500 }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
