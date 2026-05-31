'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AcceptInvitePage() {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError]       = useState('')
  const [email, setEmail]       = useState('')

  useEffect(() => {
    async function init() {
      // Session is already established by /auth/callback before landing here.
      // Fall back to onAuthStateChange for implicit-flow invite links (hash tokens).
      const { data: { session } } = await supabase.auth.getSession()

      if (session) {
        setEmail(session.user.email ?? '')
        await checkExistingProfile(session.user.id)
        return
      }

      // Implicit flow: wait for the client to process the URL hash token
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, sess) => {
        if (sess) {
          subscription.unsubscribe()
          setEmail(sess.user.email ?? '')
          await checkExistingProfile(sess.user.id)
        }
      })

      // No session and no hash token — link is invalid or expired
      const timeout = setTimeout(() => {
        setError('This invite link is invalid or has expired. Ask your admin to resend it.')
        setChecking(false)
      }, 5000)

      return () => {
        subscription.unsubscribe()
        clearTimeout(timeout)
      }
    }

    init()
  }, [])

  async function checkExistingProfile(authId: string) {
    const { data: profile } = await supabase
      .from('users').select('id, full_name').eq('auth_id', authId).single()

    if (profile?.full_name && profile.full_name !== 'Invited Staff') {
      router.push('/dashboard')
      return
    }

    if (profile?.full_name === 'Invited Staff') {
      setFullName('')
    }

    setChecking(false)
  }

  async function handleComplete(e: React.FormEvent) {
    e.preventDefault()
    if (!fullName.trim()) { setError('Please enter your name.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Session expired. Please use the invite link again.'); setLoading(false); return }

    const { error: upsertErr } = await supabase.from('users').upsert({
      auth_id:   user.id,
      full_name: fullName.trim(),
      email:     user.email ?? email,
    }, { onConflict: 'auth_id' })

    if (upsertErr) { setError(upsertErr.message); setLoading(false); return }

    const { error: pwErr } = await supabase.auth.updateUser({ password })
    if (pwErr) { setError(pwErr.message); setLoading(false); return }

    router.push('/dashboard')
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#060A07]">
        <div className="text-[#7A9089] text-sm">Setting up your account…</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#060A07]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/25 mb-4">
            <span className="text-2xl">👋</span>
          </div>
          <h1 className="text-2xl font-bold">Welcome to Queue</h1>
          <p className="text-sm text-[#7A9089] mt-1">
            Set your name and password to access the portal
          </p>
          {email && <p className="text-xs text-[#4A6058] mt-1">{email}</p>}
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl border border-red-500/30 bg-red-500/8 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleComplete} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-[#7A9089] mb-1.5 block">Your Full Name *</label>
            <input
              value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Dr. Amaka Okafor"
              required autoFocus
              className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-[#7A9089] mb-1.5 block">Set Password *</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-[#7A9089] mb-1.5 block">Confirm Password *</label>
            <input
              type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
              className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50"
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="mt-2 w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white text-sm font-bold transition-all">
            {loading ? 'Saving…' : 'Go to Dashboard →'}
          </button>
        </form>
      </div>
    </div>
  )
}
