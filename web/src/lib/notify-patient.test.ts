import { describe, it, expect, vi, beforeEach } from 'vitest'

// The two queue messages that cannot be missed ("you're next", "the doctor is
// ready") were push-only. A stale token, or a patient on 2G, meant the message
// was never delivered and nothing recorded that it hadn't been.
vi.mock('server-only', () => ({}))

const sendExpoPush = vi.fn()
vi.mock('./push', () => ({ sendExpoPush: (...a: unknown[]) => sendExpoPush(...a) }))

const sendPatientSms = vi.fn()
const smsConfigured = { current: true }
vi.mock('./patient-sms', () => ({
  sendPatientSms: (...a: unknown[]) => sendPatientSms(...a),
  patientSmsConfigured: () => smsConfigured.current,
}))

interface World {
  patient: { full_name: string; push_token: string | null; phone: string | null }
  caretaker: { caretaker_id: string; caretaker: { push_token: string | null; phone: string | null } } | null
}
const world: World = {
  patient: { full_name: 'Test Patient', push_token: 'ExpoTok', phone: '+2348000000001' },
  caretaker: null,
}

const inserted: Record<string, unknown>[] = []
const updates: { id: string; row: Record<string, unknown> }[] = []

function builder(table: string) {
  const b: Record<string, unknown> = { _table: table, _id: null as string | null }
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) {
    b[m] = vi.fn((...a: unknown[]) => {
      if (m === 'eq' && a[0] === 'id') b._id = a[1] as string
      return b
    })
  }
  b.single = async () => ({
    data: table === 'appointments'
      ? { patient_id: 'P1', booking_ref: 'TEST-REF' }
      : world.patient,
    error: null,
  })
  b.maybeSingle = async () => ({
    data: table === 'dependent_links' ? world.caretaker
      : table === 'notifications' ? { id: inserted.length ? `n${inserted.length}` : 'n1' }
      : null,
    error: null,
  })
  b.insert = vi.fn((rows: Record<string, unknown> | Record<string, unknown>[]) => {
    const list = Array.isArray(rows) ? rows : [rows]
    for (const r of list) inserted.push(r)
    const ids = list.map((_, i) => ({ id: `n${inserted.length - list.length + i + 1}`, user_id: list[i].user_id }))
    const after: Record<string, unknown> = {
      select: () => Object.assign(Promise.resolve({ data: ids, error: null }), {
        maybeSingle: async () => ({ data: ids[0], error: null }),
      }),
    }
    return after
  })
  b.update = vi.fn((row: Record<string, unknown>) => {
    const u: Record<string, unknown> = {}
    u.eq = vi.fn((_col: string, id: string) => { updates.push({ id, row }); return Promise.resolve({ error: null }) })
    return u
  })
  return b
}

const db = { from: vi.fn((t: string) => builder(t)) } as never

const { notifyPatient, notifyIncomingCall } = await import('./notify-patient')

const sentVia = (id: string) => updates.find(u => u.id === id)?.row.sent_via

beforeEach(() => {
  inserted.length = 0
  updates.length = 0
  sendExpoPush.mockReset().mockResolvedValue(true)
  sendPatientSms.mockReset().mockResolvedValue(true)
  smsConfigured.current = true
  world.patient = { full_name: 'Test Patient', push_token: 'ExpoTok', phone: '+2348000000001' }
  world.caretaker = null
})

const ring = () => notifyPatient(db, 'A1', 'queue_ring', 'Dr Test is ready for you',
  'Please make your way to the consultation room now.', { channelId: 'queue-calls', critical: true })

describe('critical queue notifications', () => {
  it('does not pay for SMS when the push lands', async () => {
    await ring()
    expect(sendExpoPush).toHaveBeenCalled()
    expect(sendPatientSms).not.toHaveBeenCalled()
    expect(sentVia('n1')).toEqual(['in_app', 'push'])
  })

  it('texts the patient when the push is refused by Expo', async () => {
    sendExpoPush.mockResolvedValue(false)
    await ring()
    expect(sendPatientSms).toHaveBeenCalledWith(
      '+2348000000001',
      'Queue: Dr Test is ready for you. Please make your way to the consultation room now.',
    )
    expect(sentVia('n1')).toEqual(['in_app', 'sms'])
  })

  it('texts a patient who has no push token at all', async () => {
    world.patient.push_token = null
    await ring()
    expect(sendExpoPush).not.toHaveBeenCalled()
    expect(sendPatientSms).toHaveBeenCalled()
  })

  it('records in_app only when neither channel reached them', async () => {
    sendExpoPush.mockResolvedValue(false)
    sendPatientSms.mockResolvedValue(false)
    await ring()
    // Nothing is written back, so sent_via stays the optimistic ['in_app'] the
    // insert carried -- but no channel is ever claimed that did not work.
    expect(updates).toEqual([])
    expect(inserted[0].sent_via).toEqual(['in_app'])
  })

  it('never texts for a routine notification', async () => {
    sendExpoPush.mockResolvedValue(false)
    await notifyPatient(db, 'A1', 'confirmed', 'Booking Approved', 'See you Tuesday.')
    expect(sendPatientSms).not.toHaveBeenCalled()
  })

  it('leaves SMS alone when no gateway is configured', async () => {
    smsConfigured.current = false
    sendExpoPush.mockResolvedValue(false)
    await ring()
    expect(sendPatientSms).not.toHaveBeenCalled()
  })

  it('reaches a dependent caretaker by SMS on their own number', async () => {
    world.patient.push_token = null
    world.caretaker = { caretaker_id: 'C1', caretaker: { push_token: null, phone: '+2348000000002' } }
    await ring()
    const numbers = sendPatientSms.mock.calls.map(c => c[0])
    expect(numbers).toEqual(['+2348000000001', '+2348000000002'])
    // The caretaker's copy is labelled with the dependent's first name.
    expect(sendPatientSms.mock.calls[1][1]).toContain('Test: Dr Test is ready for you')
  })
})

describe('virtual consultation ring', () => {
  it('falls back to SMS so the doctor is not left waiting alone', async () => {
    sendExpoPush.mockResolvedValue(false)
    await notifyIncomingCall(db, 'A1', 'Dr Test')
    expect(sendPatientSms).toHaveBeenCalledWith(
      '+2348000000001',
      'Queue: Incoming consultation. Dr Test is ready for your consultation',
    )
    expect(sentVia('n1')).toEqual(['in_app', 'sms'])
  })

  it('rings on the calls channel', async () => {
    await notifyIncomingCall(db, 'A1', 'Dr Test')
    expect(sendExpoPush.mock.calls[0][6]).toEqual({ channelId: 'queue-calls' })
  })
})
