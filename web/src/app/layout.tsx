import type { Metadata } from 'next'
import { Plus_Jakarta_Sans } from 'next/font/google'
import './globals.css'

const dmSans = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta', weight: ['400','500','600','700','800'] })

export const metadata: Metadata = {
  title: 'Queue — Hospital Dashboard',
  description: 'Manage your hospital appointments, doctors, and patient queue',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full`}>
      <body className="min-h-full bg-[var(--background)] text-[var(--foreground)] antialiased">
        {children}
      </body>
    </html>
  )
}
