import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/notify-patient', () => ({ notifyPatient: vi.fn() }))
vi.mock('@/lib/appointment-checkin', () => ({ checkInAppointment: vi.fn() }))

const role = { current: 'ambulance_crew' }
vi.mock('@/lib/getHospitalContext', () => ({
  getHospitalContext: () => Promise.resolve({ adminRecord: { hospital_id: 'HOSP', role: role.current } }),
}))
const update = vi.fn()
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      ;['select', 'eq', 'in'].forEach(m => { b[m] = vi.fn(() => b) })
      b.update = vi.fn((r: unknown) => { update(r); return b })
      b.single = vi.fn(() => Promise.resolve({ data: { status: 'pending', hospital_id: 'HOSP', approval_status: 'pending_approval' }, error: null }))
      b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(ok)
      return b
    },
  }),
}))

const actions = await import('./actions')
const settings = await import('../settings/actions')

describe('dashboard server actions — role gates', () => {
  it.each(['ambulance_crew', 'specialist'])('%s cannot change appointment state', async (r) => {
    role.current = r
    await expect(actions.updateAppointmentStatus('a1', 'confirmed')).rejects.toThrow('Unauthorized')
    await expect(actions.approvePendingApprovalAppointment('a1')).rejects.toThrow('Unauthorized')
    await expect(actions.rejectPendingApprovalAppointment('a1')).rejects.toThrow('Unauthorized')
    expect(update).not.toHaveBeenCalled()
  })

  it('front desk can confirm a pending appointment', async () => {
    role.current = 'front_desk'
    // Gets past the role gate to the write (the mock then reports 0 rows, which the
    // action's own concurrency guard turns into a different error).
    const err = await actions.updateAppointmentStatus('a1', 'confirmed').catch((e: Error) => e)
    expect(err instanceof Error ? err.message : '').not.toBe('Unauthorized')
    expect(update).toHaveBeenCalled()
  })

  it.each(['front_desk', 'ambulance_crew', 'specialist'])('%s cannot edit the hospital profile or hours', async (r) => {
    role.current = r
    update.mockClear()
    await expect(settings.updateHospitalProfile(new FormData())).rejects.toThrow('Unauthorized')
    await expect(settings.upsertOperatingHours('HOSP', 1, '08:00', '17:00', false)).rejects.toThrow('Unauthorized')
    expect(update).not.toHaveBeenCalled()
  })
})
