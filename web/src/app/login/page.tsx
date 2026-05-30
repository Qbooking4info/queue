'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); return }
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#060A07]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/25 mb-4">
            <svg width="28" height="28" viewBox="0 0 40 40" fill="none">
              <rect x="6" y="8" width="28" height="24" rx="6" stroke="#00E87A" strokeWidth="2"/>
              <line x1="13" y1="16" x2="27" y2="16" stroke="#00E87A" strokeWidth="2" strokeLinecap="round"/>
              <line x1="13" y1="20" x2="22" y2="20" stroke="#00E87A" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="30" cy="30" r="8" fill="#0A0F0D" stroke="#00E87A" strokeWidth="2"/>
              <line x1="30" y1="26.5" x2="30" y2="30" stroke="#00E87A" strokeWidth="2" strokeLinecap="round"/>
              <circle cx="30" cy="31.5" r="1" fill="#00E87A"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Queue Hospital Portal</h1>
          <p className="text-sm text-[#7A9089] mt-1">Sign in as admin, specialist, or front desk</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Email address" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@hospital.com" required />
          <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">Sign In</Button>
        </form>

        <p className="text-center text-sm text-[#7A9089] mt-6">
          New hospital?{' '}
          <Link href="/register" className="text-green-400 hover:text-green-300 font-medium">Register here</Link>
        </p>
        <p className="text-center text-xs text-[#4A6058] mt-3">
          Staff members: use the same email and password from your patient app account
        </p>
      </div>
    </div>
  )
}
