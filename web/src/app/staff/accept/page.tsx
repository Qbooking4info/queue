'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowRight, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const inputStyle = (focused: boolean): React.CSSProperties => ({
  width: '100%', background: '#FFFFFF', border: `1.5px solid ${focused ? '#1A7FC1' : '#DDE8F5'}`,
  borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#0C2A4A',
  outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color .15s',
})

function LeftPanel() {
  return (
    <div style={{ width: 420, flexShrink: 0, background: '#061208', display: 'flex',
      flexDirection: 'column', justifyContent: 'space-between', padding: '48px 40px',
      position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -80, left: -80, width: 320, height: 320,
        borderRadius: '50%', background: 'rgba(0,232,122,0.04)', filter: 'blur(60px)', pointerEvents: 'none' }} />
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 56 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(0,232,122,0.1)',
            border: '1px solid rgba(0,232,122,0.28)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 40 40" fill="none">
              <rect x="6" y="8" width="28" height="24" rx="6" stroke="#00E87A" strokeWidth="2.5"/>
              <line x1="13" y1="16" x2="27" y2="16" stroke="#00E87A" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="13" y1="20" x2="22" y2="20" stroke="#00E87A" strokeWidth="2.5" strokeLinecap="round"/>
              <circle cx="30" cy="30" r="8" fill="#061208" stroke="#00E87A" strokeWidth="2.5"/>
              <line x1="30" y1="26.5" x2="30" y2="30" stroke="#00E87A" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="30" cy="31.5" r="1" fill="#00E87A"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-.03em' }}>Queue</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Hospital Portal</div>
          </div>
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-.04em', lineHeight: 1.25, marginBottom: 12 }}>
          You&rsquo;ve been<br />invited to Queue.
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>
          Set your name and password to activate your staff account and access the hospital portal.
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
        © {new Date().getFullYear()} Queue Health Technologies
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  const router   = useRouter()
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError]       = useState('')
  const [email, setEmail]       = useState('')

  const [nameFocus, setNameFocus] = useState(false)
  const [passFocus, setPassFocus] = useState(false)
  const [confFocus, setConfFocus] = useState(false)

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setEmail(session.user.email ?? '')
        await checkExistingProfile(session.user.id)
        return
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, sess) => {
        if (sess) {
          subscription.unsubscribe()
          setEmail(sess.user.email ?? '')
          await checkExistingProfile(sess.user.id)
        }
      })

      const timeout = setTimeout(() => {
        setError('This invite link is invalid or has expired. Ask your admin to resend it.')
        setChecking(false)
      }, 5000)

      return () => { subscription.unsubscribe(); clearTimeout(timeout) }
    }
    init()
  }, [])

  async function checkExistingProfile(authId: string) {
    const { data: profile } = await supabase.from('users').select('id, full_name').eq('auth_id', authId).single()
    if (profile?.full_name && profile.full_name !== 'Invited Staff') { router.push('/dashboard'); return }
    if (profile?.full_name === 'Invited Staff') setFullName('')
    setChecking(false)
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setError('Please enter your name.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setError('Session expired. Please use the invite link again.'); setLoading(false); return }

      const { error: upsertErr } = await supabase.from('users').upsert({
        auth_id: user.id, full_name: fullName.trim(), email: user.email ?? email,
      } as never, { onConflict: 'auth_id' })
      if (upsertErr) { setError(upsertErr.message); setLoading(false); return }

      const { error: pwErr } = await supabase.auth.updateUser({ password })
      if (pwErr) { setError(pwErr.message); setLoading(false); return }

      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <LeftPanel />
        <div style={{ flex: 1, background: '#F4F8FC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 14, color: '#6A8FAA' }}>Setting up your account…</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <LeftPanel />
      <div style={{ flex: 1, background: '#F4F8FC', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56,
            borderRadius: 16, background: '#EAF4FC', border: '1px solid rgba(26,127,193,0.2)', marginBottom: 24 }}>
            <Sparkles size={24} style={{ color: '#1A7FC1' }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0C2A4A', letterSpacing: '-.04em', marginBottom: 4 }}>
            Welcome to Queue
          </div>
          <div style={{ fontSize: 13, color: '#6A8FAA', marginBottom: 4 }}>
            Set your name and password to access the portal.
          </div>
          {email && <div style={{ fontSize: 12, color: '#6A8FAA', marginBottom: 28 }}>{email}</div>}

          {error && (
            <div style={{ background: '#FEF0F0', border: '1px solid #F5C6C6', borderRadius: 8,
              padding: '10px 14px', fontSize: 13, color: '#E03E3E',
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <form onSubmit={handleComplete} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#2A5070',
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Full Name *</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="Dr. Amaka Okafor" required autoFocus
                onFocus={() => setNameFocus(true)} onBlur={() => setNameFocus(false)}
                style={inputStyle(nameFocus)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#2A5070',
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Set Password *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters" required
                onFocus={() => setPassFocus(true)} onBlur={() => setPassFocus(false)}
                style={inputStyle(passFocus)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#2A5070',
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Confirm Password *</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat password" required
                onFocus={() => setConfFocus(true)} onBlur={() => setConfFocus(false)}
                style={inputStyle(confFocus)} />
            </div>

            <button type="submit" disabled={loading}
              style={{ width: '100%', background: '#1A7FC1', color: '#FFFFFF', border: 'none',
                borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
                fontFamily: 'inherit', marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {loading ? 'Saving…' : <>Go to Dashboard <ArrowRight size={15} /></>}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
