'use client'
import { useState, useEffect } from 'react'
import { useAdmin } from '@/contexts/AdminContext'

// Multi-clinic hospitals designate one clinic as their Emergency Department (the
// `is_emergency` flag used throughout booking); single-clinic hospitals use their
// own `emergency_hours` flag instead, since there's no separate clinic to check.
//
// Bed space is managed by the hospital's overall admin, or by clinic_admin/front_desk
// staff specifically assigned to that emergency clinic -- a sub-admin or front-desk
// officer scoped to an unrelated clinic (e.g. General Surgery) has no reason to see
// or touch it.
export function useEmergencyAccess() {
  const { hospital, role, clinicId } = useAdmin()
  const [emergencyCapable, setEmergencyCapable] = useState(false)
  const [emergencyClinicId, setEmergencyClinicId] = useState<string | null>(null)

  useEffect(() => {
    if (!hospital?.id) { setEmergencyCapable(false); setEmergencyClinicId(null); return }
    if (hospital.clinic_model !== 'multi') {
      setEmergencyCapable(hospital.emergency_hours === true)
      setEmergencyClinicId(null)
      return
    }
    let cancelled = false
    fetch(`/api/clinics?hospitalId=${hospital.id}`)
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        if (cancelled) return
        const er = ((list ?? []) as any[]).find(c => c.is_emergency)
        setEmergencyCapable(!!er)
        setEmergencyClinicId(er?.id ?? null)
      })
    return () => { cancelled = true }
  }, [hospital?.id, hospital?.clinic_model, hospital?.emergency_hours])

  const canManageBedSpace = !!hospital && emergencyCapable && (
    role === 'hospital_admin' || role === 'super_admin' ||
    ((role === 'clinic_admin' || role === 'front_desk') &&
      (hospital.clinic_model !== 'multi' || clinicId === emergencyClinicId))
  )

  return { emergencyCapable, emergencyClinicId, canManageBedSpace }
}
