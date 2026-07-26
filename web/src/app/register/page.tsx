'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Eye, EyeOff, AlertTriangle, ArrowRight, CalendarDays, Stethoscope, BarChart3, Bell } from 'lucide-react'

export default function RegisterPage() {
  const router   = useRouter()
  const supabase = createClient()

  const [fullName, setFullName]   = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [showPass, setShowPass]   = useState(false)
  const [nameFocus, setNameFocus] = useState(false)
  const [emailFocus, setEmailFocus] = useState(false)
  const [passFocus,  setPassFocus]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
      if (authError) { setError(authError.message); setLoading(false); return }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
      if (signInError) { setError(signInError.message); setLoading(false); return }

      if (authData.user) {
        const { error: profileErr } = await supabase.from('users').upsert({
          auth_id: authData.user.id,
          full_name: fullName,
          email,
        }, { onConflict: 'auth_id' })
        if (profileErr) { setError('Account created but profile setup failed: ' + profileErr.message); setLoading(false); return }
      }

      router.push('/onboarding')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  const inputStyle = (focused: boolean) => ({
    width: '100%', background: '#FFFFFF', border: `1.5px solid ${focused ? '#1A7FC1' : '#DDE8F5'}`,
    borderRadius: 10, padding: '12px 14px', fontSize: 14, color: '#0C2A4A',
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const,
    transition: 'border-color .15s',
  })

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      {/* Left panel — branding */}
      <div style={{ width: 420, flexShrink: 0, background: '#061208', display: 'flex',
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
            Join thousands of<br />clinics on Queue.
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
            Set up your hospital in minutes and start managing appointments, queues, and patient care — all in one place.
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
      <div style={{ flex: 1, background: '#F4F8FC', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '40px 24px' }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0C2A4A', letterSpacing: '-.04em', marginBottom: 6 }}>
              Register your hospital
            </div>
            <div style={{ fontSize: 13, color: '#6A8FAA' }}>
              Create your admin account to get started. Takes less than 5 minutes.
            </div>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#2A5070',
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Full Name
              </label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                placeholder="Dr. Emmanuel Okpanachi" required
                onFocus={() => setNameFocus(true)} onBlur={() => setNameFocus(false)}
                style={inputStyle(nameFocus)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#2A5070',
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Work Email
              </label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="admin@yourhospital.ng" required
                onFocus={() => setEmailFocus(true)} onBlur={() => setEmailFocus(false)}
                style={inputStyle(emailFocus)} />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#2A5070',
                marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.04em' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input type={showPass ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters"
                  minLength={8} required
                  onFocus={() => setPassFocus(true)} onBlur={() => setPassFocus(false)}
                  style={{ ...inputStyle(passFocus), paddingRight: 44 }} />
                <button type="button" onClick={() => setShowPass(v => !v)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#6A8FAA' }}>
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: '#FEF0F0', border: '1px solid #F5C6C6', borderRadius: 8,
                padding: '10px 14px', fontSize: 13, color: '#E03E3E',
                display: 'flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={14} /> {error}
              </div>
            )}

            <button type="submit" disabled={loading}
              style={{ width: '100%', background: '#1A7FC1', color: '#FFFFFF', border: 'none',
                borderRadius: 12, padding: '14px', fontSize: 14, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
                fontFamily: 'inherit', marginTop: 4, transition: 'opacity .15s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {loading ? 'Creating account…' : <>Create account <ArrowRight size={15} /></>}
            </button>
          </form>

          <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: '#6A8FAA' }}>
            Already registered?{' '}
            <Link href="/login" style={{ color: '#1A7FC1', fontWeight: 600 }}>Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
