'use client'
import { useActionState, useState } from 'react'
import { setupFrontDeskLogin } from './actions'

export default function FrontDeskSetup() {
  const [result, action, pending] = useActionState(setupFrontDeskLogin, null)
  const [copied, setCopied] = useState<'email' | 'password' | null>(null)

  async function copy(text: string, field: 'email' | 'password') {
    await navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  const creds = result && 'email' in result ? result : null
  const err   = result && 'error' in result ? result.error : null

  if (creds) {
    return (
      <div className="bg-[#111915] border border-amber-500/20 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-3 mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <div>
            <div className="font-semibold text-sm">Front Desk Login Ready</div>
            <div className="text-xs text-[#7A9089]">Share these credentials with your front desk staff.</div>
          </div>
        </div>
        <div className="flex flex-col gap-2 mb-3">
          {[{ label: 'Email', value: creds.email, field: 'email' as const }, { label: 'Password', value: creds.password, field: 'password' as const }].map(r => (
            <div key={r.field} className="flex items-center gap-2 bg-[#060A07] border border-white/10 rounded-xl px-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-[#4A6058]">{r.label}</div>
                <div className="text-xs font-mono text-white truncate">{r.value}</div>
              </div>
              <button onClick={() => copy(r.value, r.field)}
                className="text-[10px] text-[#7A9089] hover:text-green-400 shrink-0 px-1.5 py-0.5 rounded transition-colors">
                {copied === r.field ? '✓' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-amber-400">Password will not be shown again — save it now.</p>
      </div>
    )
  }

  return (
    <div className="bg-red-500/8 border border-red-500/20 rounded-2xl p-4 mb-4 flex items-start gap-3">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF9F27" strokeWidth="2" className="shrink-0 mt-0.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
      <div className="flex-1">
        <div className="font-semibold text-sm text-red-400 mb-1">No Front Desk Account Found</div>
        <div className="text-xs text-[#7A9089] mb-3">
          The front desk login was not created during signup. Create it now to give your front desk staff access.
        </div>
        {err && <p className="text-xs text-red-400 mb-2">{err}</p>}
        <form action={action}>
          <button type="submit" disabled={pending}
            className="px-4 py-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all">
            {pending ? 'Creating…' : 'Create Front Desk Login'}
          </button>
        </form>
      </div>
    </div>
  )
}
