'use client'
import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, Stethoscope, BarChart3, Bell, Check, Eye, EyeOff, AlertTriangle, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useTheme } from '@/contexts/ThemeContext'
import { Button } from '@/components/ui/button'

function LoginContent() {
  const router         = useRouter()
  const searchParams   = useSearchParams()
  const justRegistered = searchParams.get('registered') === 'true'
  const { theme: C }   = useTheme()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [showPass, setShowPass] = useState(false)
  const [emailFocus, setEmailFocus] = useState(false)
  const [passFocus,  setPassFocus]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const supabase = createClient()
      // Clear any existing session first so old account data doesn't bleed through
      await supabase.auth.signOut()
      const { error: authErr } = await supabase.auth.signInWithPassword({ email, password })
      if (authErr) { setError(authErr.message); setLoading(false); return }
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  // Form panel below is now theme-reactive -- it used to hardcode clinical's exact
  // values (which is why it looked fine to begin with) but never actually read
  // useTheme(), so a returning user who'd switched their dashboard to forest saw their
  // own login screen revert to light regardless. The left branding panel is left as
  // fixed dark brand chrome on purpose, same as mobile's SplashScreen -- pre-login,
  // there's no dashboard preference to honor yet, and its white-on-dark internals
  // (like the splash) aren't designed to flip to dark-on-light.
  const inputStyle = (focused: boolean) => ({
    width: '100%', background: C.card, border: `1.5px solid ${focused ? C.accent : C.border}`,
    borderRadius: 10, padding: '12px 14px', fontSize: 14, color: C.text,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
    transition: 'border-color .15s',
  })

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Left panel — branding */}
      <div className="auth-branding-panel" style={{ width: 420, flexShrink: 0, background: '#061208', display: 'flex',
        flexDirection: 'column', justifyContent: 'space-between', padding: '48px 40px',
        position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -80, left: -80, width: 320, height: 320,
          borderRadius: '50%', background: 'rgba(0,232,122,0.04)', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -40, right: -40, width: 240, height: 240,
          borderRadius: '50%', background: 'rgba(0,232,122,0.03)', filter: 'blur(40px)', pointerEvents: 'none' }} />

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

          <div style={{ fontSize: 28, fontWeight: 800, color: '#FFFFFF', letterSpacing: '-.04em', lineHeight: 1.2, marginBottom: 16 }}>
            Your clinic,<br />under control.
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
            Manage appointments, doctors, and patient queues — all from one dashboard.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 48 }}>
            {[
              { icon: <CalendarDays size={16} />, text: 'Real-time queue management' },
              { icon: <Stethoscope size={16} />,  text: 'Doctor schedule & availability' },
              { icon: <BarChart3 size={16} />,    text: 'Analytics & revenue insights' },
              { icon: <Bell size={16} />,         text: 'Instant booking notifications' },
            ].map(f => (
              <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,232,122,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00E87A', flexShrink: 0 }}>
                  {f.icon}
                </div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
          © {new Date().getFullYear()} Queue Health Technologies
        </div>
      </div>

      {/* Right panel — form */}
      <div style={{ flex: 1, background: C.bg, display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          {/* Registration success banner */}
          {justRegistered && (
            <div style={{ marginBottom: 24, padding: '14px 16px', background: `${C.accent}1A`,
              border: `1px solid ${C.accent}4D`, borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.accent, marginBottom: 3,
                display: 'flex', alignItems: 'center', gap: 6 }}>
                <Check size={14} /> Hospital registered successfully!
              </div>
              <div style={{ fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>
                Your hospital is pending verification. Sign in below to access your dashboard while we review your details.
              </div>
            </div>
          )}

          <div style={{ marginBottom: 36 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-.04em', marginBottom: 6 }}>
              Sign in to your hospital
            </div>
            <div style={{ fontSize: 13, color: C.textSub }}>
              Enter your admin credentials to access the dashboard.
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSub,
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Email address
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="admin@yourhospital.ng" required
                onFocus={() => setEmailFocus(true)} onBlur={() => setEmailFocus(false)}
                style={inputStyle(emailFocus)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.textSub,
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                  onFocus={() => setPassFocus(true)} onBlur={() => setPassFocus(false)}
                  style={{ ...inputStyle(passFocus), paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: C.textSub }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: C.redLight, border: `1px solid ${C.red}66`, borderRadius: 8,
                padding: '10px 14px', fontSize: 13, color: C.red,
                display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            <Button type="submit" loading={loading} size="lg" className="w-full mt-1">
              Sign in to dashboard {!loading && <ArrowRight size={15} />}
            </Button>
          </form>

          <div style={{ marginTop: 16, textAlign: 'center', fontSize: 13, color: C.textSub }}>
            New hospital?{' '}
            <Link href="/register" style={{ color: C.accent, fontWeight: 600 }}>Register here</Link>
          </div>

        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  )
}
