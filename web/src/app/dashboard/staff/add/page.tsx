'use client'
import { useActionState } from 'react'
import Link from 'next/link'
import { addStaff } from '../actions'

export default function AddStaffPage() {
  const [state, action, pending] = useActionState(addStaff, null)

  return (
    <div className="flex-1 p-6 max-w-xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard/staff" className="text-[#4A6058] hover:text-white transition-colors text-sm">← Staff</Link>
        <span className="text-[#4A6058]">/</span>
        <span className="text-sm">Add Admin</span>
      </div>

      <h1 className="text-2xl font-bold mb-2">Add Admin</h1>
      <p className="text-sm text-[#7A9089] mb-8">
        Grant another person full admin access to this hospital portal.
      </p>

      {/* Auto-generated login notes */}
      <div className="flex flex-col gap-3 mb-8">
        <div className="flex items-start gap-3 bg-blue-500/8 border border-blue-500/20 rounded-xl p-3">
          <span className="text-lg shrink-0">👨‍⚕️</span>
          <p className="text-xs text-blue-400 leading-relaxed">
            <span className="font-semibold">Specialist logins are auto-created when you add a doctor</span> — go to{' '}
            <Link href="/dashboard/doctors/add" className="underline underline-offset-2">Add Doctor</Link> to register a new specialist under this hospital.
          </p>
        </div>
        <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl p-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          <p className="text-xs text-amber-400 leading-relaxed">
            <span className="font-semibold">Front Desk login was auto-created at signup</span> — find the credentials on the{' '}
            <Link href="/dashboard/staff" className="underline underline-offset-2">Staff page</Link>.
          </p>
        </div>
      </div>

      {state?.error && (
        <div className="mb-6 p-4 rounded-2xl border border-red-500/30 bg-red-500/8 text-sm text-red-400">
          {state.error}
        </div>
      )}

      <form action={action} className="flex flex-col gap-6">
        <input type="hidden" name="role" value="admin" />

        <div>
          <label className="text-xs text-[#7A9089] mb-1.5 block font-semibold uppercase tracking-wide">
            Email Address *
          </label>
          <input
            name="email" type="email" required
            placeholder="admin@hospital.com"
            className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50"
          />
          <p className="text-xs text-[#4A6058] mt-1.5">
            An invite email will be sent if they don&apos;t have an account yet.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Link href="/dashboard/staff"
            className="flex-1 text-center py-2.5 rounded-xl border border-white/10 text-sm text-[#7A9089] hover:text-white hover:border-white/20 transition-all">
            Cancel
          </Link>
          <button type="submit" disabled={pending}
            className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white text-sm font-bold transition-all">
            {pending ? 'Sending Invite…' : 'Send Invite'}
          </button>
        </div>
      </form>
    </div>
  )
}
