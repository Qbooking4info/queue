'use client'
import { useActionState, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Stethoscope } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { addStaff } from '../actions'

const CREW_ROLES = ['driver', 'emt', 'paramedic', 'nurse', 'doctor', 'dispatcher']
const CREW_TIERS = ['PTS', 'BLS', 'ALS', 'CCT']

export default function AddStaffPage() {
  const { theme: C } = useTheme()
  const [state, action, pending] = useActionState(addStaff, null)
  const [role, setRole] = useState('admin')

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`,
    borderRadius: 10, padding: '9px 12px', fontSize: 13, color: C.text,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  return (
    <div style={{ padding: 24, maxWidth: 560, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <Link href="/dashboard/staff" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.textMuted, fontSize: 13, textDecoration: 'none' }}>
          <ArrowLeft size={14} /> Staff
        </Link>
        <span style={{ color: C.textMuted }}>/</span>
        <span style={{ fontSize: 13, color: C.text }}>Add Staff</span>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: C.text }}>Add Staff</h1>
      <p style={{ fontSize: 13, color: C.textSub, marginBottom: 32 }}>
        Grant another person access to this hospital portal, or add someone to your ambulance crew.
      </p>

      {/* Auto-generated login notes */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: C.blueLight, border: `1px solid ${C.blue}33`, borderRadius: 12, padding: 12 }}>
          <Stethoscope size={18} color={C.blue} style={{ flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: C.blue, lineHeight: 1.6 }}>
            <span style={{ fontWeight: 600 }}>Specialist logins are auto-created when you add a doctor</span> — go to{' '}
            <Link href="/dashboard/doctors/add" style={{ textDecoration: 'underline' }}>Add Doctor</Link> to register a new specialist under this hospital.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, background: C.amberLight, border: `1px solid ${C.amber}33`, borderRadius: 12, padding: 12 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2" style={{ flexShrink: 0 }}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <p style={{ fontSize: 12, color: C.amber, lineHeight: 1.6 }}>
            <span style={{ fontWeight: 600 }}>Front Desk login was auto-created at signup</span> — find the credentials on the{' '}
            <Link href="/dashboard/staff" style={{ textDecoration: 'underline' }}>Staff page</Link>.
          </p>
        </div>
      </div>

      {state?.error && (
        <div style={{ marginBottom: 24, padding: 16, borderRadius: 16, border: `1px solid ${C.red}4d`, background: C.redLight, fontSize: 13, color: C.red }}>
          {state.error}
        </div>
      )}

      <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <label style={labelStyle}>Role *</label>
          <select name="role" value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
            <option value="admin">Admin</option>
            <option value="ambulance_crew">Ambulance Crew</option>
          </select>
        </div>

        <div>
          <label style={labelStyle}>Email Address *</label>
          <input
            name="email" type="email" required
            placeholder={role === 'ambulance_crew' ? 'crew@hospital.com' : 'admin@hospital.com'}
            style={inputStyle}
          />
          <p style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>
            An invite email will be sent if they don&apos;t have an account yet.
          </p>
        </div>

        {role === 'ambulance_crew' && (
          <>
            <div>
              <label style={labelStyle}>Crew Role *</label>
              <select name="crew_role" required defaultValue="" style={inputStyle}>
                <option value="" disabled>Select a role</option>
                {CREW_ROLES.map(r => (
                  <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Care Tier *</label>
              <select name="crew_tier" required defaultValue="" style={inputStyle}>
                <option value="" disabled>Select a tier</option>
                {CREW_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <p style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>
                Determines which triage levels this crew member can be dispatched for.
              </p>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
          <Link href="/dashboard/staff"
            style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 12, border: `1px solid ${C.borderMed}`, fontSize: 13, color: C.textSub, textDecoration: 'none' }}>
            Cancel
          </Link>
          <button type="submit" disabled={pending}
            style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1, fontFamily: 'inherit' }}>
            {pending ? 'Sending Invite…' : 'Send Invite'}
          </button>
        </div>
      </form>
    </div>
  )
}
