'use client'
import { ReactNode, useEffect, useState, useCallback } from 'react'
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext'
import { AdminProvider, useAdmin } from '@/contexts/AdminContext'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { usePathname } from 'next/navigation'

function ShellLayout({ children }: { children: ReactNode }) {
  const { theme: C } = useTheme()
  const { accessDenied, crewOnly, patientOnly, loading, signOut } = useAdmin()
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
        justifyContent: 'center', padding: 24, fontFamily: "'DM Sans', system-ui, sans-serif" }}>
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
      fontFamily: "'DM Sans', system-ui, sans-serif", transition: 'background .4s' }}>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 49,
            backdropFilter: 'blur(2px)' }}
        />
      )}

      <Sidebar mobileOpen={sidebarOpen} onClose={closeSidebar} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'hidden' }}>
        <TopBar onMenuToggle={toggleSidebar} />
        <main style={{ flex: 1, padding: 'clamp(12px, 3vw, 28px) clamp(12px, 3vw, 32px)',
          overflowY: 'auto', background: C.bg, transition: 'background .4s' }}>
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
