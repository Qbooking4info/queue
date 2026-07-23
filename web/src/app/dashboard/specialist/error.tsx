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
      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#EF9F27" strokeWidth="1.5" style={{display:"block",margin:"0 auto 16px"}}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
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
