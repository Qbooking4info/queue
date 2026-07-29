'use client'
import { useState, useEffect } from 'react'
import { useTheme } from '@/contexts/ThemeContext'
import { BedDouble, AlertTriangle } from 'lucide-react'
import { BedSpaceWidget, STATUS_META, minutesAgo, STALE_MINUTES, type BedSpaceStatus } from './BedSpaceWidget'

// Clickable summary tile for the Overview page -- opens a modal with the full
// BedSpaceWidget rather than embedding all four buttons inline, so it reads as
// one quick-action among the rest of the page instead of dominating it.
export function BedSpaceCard({ hospitalId, status, updatedAt }: {
  hospitalId: string
  status: BedSpaceStatus
  updatedAt: string | null
}) {
  const { theme: C } = useTheme()
  const [open,       setOpen]       = useState(false)
  const [liveStatus, setLiveStatus] = useState(status)
  const [liveUpdatedAt, setLiveUpdatedAt] = useState(updatedAt)
  const [, forceTick] = useState(0)

  useEffect(() => setLiveStatus(status), [status])
  useEffect(() => setLiveUpdatedAt(updatedAt), [updatedAt])

  useEffect(() => {
    const t = setInterval(() => forceTick(n => n + 1), 15000)
    return () => clearInterval(t)
  }, [])

  const elapsed = minutesAgo(liveUpdatedAt)
  const stale = elapsed === null || elapsed >= STALE_MINUTES
  const meta = STATUS_META[liveStatus] ?? STATUS_META.unknown

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 12, width: '100%',
          textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
          background: stale ? C.redLight : C.card,
          border: `1px solid ${stale ? C.red + '55' : C.border}`,
          borderRadius: 16, padding: '14px 18px', marginBottom: 20,
          transition: 'box-shadow 0.2s, transform 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
      >
        <div style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0,
          background: (stale ? C.red : C.accent) + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: stale ? C.red : C.accent }}>
          <BedDouble size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>Emergency Bed Space</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 9px', borderRadius: 99,
              background: stale ? C.red + '22' : C.accentLight,
              color: stale ? C.red : C.accent }}>{meta.label}</span>
          </div>
          <div style={{ fontSize: 11.5, color: stale ? C.red : C.textMuted, marginTop: 2,
            display: 'flex', alignItems: 'center', gap: 4, fontWeight: stale ? 600 : 400,
            animation: stale ? 'bedspace-flash 2s ease-in-out infinite' : 'none' }}>
            {stale && <AlertTriangle size={11} />}
            {elapsed === null ? 'Never updated — tap to set now' : elapsed < 1 ? 'Updated just now' : `Updated ${elapsed}m ago — tap to update`}
          </div>
        </div>
        <span style={{ color: C.textMuted, fontSize: 16 }}>›</span>
      </button>
      <style>{`@keyframes bedspace-flash { 0%, 100% { opacity: 1 } 50% { opacity: 0.45 } }`}</style>

      {open && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => e.target === e.currentTarget && setOpen(false)}
        >
          <div style={{ width: '100%', maxWidth: 460, background: C.card, border: `1px solid ${C.border}`,
            borderRadius: 20, boxShadow: '0 24px 64px rgba(0,0,0,0.5)', padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: C.text }}>Update Bed Space</div>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none',
                color: C.textMuted, fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
            </div>
            <BedSpaceWidget
              hospitalId={hospitalId}
              initialStatus={liveStatus}
              initialUpdatedAt={liveUpdatedAt}
              onChange={(s, u) => { setLiveStatus(s); setLiveUpdatedAt(u) }}
            />
          </div>
        </div>
      )}
    </>
  )
}
