'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Specialty { id: string; name: string; icon: string | null }

export default function AddDoctorPage() {
  const router = useRouter()
  const supabase = createClient()

  const [specialties, setSpecialties] = useState<Specialty[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ loginEmail: string; loginPassword: string } | null>(null)
  const [copied, setCopied] = useState<'email' | 'password' | null>(null)

  const [form, setForm] = useState({
    full_name: '',
    title: 'Dr.',
    qualification: '',
    specialty_id: '',
    consultation_fee: '',
    virtual_fee: '',
    accepts_virtual: false,
    bio: '',
  })

  useEffect(() => {
    supabase.from('specialties').select('id, name, icon').order('name').then(({ data }) => {
      if (data) setSpecialties(data)
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set(field: string, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')

    const res = await fetch('/api/doctors/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()

    if (!res.ok) {
      setError(json.error ?? 'Failed to add doctor')
      setLoading(false)
      return
    }

    if (json.loginCreated) {
      setSuccess({ loginEmail: json.loginEmail, loginPassword: json.loginPassword })
      setLoading(false)
    } else if (json.loginError) {
      setError(`Doctor saved, but login could not be created: ${json.loginError}. Use the Staff page to set up their login manually.`)
      setLoading(false)
    } else {
      router.push('/dashboard/doctors')
    }
  }

  async function copyText(text: string, field: 'email' | 'password') {
    await navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  if (success) {
    return (
      <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
        <div className="bg-[#111915] border border-white/7 rounded-2xl p-8">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/25 mb-4">
              <span className="text-2xl">👨‍⚕️</span>
            </div>
            <h2 className="text-xl font-bold">Doctor Added</h2>
            <p className="text-sm text-[#7A9089] mt-1">
              Save these credentials and share them with the doctor.
            </p>
          </div>

          <div className="flex flex-col gap-3 mb-6">
            <div>
              <div className="text-xs text-[#7A9089] mb-1">Login Email</div>
              <div className="flex items-center gap-2 bg-[#060A07] border border-white/10 rounded-xl px-3 py-2.5">
                <span className="flex-1 text-sm font-mono text-white break-all">{success.loginEmail}</span>
                <button onClick={() => copyText(success!.loginEmail, 'email')}
                  className="text-xs text-[#7A9089] hover:text-green-400 shrink-0 transition-colors px-2 py-1 rounded-lg hover:bg-green-500/10">
                  {copied === 'email' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
            <div>
              <div className="text-xs text-[#7A9089] mb-1">Password</div>
              <div className="flex items-center gap-2 bg-[#060A07] border border-white/10 rounded-xl px-3 py-2.5">
                <span className="flex-1 text-sm font-mono text-white tracking-widest">{success.loginPassword}</span>
                <button onClick={() => copyText(success!.loginPassword, 'password')}
                  className="text-xs text-[#7A9089] hover:text-green-400 shrink-0 transition-colors px-2 py-1 rounded-lg hover:bg-green-500/10">
                  {copied === 'password' ? '✓ Copied' : 'Copy'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-amber-500/8 border border-amber-500/20 rounded-xl p-3 mb-6">
            <p className="text-xs text-amber-400 leading-relaxed">
              <span className="font-semibold">Important:</span> This password will not be shown again. Copy it now and share it with the doctor securely.
            </p>
          </div>

          <div className="flex gap-3">
            <Link href="/dashboard/doctors"
              className="flex-1 text-center py-2.5 rounded-xl bg-green-500 hover:bg-green-400 text-white text-sm font-bold transition-all">
              Back to Doctors
            </Link>
            <button onClick={() => { setSuccess(null); setCopied(null); setForm({ full_name: '', title: 'Dr.', qualification: '', specialty_id: '', consultation_fee: '', virtual_fee: '', accepts_virtual: false, bio: '' }) }}
              className="flex-1 py-2.5 rounded-xl border border-white/10 text-sm text-[#7A9089] hover:text-white hover:border-white/20 transition-all">
              Add Another
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard/doctors" className="text-[#4A6058] hover:text-white transition-colors text-sm">← Doctors</Link>
        <span className="text-[#4A6058]">/</span>
        <span className="text-sm">Add Doctor</span>
      </div>

      <h1 className="text-2xl font-bold mb-6">Add a Doctor</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Name row */}
        <div className="flex gap-3">
          <div className="w-24">
            <label className="text-xs text-[#7A9089] mb-1.5 block">Title</label>
            <select value={form.title} onChange={e => set('title', e.target.value)}
              className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50">
              {['Dr.','Prof.','Mr.','Mrs.','Ms.'].map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="text-xs text-[#7A9089] mb-1.5 block">Full Name *</label>
            <input required value={form.full_name} onChange={e => set('full_name', e.target.value)}
              placeholder="Amaka Okafor"
              className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50" />
          </div>
        </div>

        {/* Qualification */}
        <div>
          <label className="text-xs text-[#7A9089] mb-1.5 block">Qualification</label>
          <input value={form.qualification} onChange={e => set('qualification', e.target.value)}
            placeholder="MBBS, FWACS"
            className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50" />
        </div>

        {/* Specialty */}
        <div>
          <label className="text-xs text-[#7A9089] mb-1.5 block">Specialty</label>
          <select value={form.specialty_id} onChange={e => set('specialty_id', e.target.value)}
            className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50">
            <option value="">Select specialty</option>
            {specialties.map(s => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
          </select>
        </div>

        {/* Fees */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-xs text-[#7A9089] mb-1.5 block">Consultation Fee (₦)</label>
            <input type="number" min="0" value={form.consultation_fee} onChange={e => set('consultation_fee', e.target.value)}
              placeholder="5000"
              className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50" />
          </div>
          <div className="flex-1">
            <label className="text-xs text-[#7A9089] mb-1.5 block">Virtual Fee (₦)</label>
            <input type="number" min="0" value={form.virtual_fee} onChange={e => set('virtual_fee', e.target.value)}
              placeholder="3500"
              disabled={!form.accepts_virtual}
              className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50 disabled:opacity-40" />
          </div>
        </div>

        {/* Virtual toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div className={`w-10 h-6 rounded-full transition-colors relative ${form.accepts_virtual ? 'bg-green-500' : 'bg-white/10'}`}
            onClick={() => set('accepts_virtual', !form.accepts_virtual)}>
            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${form.accepts_virtual ? 'translate-x-5' : 'translate-x-1'}`} />
          </div>
          <span className="text-sm">Accepts virtual consultations</span>
        </label>

        {/* Bio */}
        <div>
          <label className="text-xs text-[#7A9089] mb-1.5 block">Bio (optional)</label>
          <textarea value={form.bio} onChange={e => set('bio', e.target.value)}
            rows={3} placeholder="Brief professional background..."
            className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50 resize-none" />
        </div>

        {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Link href="/dashboard/doctors"
            className="flex-1 text-center py-2.5 rounded-xl border border-white/10 text-sm text-[#7A9089] hover:text-white hover:border-white/20 transition-all">
            Cancel
          </Link>
          <button type="submit" disabled={loading}
            className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-400 text-white text-sm font-bold transition-all disabled:opacity-50">
            {loading ? 'Adding…' : 'Add Doctor'}
          </button>
        </div>
      </form>
    </div>
  )
}
