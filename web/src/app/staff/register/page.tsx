'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Building2, AlertTriangle, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'
import type { Theme } from '@/contexts/ThemeContext'

// Form panels below are now theme-reactive (see login/page.tsx, fixed alongside this --
// identical hardcoded-clinical-values bug, plus inputStyle lived at module scope here,
// which useTheme() -- a hook -- can't reach; moved inside the component). LeftPanel
// stays fixed dark brand chrome on purpose, same as mobile's SplashScreen.
function inputStyleFor(C: Theme) {
  return (focused: boolean): React.CSSProperties => ({
    width: '100%', background: C.card, border: `1.5px solid ${focused ? C.accent : C.border}`,
    borderRadius: 10, padding: '12px 14px', fontSize: 14, color: C.text,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', transition: 'border-color .15s',
  })
}

function LeftPanel() {
  return (
    <div className="auth-branding-panel" style={{ width: 420, flexShrink: 0, background: '#061208', display: 'flex',
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
          Create your<br />staff account.
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>
          Register your account and ask your hospital admin to grant you portal access from the Staff page.
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
        © {new Date().getFullYear()} Queue Health Technologies
      </div>
    </div>
  )
}

export default function StaffRegisterPage() {
  const router   = useRouter()
  const supabase = createClient()
  const { theme: C } = useTheme()
  const inputStyle = inputStyleFor(C)

  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [done, setDone]         = useState(false)

  const [nameFocus, setNameFocus]   = useState(false)
  const [emailFocus, setEmailFocus] = useState(false)
  const [passFocus, setPassFocus]   = useState(false)
  const [confFocus, setConfFocus]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) { setError('Please enter your full name.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)

    try {
      const { data: authData, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(), password,
        options: { data: { full_name: fullName.trim() } },
      })
      if (signUpErr) { setError(signUpErr.message); setLoading(false); return }
      if (!authData.user) { setError('Account creation failed. Please try again.'); setLoading(false); return }

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(), password,
      })
      if (signInErr) {
        setError('Please check your email and confirm your address, then sign in.')
        setLoading(false); return
      }

      const { error: profileErr } = await supabase.from('users').insert({
        auth_id: authData.user.id, full_name: fullName.trim(), email: email.trim().toLowerCase(),
      } as never)
      if (profileErr) { setError(profileErr.message); setLoading(false); return }

      const { data: profile } = await supabase.from('users').select('id').eq('auth_id', authData.user.id).single()
      if (profile) {
        const { data: adminRecord } = await supabase.from('hospital_admins').select('role').eq('user_id', profile.id).single()
        if (adminRecord) { router.push('/dashboard'); return }
      }

      setDone(true)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <LeftPanel />
        <div style={{ flex: 1, background: C.bg, display: 'flex', alignItems: 'center',
          justifyContent: 'center', padding: '40px 24px' }}>
          <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 64, height: 64, borderRadius: 20, background: C.accentLight,
              border: `1px solid ${C.accentBorder}`, marginBottom: 24 }}>
              <CheckCircle2 size={32} style={{ color: C.accent }} />
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.text, marginBottom: 12 }}>Account Created</div>
            <p style={{ fontSize: 14, color: C.textSub, lineHeight: 1.7, marginBottom: 24 }}>
              Your staff account has been created. Ask your hospital admin to grant you portal access — they&rsquo;ll add your email from the Staff page.
            </p>
            <p style={{ fontSize: 13, color: C.textSub }}>
              Once access is granted,{' '}
              <Link href="/login" style={{ color: C.accent, fontWeight: 600 }}>sign in here</Link>.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <LeftPanel />
      <div style={{ flex: 1, background: C.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56,
            borderRadius: 16, background: C.accentLight, border: `1px solid ${C.accentBorder}`, marginBottom: 24 }}>
            <Building2 size={24} style={{ color: C.accent }} />
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-.04em', marginBottom: 6 }}>
            Staff Registration
          </div>
          <div style={{ fontSize: 13, color: C.textSub, marginBottom: 28 }}>
            Create your hospital portal account.
          </div>

          {error && (
            <div style={{ background: C.redLight, border: `1px solid ${C.red}66`, borderRadius: 8,
              padding: '10px 14px', fontSize: 13, color: C.red,
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
              <AlertTriangle size={14} /> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSub,
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Full Name *</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="Dr. Amaka Okafor" required
                onFocus={() => setNameFocus(true)} onBlur={() => setNameFocus(false)}
                style={inputStyle(nameFocus)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSub,
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Work Email *</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@hospital.com" required
                onFocus={() => setEmailFocus(true)} onBlur={() => setEmailFocus(false)}
                style={inputStyle(emailFocus)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSub,
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Password *</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Min. 8 characters" required minLength={8}
                onFocus={() => setPassFocus(true)} onBlur={() => setPassFocus(false)}
                style={inputStyle(passFocus)} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSub,
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>Confirm Password *</label>
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                placeholder="Repeat password" required
                onFocus={() => setConfFocus(true)} onBlur={() => setConfFocus(false)}
                style={inputStyle(confFocus)} />
            </div>

            <Button type="submit" loading={loading} size="lg" className="w-full mt-1">
              Create Staff Account {!loading && <ArrowRight size={15} />}
            </Button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: C.textSub }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: C.accent, fontWeight: 600 }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
