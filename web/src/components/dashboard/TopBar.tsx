'use client'
import { useState } from 'react'
import { useTheme } from '@/contexts/ThemeContext'

const MOCK_NOTIFICATIONS = [
  { type: 'new',     msg: 'New booking received — check Appointments',    time: 'Just now'  },
  { type: 'cancel',  msg: 'An appointment was cancelled by a patient',    time: '2 hrs ago' },
  { type: 'review',  msg: 'New 5★ patient review posted',                 time: '4 hrs ago' },
  { type: 'payment', msg: 'Monthly payout processed to your bank',        time: 'Yesterday' },
]

export function TopBar() {
  const { theme: C, themeId, toggleTheme } = useTheme()
  const [notifOpen, setNotifOpen] = useState(false)
  const isForest = themeId === 'forest'

  return (
    <div style={{ height: 60, borderBottom: `1px solid ${C.border}`, display: 'flex',
      alignItems: 'center', padding: '0 28px', gap: 16, background: C.card,
      position: 'sticky', top: 0, zIndex: 10, transition: 'background .3s, border-color .3s' }}>

      {/* Theme toggle */}
      <button onClick={toggleTheme}
        style={{ display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 12px', borderRadius: 99,
          background: isForest ? 'rgba(0,232,122,0.10)' : 'rgba(26,127,193,0.10)',
          border: `1px solid ${isForest ? 'rgba(0,232,122,0.25)' : 'rgba(26,127,193,0.25)'}`,
          cursor: 'pointer', transition: 'all .3s' }}>
        <div style={{ width: 34, height: 18, borderRadius: 99, position: 'relative', flexShrink: 0,
          background: isForest ? 'rgba(0,232,122,0.25)' : 'rgba(26,127,193,0.25)',
          transition: 'background .3s' }}>
          <div style={{ position: 'absolute', top: 2, left: isForest ? 17 : 2,
            width: 14, height: 14, borderRadius: '50%', background: C.accent,
            transition: 'left .25s cubic-bezier(.34,1.56,.64,1)' }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.accent, whiteSpace: 'nowrap' }}>
          {isForest ? '🌿 Forest' : '🏥 Clinical'}
        </span>
      </button>

      <div style={{ flex: 1 }} />

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8,
        background: C.bgAlt, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: '7px 14px', width: 240, transition: 'background .3s' }}>
        <span style={{ fontSize: 13, color: C.textMuted }}>🔍</span>
        <input placeholder="Quick search…"
          style={{ border: 'none', outline: 'none', background: 'none',
            fontSize: 13, color: C.text, fontFamily: 'inherit', width: '100%' }} />
      </div>

      {/* Bell */}
      <div style={{ position: 'relative' }}>
        <button onClick={() => setNotifOpen(o => !o)}
          style={{ width: 38, height: 38, borderRadius: 10, background: C.bgAlt,
            border: `1px solid ${C.border}`, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, position: 'relative', transition: 'background .3s' }}>
          🔔
          <div style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8,
            borderRadius: '50%', background: C.accent, border: `2px solid ${C.card}` }} />
        </button>

        {notifOpen && (
          <>
            <div onClick={() => setNotifOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
            <div style={{ position: 'absolute', right: 0, top: 46, width: 320,
              background: C.card, border: `1px solid ${C.border}`,
              borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              zIndex: 100, overflow: 'hidden', transition: 'background .3s' }}>
              <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}`,
                fontSize: 13, fontWeight: 700, color: C.text }}>Notifications</div>
              {MOCK_NOTIFICATIONS.map((n, i) => (
                <div key={i} style={{ padding: '10px 16px',
                  borderBottom: i < MOCK_NOTIFICATIONS.length - 1 ? `1px solid ${C.border}` : 'none',
                  display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>
                    {n.type === 'cancel' ? '🚫' : n.type === 'review' ? '⭐' : n.type === 'payment' ? '💰' : '📋'}
                  </span>
                  <div>
                    <div style={{ fontSize: 12, color: C.text, lineHeight: 1.4 }}>{n.msg}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{n.time}</div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
