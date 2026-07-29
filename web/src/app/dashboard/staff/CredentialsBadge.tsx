'use client'
import { useActionState, useState } from 'react'
import { Check } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'
import { resetStaffPassword } from './actions'

interface Props {
  userId: string
  email: string
}

export default function CredentialsBadge({ userId, email }: Props) {
  const { theme: C } = useTheme()
  const [result, action, pending] = useActionState(resetStaffPassword, null)
  const [copied, setCopied] = useState<'email' | 'password' | null>(null)
  const [open, setOpen] = useState(false)

  async function copy(text: string, field: 'email' | 'password') {
    await navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  const creds = result && 'email' in result ? result : null
  const err   = result && 'error' in result ? result.error : null

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ fontSize: 11, color: C.textSub, padding: '4px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>
        View Login
      </button>
    )
  }

  return (
    <div style={{ width: '100%', marginTop: 12, background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Email row — always visible */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2 }}>Login Email</div>
          <div style={{ fontSize: 12, fontFamily: 'monospace', color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</div>
        </div>
        <button onClick={() => copy(email, 'email')}
          style={{ fontSize: 10, color: C.textSub, flexShrink: 0, padding: '2px 6px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
          {copied === 'email' ? <Check size={11} style={{ display: 'inline' }} /> : 'Copy'}
        </button>
      </div>

      {/* Password row — only after reset */}
      {creds && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2 }}>New Password</div>
            <div style={{ fontSize: 12, fontFamily: 'monospace', color: C.text, letterSpacing: '.1em' }}>{creds.password}</div>
          </div>
          <button onClick={() => copy(creds.password, 'password')}
            style={{ fontSize: 10, color: C.textSub, flexShrink: 0, padding: '2px 6px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
            {copied === 'password' ? <Check size={11} style={{ display: 'inline' }} /> : 'Copy'}
          </button>
        </div>
      )}

      {err && <p style={{ fontSize: 10, color: C.red }}>{err}</p>}

      <form action={action} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <input type="hidden" name="user_id" value={userId} />
        <button type="submit" disabled={pending}
          style={{ fontSize: 10, color: C.amber, border: 'none', background: 'transparent', cursor: pending ? 'not-allowed' : 'pointer', opacity: pending ? 0.6 : 1, fontFamily: 'inherit' }}>
          {pending ? 'Resetting…' : creds ? 'Reset Again' : 'Reset Password'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          style={{ fontSize: 10, color: C.textMuted, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>
          Hide
        </button>
      </form>
    </div>
  )
}
