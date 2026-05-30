'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function RegisterPage() {
  const router = useRouter()
  const supabase = createClient()
  const [fullName, setFullName]   = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')

    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password })
    if (authError) { setError(authError.message); setLoading(false); return }

    if (authData.user) {
      await supabase.from('users').insert({
        auth_id: authData.user.id,
        full_name: fullName,
        email,
      })
    }

    router.push('/onboarding')
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#060A07]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/25 mb-4">
            <span className="text-2xl">🏥</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Register Your Hospital</h1>
          <p className="text-sm text-[#7A9089] mt-1">Create your Queue account to get started</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Your full name" type="text" value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Dr. Emmanuel Okpanachi" required />
          <Input label="Work email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@hospital.com" required />
          <Input label="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 8 characters" minLength={8} required />
          {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}
          <Button type="submit" size="lg" loading={loading} className="mt-2 w-full">Create Account</Button>
        </form>

        <p className="text-center text-sm text-[#7A9089] mt-6">
          Already registered?{' '}
          <Link href="/login" className="text-green-400 hover:text-green-300 font-medium">Sign in</Link>
        </p>
      </div>
    </div>
  )
}
