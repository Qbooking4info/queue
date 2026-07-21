'use client'

import { useEffect } from 'react'

export default function SpecialistError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[Specialist] Unhandled error:', error)
  }, [error])

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 320, padding: 40, textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 8, color: '#f07070' }}>
        Something went wrong
      </h2>
      {error?.message && (
        <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 24, maxWidth: 420 }}>
          {error.message}
        </p>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button
          onClick={reset}
          style={{
            padding: '10px 22px', borderRadius: 10, border: 'none',
            background: '#22c55e', color: '#fff', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Try again
        </button>
        <a
          href="/dashboard"
          style={{
            padding: '10px 22px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)',
            background: 'transparent', color: '#94a3b8', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', textDecoration: 'none', fontFamily: 'inherit',
          }}
        >
          ← Back to Dashboard
        </a>
      </div>
    </div>
  )
}
