'use client'
import Link from 'next/link'
import { Settings, Stethoscope, Headset, Ambulance } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { removeStaff } from './actions'
import CredentialsBadge from './CredentialsBadge'
import FrontDeskSetup from './FrontDeskSetup'

interface StaffMember {
  id: string
  role: string
  user_id: string
  users: { id: string; full_name: string; email: string } | { id: string; full_name: string; email: string }[] | null
}

const ROLE_COLOR: Record<string, 'accent' | 'blue' | 'amber' | 'red'> = {
  admin:          'accent',
  specialist:     'blue',
  front_desk:     'amber',
  ambulance_crew: 'red',
}

const ROLE_LABEL: Record<string, string> = {
  admin:          'Admin',
  specialist:     'Specialist',
  front_desk:     'Front Desk',
  ambulance_crew: 'Ambulance Crew',
}

const ROLE_GUIDE = [
  { role: 'Admin',          icon: Settings,    desc: 'Full access — manage settings, doctors, staff, and all appointments' },
  { role: 'Specialist',     icon: Stethoscope, desc: 'View own schedule, add diagnosis and notes to patient appointments' },
  { role: 'Front Desk',     icon: Headset,     desc: 'Manage the patient queue — confirm, check-in, and track appointments' },
  { role: 'Ambulance Crew', icon: Ambulance,   desc: 'Work fleet shifts — accept dispatch offers and update job status from the mobile app' },
]

export function StaffList({ staff, hasFrontDesk, profileId }: {
  staff: StaffMember[]
  hasFrontDesk: boolean
  profileId: string
}) {
  const { theme: C } = useTheme()

  function colorFor(role: string) {
    const key = ROLE_COLOR[role] ?? 'accent'
    return { text: C[key], bg: `${C[key]}1a`, border: `${C[key]}33` }
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text }}>Staff</h1>
          <p style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>Manage who has access to your hospital portal</p>
        </div>
        <Link href="/dashboard/staff/add"
          style={{ padding: '10px 16px', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, borderRadius: 12, textDecoration: 'none' }}>
          + Add Staff
        </Link>
      </div>

      {!hasFrontDesk && <FrontDeskSetup />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {staff.map(member => {
          const user = Array.isArray(member.users) ? member.users[0] : member.users
          const isSelf = member.user_id === profileId
          const isSystemAccount = (member.role === 'specialist' || member.role === 'front_desk' || member.role === 'ambulance_crew')
          const isAmbulanceCrew = member.role === 'ambulance_crew'
          const roleColor = colorFor(member.role ?? '')

          return (
            <div key={member.id} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 40, height: 40, borderRadius: 12, background: C.bgAlt, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: C.textSub, flexShrink: 0 }}>
                  {user?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2) ?? '?'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>
                    {user?.full_name ?? '—'} {isSelf && <span style={{ fontSize: 11, color: C.textMuted }}>(you)</span>}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{user?.email}</div>
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, border: `1px solid ${roleColor.border}`, background: roleColor.bg, color: roleColor.text, flexShrink: 0 }}>
                  {ROLE_LABEL[member.role ?? ''] ?? member.role}
                </span>
                {!isSelf && (
                  <form action={removeStaff}>
                    <input type="hidden" name="staff_id" value={member.id} />
                    <button type="submit"
                      style={{ fontSize: 11, color: C.red, padding: '4px 10px', borderRadius: 8, border: '1px solid transparent', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                      Remove
                    </button>
                  </form>
                )}
              </div>
              {isSystemAccount && user?.id && (
                <CredentialsBadge userId={user.id} email={user.email} />
              )}
              {isAmbulanceCrew && (
                <Link href="/dashboard/ambulances/fleet" style={{ fontSize: 12, color: C.textMuted, marginTop: 8, display: 'inline-block', textDecoration: 'none' }}>
                  Manage shifts &rarr;
                </Link>
              )}
            </div>
          )
        })}
      </div>

      {/* Role guide */}
      <div style={{ marginTop: 32, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
        {ROLE_GUIDE.map(r => (
          <div key={r.role} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 16 }}>
            <div style={{ marginBottom: 8, color: C.textSub }}><r.icon size={20} /></div>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4, color: C.text }}>{r.role}</div>
            <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>{r.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
