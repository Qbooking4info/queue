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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
    if (!profile) { router.push('/onboarding'); return }

    const { data: adminRecord } = await supabase
      .from('hospital_admins').select('hospital_id').eq('user_id', profile.id).single()
    if (!adminRecord) { router.push('/onboarding'); return }

    const { error: insertErr } = await supabase.from('doctors').insert({
      hospital_id: adminRecord.hospital_id,
      full_name: form.full_name.trim(),
      title: form.title,
      qualification: form.qualification.trim() || null,
      specialty_id: form.specialty_id || null,
      consultation_fee: form.consultation_fee ? Number(form.consultation_fee) : null,
      virtual_fee: form.virtual_fee ? Number(form.virtual_fee) : null,
      accepts_virtual: form.accepts_virtual,
      bio: form.bio.trim() || null,
      is_active: true,
    })

    if (insertErr) { setError(insertErr.message); setLoading(false); return }
    router.push('/dashboard/doctors')
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
