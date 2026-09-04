'use client'
import { useActionState, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Stethoscope, Check } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import { addStaff, addCrewMember } from '../actions'

const CREW_ROLES = ['driver', 'emt', 'paramedic', 'nurse', 'doctor', 'dispatcher']
const CREW_TIERS = ['PTS', 'BLS', 'ALS', 'CCT']

export default function AddStaffPage() {
  const { theme: C } = useTheme()
  const [role, setRole] = useState<'admin' | 'ambulance_crew'>('admin')

  const [adminState, adminAction, adminPending] = useActionState(addStaff, null)
  const [crewState, crewAction, crewPending] = useActionState(addCrewMember, null)
  const [copied, setCopied] = useState<'email' | 'password' | null>(null)

  async function copy(text: string, field: 'email' | 'password') {
    await navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: C.textMuted, display: 'block',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.05em',
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`,
    borderRadius: 10, padding: '9px 12px', fontSize: 13, color: C.text,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  const crewCreds = crewState && 'email' in crewState ? crewState : null
  const crewErr   = crewState && 'error' in crewState ? crewState.error : null

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
            <span style={{ fontWeight: 600 }}>Doctors use their own account</span> — go to{' '}
            <Link href="/dashboard/doctors" style={{ textDecoration: 'underline' }}>Doctors</Link> and link one to this hospital using their Doctor ID.
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

      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Role *</label>
        <select value={role} onChange={e => setRole(e.target.value as 'admin' | 'ambulance_crew')} style={inputStyle}>
          <option value="admin">Admin</option>
          <option value="ambulance_crew">Ambulance Crew</option>
        </select>
      </div>

      {role === 'admin' && (
        <>
          {adminState?.error && (
            <div style={{ marginBottom: 24, padding: 16, borderRadius: 16, border: `1px solid ${C.red}4d`, background: C.redLight, fontSize: 13, color: C.red }}>
              {adminState.error}
            </div>
          )}
          <form action={adminAction} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <input type="hidden" name="role" value="admin" />
            <div>
              <label style={labelStyle}>Email Address *</label>
              <input name="email" type="email" required placeholder="admin@hospital.com" style={inputStyle} />
              <p style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>
                An invite email will be sent if they don&apos;t have an account yet.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
              <Link href="/dashboard/staff"
                style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 12, border: `1px solid ${C.borderMed}`, fontSize: 13, color: C.textSub, textDecoration: 'none' }}>
                Cancel
              </Link>
              <Button type="submit" loading={adminPending} className="flex-1">Send Invite</Button>
            </div>
          </form>
        </>
      )}

      {role === 'ambulance_crew' && (
        <>
          {crewCreds ? (
            <div style={{ background: C.card, border: `1px solid ${C.amber}33`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>Crew Login Ready</div>
                <div style={{ fontSize: 12, color: C.textSub }}>Share these credentials with the crew member.</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                {[{ label: 'Email', value: crewCreds.email, field: 'email' as const }, { label: 'Password', value: crewCreds.password, field: 'password' as const }].map(r => (
                  <div key={r.field} style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 10, color: C.textMuted }}>{r.label}</div>
                      <div style={{ fontSize: 12, fontFamily: 'monospace', color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.value}</div>
                    </div>
                    <button onClick={() => copy(r.value, r.field)}
                      style={{ display: 'inline-flex', alignItems: 'center', fontSize: 10, color: C.textSub, flexShrink: 0, padding: '2px 6px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {copied === r.field ? <Check size={11} /> : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 10, color: C.amber, marginBottom: 16 }}>Password will not be shown again — save it now.</p>
              <Link href="/dashboard/staff"
                style={{ display: 'inline-block', padding: '9px 16px', borderRadius: 10, border: `1px solid ${C.borderMed}`, fontSize: 13, color: C.text, textDecoration: 'none' }}>
                Back to Staff
              </Link>
            </div>
          ) : (
            <>
              {crewErr && (
                <div style={{ marginBottom: 24, padding: 16, borderRadius: 16, border: `1px solid ${C.red}4d`, background: C.redLight, fontSize: 13, color: C.red }}>
                  {crewErr}
                </div>
              )}
              <form action={crewAction} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                <div>
                  <label style={labelStyle}>Full Name *</label>
                  <input name="full_name" required placeholder="e.g. Chidi Nwosu" style={inputStyle} />
                  <p style={{ fontSize: 12, color: C.textMuted, marginTop: 6 }}>
                    A portal login will be generated automatically — crew members don&apos;t need an existing email address.
                  </p>
                </div>
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
                <div style={{ display: 'flex', gap: 12, paddingTop: 8 }}>
                  <Link href="/dashboard/staff"
                    style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 12, border: `1px solid ${C.borderMed}`, fontSize: 13, color: C.textSub, textDecoration: 'none' }}>
                    Cancel
                  </Link>
                  <Button type="submit" loading={crewPending} className="flex-1">Create Crew Login</Button>
                </div>
              </form>
            </>
          )}
        </>
      )}
    </div>
  )
}
