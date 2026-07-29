'use client'
import { useActionState, useState } from 'react'
import { Check } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { setupFrontDeskLogin } from './actions'

export default function FrontDeskSetup() {
  const { theme: C } = useTheme()
  const [result, action, pending] = useActionState(setupFrontDeskLogin, null)
  const [copied, setCopied] = useState<'email' | 'password' | null>(null)

  async function copy(text: string, field: 'email' | 'password') {
    await navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  const creds = result && 'email' in result ? result : null
  const err   = result && 'error' in result ? result.error : null

  if (creds) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.amber}33`, borderRadius: 16, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="2" style={{ flexShrink: 0 }}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: C.text }}>Front Desk Login Ready</div>
            <div style={{ fontSize: 12, color: C.textSub }}>Share these credentials with your front desk staff.</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {[{ label: 'Email', value: creds.email, field: 'email' as const }, { label: 'Password', value: creds.password, field: 'password' as const }].map(r => (
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
        <p style={{ fontSize: 10, color: C.amber }}>Password will not be shown again — save it now.</p>
      </div>
    )
  }

  return (
    <div style={{ background: C.redLight, border: `1px solid ${C.red}33`, borderRadius: 16, padding: 16, marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.amber} strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: C.red, marginBottom: 4 }}>No Front Desk Account Found</div>
        <div style={{ fontSize: 12, color: C.textSub, marginBottom: 12 }}>
          The front desk login was not created during signup. Create it now to give your front desk staff access.
        </div>
        {err && <p style={{ fontSize: 12, color: C.red, marginBottom: 8 }}>{err}</p>}
        <form action={action}>
          <button type="submit" disabled={pending}
            style={{ padding: '8px 16px', background: C.accent, color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 12, border: 'none', cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1, fontFamily: 'inherit' }}>
            {pending ? 'Creating…' : 'Create Front Desk Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
