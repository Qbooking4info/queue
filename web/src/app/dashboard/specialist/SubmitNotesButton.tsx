'use client'
import { useFormStatus } from 'react-dom'
import { Button } from '@/components/ui/button'

export function SubmitNotesButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" loading={pending} className="w-full">
      Save Notes & Update Status
    </Button>
  )
}
