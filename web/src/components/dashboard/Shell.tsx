'use client'
import { ReactNode, useEffect, useState, useCallback } from 'react'
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext'
import { AdminProvider, useAdmin } from '@/contexts/AdminContext'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useInboundAmbulances } from '@/lib/useInboundAmbulances'
import { useUnreadMessages } from '@/lib/useUnreadMessages'

function ShellLayout({ children }: { children: ReactNode }) {
  const { theme: C } = useTheme()
  const { accessDenied, crewOnly, patientOnly, loading, signOut, hospital, role } = useAdmin()
  // Hospital admins and front desk see inbound ambulances; same roles GET /api/ambulances allows.
  const inbound = useInboundAmbulances(hospital?.id, role === 'hospital_admin' || role === 'front_desk')
  const top = inbound[0]
  const unreadMessages = useUnreadMessages(['hospital_admin', 'clinic_admin', 'front_desk'].includes(role ?? ''))
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  // Close sidebar on navigation
  useEffect(() => { setSidebarOpen(false) }, [pathname])

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const toggleSidebar = useCallback(() => setSidebarOpen(o => !o), [])

  useEffect(() => {
    if (!loading && accessDenied) {
      createClient().auth.signOut().finally(() => {
        window.location.href = '/login'
      })
    }
  }, [loading, accessDenied])

  if (!loading && accessDenied) return null

  // A crew or patient account signing in on the web is not an error and not an
  // intruder — it is someone using the wrong surface. Say so, instead of bouncing
  // them to /login where a wrong password looks exactly the same.
  if (!loading && (crewOnly || patientOnly)) {
    const copy = crewOnly
      ? {
          icon: '🚑',
          body: 'Your sign-in worked. Ambulance crew jobs — going on duty, receiving dispatch '
            + 'offers and updating a run — all happen in the mobile app. There is no crew '
            + 'view in this dashboard.',
        }
      : {
          icon: '🩺',
          body: 'Your sign-in worked. This looks like a patient account — booking and managing '
            + 'appointments happens in the Queue mobile app. There is no patient view in this '
            + 'dashboard.',
        }
    return (
      <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: 24, fontFamily: "var(--font-jakarta), system-ui, sans-serif" }}>
        <div style={{ maxWidth: 420, textAlign: 'center', background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 16, padding: '32px 28px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>{copy.icon}</div>
          <h1 style={{ fontSize: 19, fontWeight: 800, color: C.text, margin: '0 0 10px' }}>
            Use the Queue mobile app
          </h1>
          <p style={{ fontSize: 14, lineHeight: 1.55, color: C.textSub, margin: '0 0 22px' }}>
            {copy.body}
          </p>
          <button onClick={signOut}
            style={{ background: C.accent, color: '#fff', border: 'none', borderRadius: 10,
              padding: '10px 22px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg,
      fontFamily: "var(--font-jakarta), system-ui, sans-serif", transition: 'background .4s' }}>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 49,
            backdropFilter: 'blur(2px)' }}
        />
      )}

      <Sidebar mobileOpen={sidebarOpen} onClose={closeSidebar} inboundCount={inbound.length} unreadMessages={unreadMessages} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'hidden' }}>
        <TopBar onMenuToggle={toggleSidebar} />
        <main style={{ flex: 1, padding: '4px clamp(16px, 3vw, 36px) 28px',
          overflowY: 'auto', background: C.bg }}>
          {/* v3.1: the most urgent inbound ambulance, on every page, until the hospital receives it. */}
          {top && !pathname.startsWith('/dashboard/ambulances') && (() => {
            const unit = Array.isArray(top.unit) ? top.unit[0] : top.unit
            const mins = top.eta_seconds != null ? Math.max(1, Math.round(top.eta_seconds / 60)) : null
            const when = top.status === 'arrived_at_destination' ? 'arrived' : mins != null ? `${mins} min` : 'en route'
            return (
              <div role="alert" style={{ borderRadius: 14, background: C.redLight, padding: '12px 16px', marginBottom: 18,
                display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', color: C.id === 'forest' ? '#FECACA' : '#7F1D1D' }}>
                <b style={{ fontSize: 14 }}>Inbound ambulance · {when}</b>
                <span style={{ fontSize: 14, flex: '1 1 240px' }}>
                  {[top.triage_level != null && top.triage_level <= 2 ? 'Top priority' : top.triage_level != null ? `Triage ${top.triage_level}` : null,
                    top.symptom_description, unit?.call_sign ?? unit?.plate_number,
                    inbound.length > 1 ? `+${inbound.length - 1} more` : null].filter(Boolean).join(' · ')}
                </span>
                <Link href="/dashboard/ambulances" style={{ height: 40, padding: '0 14px', borderRadius: 10, background: C.red,
                  color: C.id === 'forest' ? '#450A0A' : '#FFFFFF', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                  Open ambulance desk
                </Link>
              </div>
            )
          })()}
          {children}
        </main>
      </div>
    </div>
  )
}

export function DashboardShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <AdminProvider>
        <ShellLayout>{children}</ShellLayout>
      </AdminProvider>
    </ThemeProvider>
  )
}
