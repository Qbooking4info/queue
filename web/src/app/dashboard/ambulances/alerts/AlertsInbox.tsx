'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Check, Clock, MapPin, Phone, ArrowLeft } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

interface Alert {
  id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  kind: string
  message: string
  created_at: string
  acknowledged_at: string | null
  request: {
    id: string
    booking_ref: string
    status: string
    triage_level: number | null
    symptom_description: string | null
    pickup_address: string | null
    contact_phone: string
    caller_patient_name: string | null
    created_at: string
    failure_reason: string | null
  } | null
  ack: { full_name: string } | null
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const KIND_LABEL: Record<string, string> = {
  no_unit_available: 'No ambulance found',
  tracking_stale: 'Crew position went stale',
}

export function AlertsInbox({ alerts }: { alerts: Alert[] }) {
  const { theme: C } = useTheme()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Unacknowledged first, then by severity, then newest. An open critical alert
  // should never be below a resolved one.
  const sorted = [...alerts].sort((a, b) => {
    const ackA = a.acknowledged_at ? 1 : 0
    const ackB = b.acknowledged_at ? 1 : 0
    if (ackA !== ackB) return ackA - ackB
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const open = sorted.filter(a => !a.acknowledged_at)
  const openCritical = open.filter(a => a.severity === 'critical').length

  async function acknowledge(id: string) {
    setBusy(id); setError('')
    try {
      const res = await fetch('/api/ambulances/alerts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertId: id }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        setError(b?.error ?? 'Could not acknowledge')
        return
      }
      router.refresh()
    } finally { setBusy(null) }
  }

  const colourFor = (s: Alert['severity']) =>
    s === 'critical' ? '#DC2626' : s === 'high' ? '#EA580C' : s === 'medium' ? '#CA8A04' : C.textMuted

  return (
    <div style={{ maxWidth: 900 }}>
      <Link href="/dashboard/ambulances" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.textSub, textDecoration: 'none', marginBottom: 16 }}>
        <ArrowLeft size={14} /> Ambulances
      </Link>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Dispatcher alerts</h1>
      <p style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>
        Raised when a search finds no ambulance, or when an assigned crew stops reporting its position.
      </p>

      {openCritical > 0 && (
        <div style={{ background: '#DC262614', border: '1.5px solid #DC262655', borderRadius: 12, padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
          <AlertTriangle size={16} color="#DC2626" />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#DC2626' }}>
            {openCritical} unacknowledged critical {openCritical === 1 ? 'alert' : 'alerts'} — a high-acuity request went unserved
          </span>
        </div>
      )}

      {error && <div style={{ fontSize: 12, color: C.red, marginBottom: 12 }}>{error}</div>}

      {sorted.length === 0 ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 40, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
          No alerts. Every transport request so far has found a unit.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sorted.map(a => {
            const col = colourFor(a.severity)
            const done = !!a.acknowledged_at
            return (
              <div key={a.id} style={{
                background: C.card,
                border: `1px solid ${done ? C.border : col + '55'}`,
                borderLeft: `3px solid ${done ? C.border : col}`,
                borderRadius: 14, padding: 16, opacity: done ? 0.65 : 1,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em', color: col, background: col + '18', border: `1px solid ${col}44`, borderRadius: 6, padding: '2px 7px' }}>
                        {a.severity}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                        {KIND_LABEL[a.kind] ?? a.kind}
                      </span>
                      {a.request?.triage_level != null && (
                        <span style={{ fontSize: 11, color: C.textSub }}>Triage {a.request.triage_level}</span>
                      )}
                      <span style={{ fontSize: 11, color: C.textMuted }}>· {ago(a.created_at)}</span>
                    </div>

                    <div style={{ fontSize: 12.5, color: C.textSub, marginTop: 6, lineHeight: 1.5 }}>{a.message}</div>

                    {a.request && (
                      <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: C.textSub }}>
                        <span style={{ fontWeight: 600, color: C.text }}>{a.request.booking_ref}</span>
                        {a.request.caller_patient_name && <span>{a.request.caller_patient_name}</span>}
                        {a.request.symptom_description && <span>{a.request.symptom_description}</span>}
                        {a.request.pickup_address && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <MapPin size={12} /> {a.request.pickup_address}
                          </span>
                        )}
                        <a href={`tel:${a.request.contact_phone}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.text, textDecoration: 'none', fontWeight: 600 }}>
                          <Phone size={12} /> {a.request.contact_phone}
                        </a>
                        {a.request.failure_reason && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Clock size={12} /> {a.request.failure_reason.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    )}

                    {done && (
                      <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>
                        Acknowledged{a.ack?.full_name ? ` by ${a.ack.full_name}` : ''} · {ago(a.acknowledged_at!)}
                      </div>
                    )}
                  </div>

                  {!done && (
                    <button
                      onClick={() => acknowledge(a.id)}
                      disabled={busy === a.id}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
                        fontSize: 12, fontWeight: 700, padding: '8px 12px', borderRadius: 10,
                        cursor: busy === a.id ? 'default' : 'pointer', opacity: busy === a.id ? 0.5 : 1,
                        color: C.text, background: C.bgAlt, border: `1px solid ${C.borderMed}`,
                      }}
                    >
                      <Check size={13} /> {busy === a.id ? '…' : 'Acknowledge'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
