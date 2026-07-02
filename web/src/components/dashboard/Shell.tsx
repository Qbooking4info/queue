'use client'
import { ReactNode } from 'react'
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext'
import { AdminProvider, useAdmin } from '@/contexts/AdminContext'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

function ShellLayout({ children }: { children: ReactNode }) {
  const { theme: C } = useTheme()
  const { accessDenied, loading } = useAdmin()

  if (!loading && accessDenied) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: C.bg,
        fontFamily: "'DM Sans', system-ui, sans-serif",
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 48 }}>🚫</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: C.text }}>Access Denied</div>
        <div style={{ fontSize: 14, color: C.textMuted, textAlign: 'center', maxWidth: 360 }}>
          Your account doesn't have access to the hospital portal. Contact your hospital administrator to be assigned a role.
        </div>
        <a href="/login" style={{ marginTop: 8, padding: '10px 24px', borderRadius: 10,
          background: C.accentMid, color: C.accent, fontWeight: 700, fontSize: 14,
          textDecoration: 'none', border: `1px solid ${C.accentBorder}` }}>
          Back to Login
        </a>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg,
      fontFamily: "'DM Sans', system-ui, sans-serif", transition: 'background .4s' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflowX: 'hidden' }}>
        <TopBar />
        <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', background: C.bg, transition: 'background .4s' }}>
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
