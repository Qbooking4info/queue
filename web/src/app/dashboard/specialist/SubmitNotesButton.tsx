'use client'
import { useFormStatus } from 'react-dom'

export function SubmitNotesButton() {
  const { pending } = useFormStatus()
  return (
    <button type="submit" disabled={pending}
      className="w-full py-3 bg-green-500 hover:bg-green-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2">
      {pending ? (
        <><span className="animate-spin inline-block text-base">⏳</span> Saving…</>
      ) : (
        'Save Notes & Update Status'
      )}
    </button>
  )
}
