'use client'
import { ReactNode } from 'react'
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext'
import { AdminProvider } from '@/contexts/AdminContext'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

function ShellLayout({ children }: { children: ReactNode }) {
  const { theme: C } = useTheme()
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
