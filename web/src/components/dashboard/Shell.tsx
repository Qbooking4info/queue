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
  const { accessDenied, loading } = useAdmin()
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
        <main style={{ flex: 1, padding: 'clamp(16px, 4vw, 28px) clamp(16px, 4vw, 32px)',
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
