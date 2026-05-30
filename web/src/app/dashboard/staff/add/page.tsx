'use client'
import { useActionState, useState, useEffect } from 'react'
import Link from 'next/link'
import { addStaff } from '../actions'

const ROLES = [
  { value: 'specialist', label: 'Specialist',  icon: '👨‍⚕️', desc: 'View own schedule, add diagnosis and clinical notes' },
  { value: 'front_desk', label: 'Front Desk',  icon: '🖥️',  desc: 'Manage the patient queue, confirm and check-in patients' },
  { value: 'admin',      label: 'Admin',        icon: '⚙️',  desc: 'Full hospital access — settings, doctors, and staff' },
]

export default function AddStaffPage() {
  const [state, action, pending] = useActionState(addStaff, null)
  const [selectedRole, setSelectedRole] = useState('')

  return (
    <div className="flex-1 p-6 max-w-xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-8">
        <Link href="/dashboard/staff" className="text-[#4A6058] hover:text-white transition-colors text-sm">← Staff</Link>
        <span className="text-[#4A6058]">/</span>
        <span className="text-sm">Add Staff Member</span>
      </div>

      <h1 className="text-2xl font-bold mb-2">Add Staff Member</h1>
      <p className="text-sm text-[#7A9089] mb-8">
        The person must have an existing account on the Queue patient app. Their portal access uses the same login.
      </p>

      {state?.error && (
        <div className="mb-6 p-4 rounded-2xl border border-red-500/30 bg-red-500/8 text-sm text-red-400">
          {state.error}
        </div>
      )}

      <form action={action} className="flex flex-col gap-6">

        {/* Email */}
        <div>
          <label className="text-xs text-[#7A9089] mb-1.5 block font-semibold uppercase tracking-wide">
            Email Address *
          </label>
          <input
            name="email"
            type="email"
            required
            placeholder="staff@example.com"
            className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50"
          />
          <p className="text-xs text-[#4A6058] mt-1.5">
            Must match the email they used to register on the patient app
          </p>
        </div>

        {/* Role */}
        <div>
          <label className="text-xs text-[#7A9089] mb-3 block font-semibold uppercase tracking-wide">
            Role *
          </label>
          <div className="flex flex-col gap-2">
            {ROLES.map(r => (
              <label key={r.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  required
                  onChange={() => setSelectedRole(r.value)}
                  className="sr-only peer"
                />
                <div className="flex items-center gap-4 border border-white/10 rounded-xl px-4 py-3 peer-checked:border-green-500/50 peer-checked:bg-green-500/5 transition-all hover:border-white/20">
                  <span className="text-2xl shrink-0">{r.icon}</span>
                  <div>
                    <div className="text-sm font-semibold">{r.label}</div>
                    <div className="text-xs text-[#4A6058] mt-0.5">{r.desc}</div>
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Doctor link — only shown when Specialist selected */}
        {selectedRole === 'specialist' && (
          <div>
            <label className="text-xs text-[#7A9089] mb-1.5 block font-semibold uppercase tracking-wide">
              Doctor ID to Link (optional)
            </label>
            <input
              name="doctor_id"
              placeholder="Paste doctor record ID to link their schedule"
              className="w-full bg-[#111915] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50"
            />
            <p className="text-xs text-[#4A6058] mt-1.5">
              Links their login to a doctor record so they see their own appointments. Leave blank to set later.
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-2">
          <Link href="/dashboard/staff"
            className="flex-1 text-center py-2.5 rounded-xl border border-white/10 text-sm text-[#7A9089] hover:text-white hover:border-white/20 transition-all">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 py-2.5 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white text-sm font-bold transition-all">
            {pending ? 'Adding…' : 'Add Staff Member'}
          </button>
        </div>
      </form>
    </div>
  )
}
