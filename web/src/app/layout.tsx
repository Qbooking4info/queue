import type { Metadata } from 'next'
import { DM_Sans } from 'next/font/google'
import './globals.css'

const dmSans = DM_Sans({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Queue — Hospital Dashboard',
  description: 'Manage your hospital appointments, doctors, and patient queue',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full`}>
      <body className="min-h-full bg-[#0A0F0D] text-[#F0F5F2] antialiased">
        {children}
      </body>
    </html>
  )
}
