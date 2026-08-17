'use client'
import { useState, useEffect, useCallback } from 'react'
import { Phone, Plus, Trash2, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

/**
 * Emergency fallback directory.
 *
 * These numbers are shown to patients at the moment dispatch fails — the second
 * half of "we find you an ambulance, and if we can't, we tell you instantly and
 * hand you the numbers that will". The table ships empty on purpose: an
 * unverified number here is worse than an empty list, because the caller spends
 * the seconds that mattered on a dead line believing we vouched for it.
 */

interface Entry {
  id: string
  name: string
  kind: 'national' | 'state' | 'hospital_ae' | 'private_fleet'
  phone: string
  alt_phone: string | null
  state: string | null
  city: string | null
  priority: number
  notes: string | null
  is_active: boolean
  last_verified_at: string
  verified_by: string
  verification_note: string | null
}

const KIND_LABEL: Record<Entry['kind'], string> = {
  national: 'National emergency',
  state: 'State ambulance service',
  hospital_ae: 'Hospital A&E',
  private_fleet: 'Private ambulance',
}

const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)

export default function DirectoryPage() {
  const { theme: C } = useTheme()
  const [entries, setEntries] = useState<Entry[]>([])
  const [ttlDays, setTtlDays] = useState(90)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  const [f, setF] = useState({ name: '', kind: 'national', phone: '', alt_phone: '', state: '', city: '', priority: '100', verified_by: '', verification_note: '' })
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/emergency-directory')
    if (res.ok) { const b = await res.json(); setEntries(b.entries ?? []); setTtlDays(b.ttlDays ?? 90) }
    else setError('Could not load the directory')
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function add() {
    if (!f.name.trim() || !f.phone.trim()) { setError('Name and phone are required'); return }
    if (!f.verified_by.trim()) { setError('Record who dialled this number — it cannot be saved unverified'); return }
    setAdding(true); setError('')
    const res = await fetch('/api/emergency-directory', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, priority: parseInt(f.priority, 10) || 100 }),
    })
    setAdding(false)
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'Failed to add'); return }
    setF({ name: '', kind: 'national', phone: '', alt_phone: '', state: '', city: '', priority: '100', verified_by: '', verification_note: '' })
    await load()
  }

  async function reverify(e: Entry) {
    const who = prompt(`You are confirming you just dialled ${e.phone} and it answered as "${e.name}".\n\nYour name:`)
    if (!who?.trim()) return
    const note = prompt('What happened on the call? (optional)') ?? ''
    setBusy(e.id)
    const res = await fetch('/api/emergency-directory', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: e.id, action: 'reverify', verified_by: who.trim(), verification_note: note }),
    })
    setBusy(null)
    if (!res.ok) { setError((await res.json().catch(() => null))?.error ?? 'Failed to re-verify'); return }
    await load()
  }

  async function toggleActive(e: Entry) {
    setBusy(e.id)
    await fetch('/api/emergency-directory', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: e.id, is_active: !e.is_active }),
    })
    setBusy(null); await load()
  }

  async function remove(e: Entry) {
    if (!confirm(`Delete "${e.name}"? Patients will no longer be offered this number.`)) return
    setBusy(e.id)
    await fetch(`/api/emergency-directory?id=${e.id}`, { method: 'DELETE' })
    setBusy(null); await load()
  }

  const input: React.CSSProperties = {
    background: C.bgAlt, border: `1px solid ${C.borderMed}`, borderRadius: 10,
    padding: '9px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
  }
  const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }

  const servable = entries.filter(e => e.is_active && daysSince(e.last_verified_at) < ttlDays)
  const stale = entries.filter(e => e.is_active && daysSince(e.last_verified_at) >= ttlDays)

  return (
    <div style={{ maxWidth: 940 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Emergency directory</h1>
      <p style={{ fontSize: 13, color: C.textSub, marginBottom: 18 }}>
        Shown to patients in the app when we cannot reach an ambulance. Entries stop being served
        after {ttlDays} days without re-verification.
      </p>

      {servable.length === 0 && !loading && (
        <div style={{ background: '#DC262614', border: '1.5px solid #DC262655', borderRadius: 12, padding: '12px 14px', marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <AlertTriangle size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 13, color: '#DC2626' }}>
            <strong>No servable numbers.</strong> The fallback panel in the app is currently showing patients
            nothing. Until at least one verified entry exists, a failed ambulance search ends with no number to call.
          </div>
        </div>
      )}
      {stale.length > 0 && (
        <div style={{ background: '#B4530914', border: '1px solid #B4530944', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#B45309' }}>
          {stale.length} {stale.length === 1 ? 'entry has' : 'entries have'} gone stale and {stale.length === 1 ? 'is' : 'are'} no longer shown to patients. Re-dial and re-verify.
        </div>
      )}
      {error && <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>{error}</div>}

      <div style={{ ...card, marginBottom: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Add a number</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
          <input style={input} placeholder="Service name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
          <select style={input} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input style={input} placeholder="Phone (E.164)" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
          <input style={input} placeholder="Alt phone (optional)" value={f.alt_phone} onChange={e => setF({ ...f, alt_phone: e.target.value })} />
          <input style={input} placeholder="State (blank = nationwide)" value={f.state} onChange={e => setF({ ...f, state: e.target.value })} />
          <input style={input} placeholder="City (optional)" value={f.city} onChange={e => setF({ ...f, city: e.target.value })} />
          <input style={input} placeholder="Priority (lower = first)" value={f.priority} onChange={e => setF({ ...f, priority: e.target.value })} />
        </div>
        <div style={{ marginTop: 12, padding: 12, background: C.bgAlt, border: `1px dashed ${C.borderMed}`, borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.text, marginBottom: 8 }}>
            Verification — you must have dialled this number
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
            <input style={input} placeholder="Who dialled it (your name)" value={f.verified_by} onChange={e => setF({ ...f, verified_by: e.target.value })} />
            <input style={input} placeholder="What happened on the call" value={f.verification_note} onChange={e => setF({ ...f, verification_note: e.target.value })} />
          </div>
        </div>
        <button onClick={add} disabled={adding}
          style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, padding: '9px 16px', borderRadius: 10, border: 'none', cursor: 'pointer', background: C.accent, color: '#fff', opacity: adding ? 0.6 : 1 }}>
          <Plus size={14} /> {adding ? 'Adding…' : 'Add number'}
        </button>
      </div>

      {loading ? (
        <div style={{ ...card, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>Loading…</div>
      ) : entries.length === 0 ? (
        <div style={{ ...card, textAlign: 'center', color: C.textMuted, fontSize: 13, padding: 40 }}>
          Directory is empty. Start with the national emergency line and your state ambulance service.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map(e => {
            const age = daysSince(e.last_verified_at)
            const isStale = age >= ttlDays
            const live = e.is_active && !isStale
            return (
              <div key={e.id} style={{ ...card, padding: 16, opacity: e.is_active ? 1 : 0.55, borderColor: isStale && e.is_active ? '#B4530955' : C.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 220 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{e.name}</span>
                      <span style={{ fontSize: 11, color: C.textSub }}>{KIND_LABEL[e.kind]}</span>
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', padding: '2px 7px', borderRadius: 6,
                        color: live ? '#00A854' : isStale ? '#B45309' : C.textMuted,
                        background: live ? '#00A85418' : isStale ? '#B4530918' : C.bgAlt,
                        border: `1px solid ${live ? '#00A85444' : isStale ? '#B4530944' : C.border}` }}>
                        {live ? 'Live' : isStale ? 'Stale — not shown' : 'Disabled'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 13, color: C.text, fontWeight: 600 }}>
                      <Phone size={13} /> {e.phone}{e.alt_phone ? ` · ${e.alt_phone}` : ''}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.textMuted, marginTop: 5 }}>
                      {e.state ? `${e.state}${e.city ? ' · ' + e.city : ''}` : 'Nationwide'} · priority {e.priority}
                    </div>
                    <div style={{ fontSize: 11.5, color: isStale ? '#B45309' : C.textMuted, marginTop: 4 }}>
                      Verified by {e.verified_by} · {age === 0 ? 'today' : `${age}d ago`}
                      {isStale && ` — past the ${ttlDays}d window`}
                      {e.verification_note ? ` · "${e.verification_note}"` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexShrink: 0 }}>
                    <button onClick={() => reverify(e)} disabled={busy === e.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, padding: '7px 11px', borderRadius: 9, cursor: 'pointer', color: '#00A854', background: '#00A85414', border: '1px solid #00A85444' }}>
                      <ShieldCheck size={13} /> Re-verify
                    </button>
                    <button onClick={() => toggleActive(e)} disabled={busy === e.id}
                      style={{ fontSize: 12, fontWeight: 600, padding: '7px 11px', borderRadius: 9, cursor: 'pointer', color: C.textSub, background: C.bgAlt, border: `1px solid ${C.borderMed}` }}>
                      {e.is_active ? 'Disable' : 'Enable'}
                    </button>
                    <button onClick={() => remove(e)} disabled={busy === e.id}
                      style={{ color: C.red, padding: 7, borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
