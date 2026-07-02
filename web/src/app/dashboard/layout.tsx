import { DashboardShell } from '@/components/dashboard/Shell'
import type { ReactNode } from 'react'

// Auth is enforced by middleware (proxy.ts) — no server-side Supabase client here.
// AdminContext handles user/role loading client-side after the shell renders.
export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>
}
