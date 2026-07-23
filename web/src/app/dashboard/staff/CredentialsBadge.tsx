'use client'
import { useActionState, useState } from 'react'
import { Check } from 'lucide-react'
import { resetStaffPassword } from './actions'

interface Props {
  userId: string
  email: string
}

export default function CredentialsBadge({ userId, email }: Props) {
  const [result, action, pending] = useActionState(resetStaffPassword, null)
  const [copied, setCopied] = useState<'email' | 'password' | null>(null)
  const [open, setOpen] = useState(false)

  async function copy(text: string, field: 'email' | 'password') {
    await navigator.clipboard.writeText(text)
    setCopied(field)
    setTimeout(() => setCopied(null), 2000)
  }

  const creds = result && 'email' in result ? result : null
  const err   = result && 'error' in result ? result.error : null

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="text-xs text-[#7A9089] hover:text-green-400 px-2.5 py-1 rounded-lg border border-white/10 hover:border-green-500/30 transition-all shrink-0">
        View Login
      </button>
    )
  }

  return (
    <div className="w-full mt-3 bg-[#060A07] border border-white/10 rounded-xl p-3 flex flex-col gap-2">
      {/* Email row — always visible */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] text-[#4A6058] mb-0.5">Login Email</div>
          <div className="text-xs font-mono text-white truncate">{email}</div>
        </div>
        <button onClick={() => copy(email, 'email')}
          className="text-[10px] text-[#7A9089] hover:text-green-400 shrink-0 px-1.5 py-0.5 rounded transition-colors">
          {copied === 'email' ? <Check size={11} className="inline" /> : 'Copy'}
        </button>
      </div>

      {/* Password row — only after reset */}
      {creds && (
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] text-[#4A6058] mb-0.5">New Password</div>
            <div className="text-xs font-mono text-white tracking-widest">{creds.password}</div>
          </div>
          <button onClick={() => copy(creds.password, 'password')}
            className="text-[10px] text-[#7A9089] hover:text-green-400 shrink-0 px-1.5 py-0.5 rounded transition-colors">
            {copied === 'password' ? <Check size={11} className="inline" /> : 'Copy'}
          </button>
        </div>
      )}

      {err && <p className="text-[10px] text-red-400">{err}</p>}

      <form action={action} className="flex items-center justify-between mt-1">
        <input type="hidden" name="user_id" value={userId} />
        <button type="submit" disabled={pending}
          className="text-[10px] text-amber-400 hover:text-amber-300 disabled:opacity-50 transition-colors">
          {pending ? 'Resetting…' : creds ? 'Reset Again' : 'Reset Password'}
        </button>
        <button type="button" onClick={() => setOpen(false)}
          className="text-[10px] text-[#4A6058] hover:text-[#7A9089] transition-colors">
          Hide
        </button>
      </form>
    </div>
  )
}
