'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function StaffRegisterPage() {
  const router = useRouter()
  const supabase = createClient()

  const [fullName, setFullName]   = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [done, setDone]           = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (!fullName.trim()) { setError('Please enter your full name.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)

    // Create auth account
    const { data: authData, error: signUpErr } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim() } },
    })

    if (signUpErr) { setError(signUpErr.message); setLoading(false); return }
    if (!authData.user) { setError('Account creation failed. Please try again.'); setLoading(false); return }

    // If email confirmation is required, signUp returns a session-less user.
    // Sign in first so we have a session for the RLS-protected insert.
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    if (signInErr) {
      // Email confirmation is likely required — tell the user to confirm first.
      setError('Please check your email and confirm your address, then sign in.')
      setLoading(false)
      return
    }

    // Create users table record (requires an active session for RLS)
    const { error: profileErr } = await supabase.from('users').insert({
      auth_id:   authData.user.id,
      full_name: fullName.trim(),
      email:     email.trim().toLowerCase(),
    })

    if (profileErr) { setError(profileErr.message); setLoading(false); return }

    // Check if admin has already pre-assigned a role
    const { data: profile } = await supabase
      .from('users').select('id').eq('auth_id', authData.user.id).single()

    if (profile) {
      const { data: adminRecord } = await supabase
        .from('hospital_admins').select('role').eq('user_id', profile.id).single()

      if (adminRecord) {
        router.push('/dashboard')
        return
      }
    }

    setDone(true)
    setLoading(false)
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#060A07]">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-green-500/10 border border-green-500/25 mb-6">
            <span className="text-3xl">✅</span>
          </div>
          <h1 className="text-2xl font-bold mb-3">Account Created</h1>
          <p className="text-sm text-[#7A9089] mb-6 leading-relaxed">
            Your staff account has been created. Ask your hospital admin to grant you portal access — they'll add your email from the Staff page.
          </p>
          <p className="text-xs text-[#4A6058]">
            Once access is granted, sign in at{' '}
            <Link href="/login" className="text-green-400 hover:text-green-300">the portal login</Link>.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#060A07]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/25 mb-4">
            <span className="text-2xl">🏥</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Staff Registration</h1>
          <p className="text-sm text-[#7A9089] mt-1">Create your hospital portal account</p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl border border-red-500/30 bg-red-500/8 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-xs text-[#7A9089] mb-1.5 block">Full Name *</label>
            <input
              value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Dr. Amaka Okafor"
              required
              className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-[#7A9089] mb-1.5 block">Work Email *</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@hospital.com"
              required
              className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50"
            />
          </div>
          <div>
            <label className="text-xs text-[#7A9089] mb-1.5 block">Password *</label>
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
            {loading ? 'Creating account…' : 'Create Staff Account'}
          </button>
        </form>

        <p className="text-center text-sm text-[#7A9089] mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-green-400 hover:text-green-300 font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
