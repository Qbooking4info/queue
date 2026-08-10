import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
vi.mock('server-only', () => ({}))
import { createHmac } from 'crypto'
const { verifyWebhookSignature, buildReference, paystackConfigured } = await import('./paystack')

// The webhook endpoint is the only thing that believes a payment happened. If
// signature verification is wrong in either direction the consequences are
// severe: too loose and the URL becomes a public API for marking bookings paid;
// too strict and real payments never confirm.

const SECRET = 'sk_test_abc123'
beforeEach(() => { process.env.PAYSTACK_SECRET_KEY = SECRET })
afterEach(() => { delete process.env.PAYSTACK_SECRET_KEY })

const sign = (body: string, key = SECRET) =>
  createHmac('sha512', key).update(body).digest('hex')

describe('webhook signature', () => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference: 'QUE-1' } })

  it('accepts a correctly signed body', () => {
    expect(verifyWebhookSignature(body, sign(body))).toBe(true)
  })

  it('rejects a body signed with a different key', () => {
    expect(verifyWebhookSignature(body, sign(body, 'sk_test_wrong'))).toBe(false)
  })

  it('rejects a tampered body under a valid signature', () => {
    const sig = sign(body)
    const tampered = JSON.stringify({ event: 'charge.success', data: { reference: 'QUE-2' } })
    expect(verifyWebhookSignature(tampered, sig)).toBe(false)
  })

  it('rejects a missing signature header', () => {
    expect(verifyWebhookSignature(body, null)).toBe(false)
  })

  it('rejects an empty signature', () => {
    expect(verifyWebhookSignature(body, '')).toBe(false)
  })

  it('rejects a truncated signature rather than matching on a prefix', () => {
    expect(verifyWebhookSignature(body, sign(body).slice(0, 32))).toBe(false)
  })

  it('is sensitive to whitespace, since the raw body is what was signed', () => {
    // Re-serialising parsed JSON is the classic way this breaks in production.
    expect(verifyWebhookSignature(body + ' ', sign(body))).toBe(false)
  })
})

describe('references', () => {
  it('produces a unique reference per call', () => {
    const id = '11111111-2222-3333-4444-555555555555'
    expect(buildReference(id)).not.toBe(buildReference(id))
  })

  it('is traceable back to the appointment', () => {
    expect(buildReference('abcdef12-0000-0000-0000-000000000000')).toContain('abcdef12')
  })
})

describe('configuration gate', () => {
  it('reports unconfigured when the key is absent, so payment stays off', () => {
    delete process.env.PAYSTACK_SECRET_KEY
    expect(paystackConfigured()).toBe(false)
  })
  it('reports configured when the key is present', () => {
    expect(paystackConfigured()).toBe(true)
  })
})
