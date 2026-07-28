'use client'
import { useState, useEffect } from 'react'
import { AlertTriangle, BedDouble } from 'lucide-react'

const OPTIONS = ['enough', 'limited', 'very_limited', 'none'] as const
type Status = typeof OPTIONS[number] | 'unknown'

const STATUS_META: Record<Status, { label: string; color: string }> = {
  enough:       { label: 'Enough space',  color: 'text-green-400 border-green-500/30 bg-green-500/10' },
  limited:      { label: 'Limited',       color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
  very_limited: { label: 'Very limited',  color: 'text-orange-400 border-orange-500/30 bg-orange-500/10' },
  none:         { label: 'No space',      color: 'text-red-400 border-red-500/30 bg-red-500/10' },
  unknown:      { label: 'Not set yet',   color: 'text-gray-400 border-white/15 bg-white/5' },
}

const STALE_MINUTES = 30

function minutesAgo(iso: string | null): number | null {
  if (!iso) return null
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
}

// Patients decide whether to travel here based on this number, so it needs to stay
// current -- the "please refresh" reminder pulses once it's more than 30 minutes old,
// nudging whoever's at the desk without requiring a page reload to notice.
export function BedSpaceWidget({ hospitalId, initialStatus, initialUpdatedAt }: {
  hospitalId: string
  initialStatus: string
  initialUpdatedAt: string | null
}) {
  const [status,    setStatus]    = useState<Status>((initialStatus as Status) ?? 'unknown')
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt)
  const [saving,    setSaving]    = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [, forceTick] = useState(0)

  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 30000)
    return () => clearInterval(t)
  }, [])

  const elapsed = minutesAgo(updatedAt)
  const stale = elapsed === null || elapsed >= STALE_MINUTES

  async function handleSelect(next: typeof OPTIONS[number]) {
    setSaving(next); setError(null)
    const res = await fetch(`/api/hospitals/${hospitalId}/bed-space`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next }),
    })
    setSaving(null)
    if (!res.ok) { setError('Could not update — try again'); return }
    const body = await res.json()
    setStatus(body.bed_space_status)
    setUpdatedAt(body.bed_space_updated_at)
  }

  const meta = STATUS_META[status] ?? STATUS_META.unknown

  return (
    <div className={`rounded-2xl border p-4 mb-6 ${stale ? 'border-amber-500/40 bg-amber-500/5' : 'border-white/7 bg-[#111915]'}`}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BedDouble size={16} className="text-[#7A9089]" />
          <span className="font-bold text-sm">Emergency Bed Space</span>
          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${meta.color}`}>{meta.label}</span>
        </div>
        <div className={`text-xs flex items-center gap-1 ${stale ? 'text-amber-400 font-semibold animate-pulse' : 'text-[#4A6058]'}`}>
          {stale && <AlertTriangle size={12} />}
          {elapsed === null ? 'Never updated — please set now' : elapsed < 1 ? 'Updated just now' : `Updated ${elapsed}m ago`}
          {stale && elapsed !== null && ' — please refresh'}
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {OPTIONS.map(s => (
          <button key={s} disabled={saving === s} onClick={() => handleSelect(s)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-all disabled:opacity-50 ${
              status === s ? STATUS_META[s].color : 'text-[#7A9089] border-white/10 bg-white/5 hover:bg-white/10'
            }`}>
            {saving === s ? '…' : STATUS_META[s].label}
          </button>
        ))}
      </div>
      {error && <div className="text-xs text-red-400 mt-2">{error}</div>}
      <div className="text-[11px] text-[#4A6058] mt-3">
        Patients see this before they travel here — please keep it current, especially during busy periods.
      </div>
    </div>
  )
}
