'use client'
import { useState, useEffect, useCallback } from 'react'
import { Banknote, ShieldCheck, AlertTriangle, Trash2 } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

/**
 * Where this hospital's share of each payment settles.
 *
 * The account name is resolved from Paystack and shown for confirmation before
 * anything is created. A transposed digit here sends a hospital's revenue to a
 * stranger's account — Paystack pays whoever the number belongs to, and nothing
 * downstream would notice.
 */

interface Bank { name: string; code: string }
interface Existing { bankName: string | null; last4: string | null; subaccountCode: string | null }

export function PayoutAccount({ existing }: { existing: Existing }) {
  const { theme: C } = useTheme()
  const [banks, setBanks] = useState<Bank[]>([])
  const [bankCode, setBankCode] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [resolvedName, setResolvedName] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [disabled, setDisabled] = useState(false)
  const [current, setCurrent] = useState(existing)

  const load = useCallback(async () => {
    const res = await fetch('/api/payments/subaccount?banks=1')
    if (res.status === 503) { setDisabled(true); return }
    if (res.ok) setBanks((await res.json()).banks ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  // Resolve as soon as a full account number and bank are present — the admin
  // should see the name before they can save, not after.
  useEffect(() => {
    setResolvedName(null); setError('')
    if (!/^\d{10}$/.test(accountNumber) || !bankCode) return
    let cancelled = false
    setResolving(true)
    fetch(`/api/payments/subaccount?accountNumber=${accountNumber}&bankCode=${bankCode}`)
      .then(async r => {
        if (cancelled) return
        const b = await r.json().catch(() => null)
        if (!r.ok) { setError(b?.error ?? 'Could not verify that account'); return }
        setResolvedName(b.accountName)
      })
      .finally(() => { if (!cancelled) setResolving(false) })
    return () => { cancelled = true }
  }, [accountNumber, bankCode])

  async function save() {
    setSaving(true); setError('')
    const res = await fetch('/api/payments/subaccount', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bankCode, accountNumber }),
    })
    setSaving(false)
    const b = await res.json().catch(() => null)
    if (!res.ok) { setError(b?.error ?? 'Could not save the payout account'); return }
    setCurrent({ bankName: b.bankName, last4: b.last4, subaccountCode: b.subaccountCode })
    setAccountNumber(''); setBankCode(''); setResolvedName(null)
  }

  async function remove() {
    if (!confirm('Remove this payout account? Online payment will be turned off for this hospital — bookings continue, but patients pay at the desk.')) return
    const res = await fetch('/api/payments/subaccount', { method: 'DELETE' })
    if (res.ok) setCurrent({ bankName: null, last4: null, subaccountCode: null })
  }

  const input: React.CSSProperties = {
    width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`, borderRadius: 10,
    padding: '10px 12px', fontSize: 13, color: C.text, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  if (disabled) {
    return (
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Payout account</div>
        <div style={{ fontSize: 12, color: C.textSub }}>
          Online payment is not enabled on this platform yet. Patients currently pay at your front desk.
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginBottom: 4 }}>Payout account</div>
      <div style={{ fontSize: 12, color: C.textSub, marginBottom: 14 }}>
        Where your share of each payment settles. Queue takes the platform fee; the consultation fee
        goes straight to this account — it never passes through Queue.
      </div>

      {current.subaccountCode ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
          background: '#00A85410', border: '1px solid #00A85444', borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldCheck size={16} color="#00A854" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                {current.bankName ?? 'Bank account'} ····{current.last4}
              </div>
              <div style={{ fontSize: 11.5, color: C.textSub }}>Online payment is active for this hospital</div>
            </div>
          </div>
          <button onClick={remove}
            style={{ color: C.red, padding: 7, borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer' }}>
            <Trash2 size={15} />
          </button>
        </div>
      ) : (
        <>
          <div style={{ background: '#B4530914', border: '1px solid #B4530944', borderRadius: 10,
            padding: '10px 12px', marginBottom: 14, fontSize: 12, color: '#B45309', display: 'flex', gap: 8 }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              No payout account set, so patients cannot pay online for this hospital — they pay at your
              front desk. Add an account to accept payment at booking.
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
            <select style={input} value={bankCode} onChange={e => setBankCode(e.target.value)}>
              <option value="">Select bank…</option>
              {banks.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
            </select>
            <input style={input} placeholder="10-digit account number" inputMode="numeric" maxLength={10}
              value={accountNumber} onChange={e => setAccountNumber(e.target.value.replace(/\D/g, ''))} />
          </div>

          {resolving && <div style={{ fontSize: 12, color: C.textSub, marginTop: 10 }}>Checking account…</div>}

          {resolvedName && (
            <div style={{ marginTop: 12, background: C.bgAlt, border: `1px solid ${C.borderMed}`, borderRadius: 10, padding: '10px 12px' }}>
              <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>Account name</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.text, marginTop: 3 }}>{resolvedName}</div>
              <div style={{ fontSize: 11.5, color: C.textSub, marginTop: 5 }}>
                Confirm this is your hospital&apos;s account before saving. Payments settle here and cannot be recalled.
              </div>
            </div>
          )}

          {error && <div style={{ fontSize: 12, color: C.red, marginTop: 10 }}>{error}</div>}

          <button onClick={save} disabled={!resolvedName || saving}
            style={{
              marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 700, padding: '10px 16px', borderRadius: 10, border: 'none',
              cursor: resolvedName && !saving ? 'pointer' : 'default',
              background: resolvedName ? C.accent : C.bgAlt,
              color: resolvedName ? '#fff' : C.textMuted,
            }}>
            <Banknote size={14} /> {saving ? 'Saving…' : 'Save payout account'}
          </button>
        </>
      )}
    </div>
  )
}
