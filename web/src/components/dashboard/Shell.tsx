'use client'
import { ReactNode, useEffect } from 'react'
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext'
import { AdminProvider, useAdmin } from '@/contexts/AdminContext'
import { createClient } from '@/lib/supabase/client'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

function ShellLayout({ children }: { children: ReactNode }) {
  const { theme: C } = useTheme()
  const { accessDenied, loading } = useAdmin()

  useEffect(() => {
    if (!loading && accessDenied) {
      createClient().auth.signOut().finally(() => {
        window.location.href = '/login'
      })
    }
  }, [loading, accessDenied])

  if (!loading && accessDenied) return null

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
