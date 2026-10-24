'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Ambulance, Phone, Clock, MapPin, AlertTriangle, Building2, CheckCircle2 } from 'lucide-react'
import { RequestAmbulanceModal } from './RequestAmbulanceModal'
import { useTheme } from '@/contexts/ThemeContext'
import { safePatientName } from '@/lib/dashboard-utils'

interface TransportRow {
  id: string
  booking_ref: string
  status: string
  triage_level: number | null
  symptom_description: string | null
  eta_seconds: number | null
  pickup_address: string | null
  contact_phone: string
  caller_patient_name: string | null
  disposition: string | null
  is_inbound: boolean
  is_own_fleet: boolean
  destination: { name: string } | { name: string }[] | null
  patient: { full_name: string } | { full_name: string }[] | null
  dependent: { full_name: string } | { full_name: string }[] | null
  unit: { plate_number: string; call_sign: string | null; vehicle_tier: string; provider: { name: string } | { name: string }[] | null } | { plate_number: string; call_sign: string | null; vehicle_tier: string; provider: { name: string } | { name: string }[] | null }[] | null
}

const STATUS_KEY: Record<string, 'amber' | 'blue' | 'accent' | 'red' | 'muted'> = {
  requested:               'amber',
  scheduled:               'amber',
  searching:               'amber',
  matched:                 'blue',
  en_route_to_patient:     'blue',
  on_scene:                'blue',
  transporting:            'accent',
  arrived_at_destination:  'accent',
  completed:               'muted',
  cancelled_by_requester:  'red',
  cancelled_by_provider:   'red',
  no_unit_available:       'red',
}

const STATUS_LABEL: Record<string, string> = {
  requested:              'Requested',
  scheduled:              'Scheduled',
  searching:              'Finding ambulance',
  matched:                'Crew assigned',
  en_route_to_patient:    'En route to patient',
  on_scene:               'Crew on scene',
  transporting:           'Transporting',
  arrived_at_destination: 'Arrived',
  completed:              'Completed',
  cancelled_by_requester: 'Cancelled by patient',
  cancelled_by_provider:  'Cancelled by provider',
  no_unit_available:      'No unit available',
}

const DISPOSITION_LABEL: Record<string, string> = {
  transported:             'Transported',
  treated_not_transported: 'Treated on scene',
  patient_refused:         'Patient refused',
  no_patient_found:        'No patient found',
  deceased_on_scene:       'Closed on scene',
  cancelled:               'Cancelled',
}

const ACTIVE_STATUSES = [
  'requested', 'scheduled', 'searching', 'matched',
  'en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination',
]

function formatEta(seconds: number | null): string {
  if (seconds == null) return '—'
  const mins = Math.round(seconds / 60)
  if (mins <= 1) return 'Arriving now'
  return `~${mins} min`
}

export function AmbulancesList({ requests, hospitalId, canManageFleet }: {
  requests: TransportRow[]; hospitalId: string; canManageFleet: boolean
}) {
  const { theme: C } = useTheme()
  const router = useRouter()
  const [requesting, setRequesting] = useState(false)
  const [receiving, setReceiving] = useState<string | null>(null)
  const [receiveError, setReceiveError] = useState<string | null>(null)

  async function receive(id: string) {
    setReceiving(id)
    setReceiveError(null)
    try {
      const res = await fetch('/api/ambulances/receive', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requestId: id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) setReceiveError(body.error ?? 'Could not confirm handover.')
      else router.refresh()
    } finally {
      setReceiving(null)
    }
  }

  function pill(label: string, color: string) {
    return (
      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, border: `1px solid ${color}33`, background: `${color}1a`, color, flexShrink: 0 }}>
        {label}
      </span>
    )
  }
  const active = requests.filter(r => ACTIVE_STATUSES.includes(r.status))
  const history = requests.filter(r => !ACTIVE_STATUSES.includes(r.status))

  function statusColors(status: string) {
    const key = STATUS_KEY[status] ?? 'muted'
    if (key === 'muted') return { text: C.textMuted, bg: C.bgAlt, border: C.border }
    return { text: C[key], bg: `${C[key]}1a`, border: `${C[key]}33` }
  }

  function triageBadge(level: number | null) {
    if (level == null) return null
    const color = level <= 2 ? C.red : level === 3 ? C.amber : C.textMuted
    return (
      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, border: `1px solid ${color}33`, background: `${color}1a`, color, flexShrink: 0 }}>
        Triage {level}
      </span>
    )
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 13, color: C.textMuted }}>Patients being brought here, and every job your own fleet is running</div>
          <h1 className="dash-greeting-title" style={{ margin: 0, color: C.text }}>Ambulance</h1>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Alerts first: dispatcher_alerts records every request that found no
              ambulance, and until now nothing surfaced it. */}
<button onClick={() => setRequesting(true)}
            style={{ padding: '10px 16px', background: C.accent, border: `1px solid ${C.accent}`, fontSize: 13, fontWeight: 700, borderRadius: 12, color: '#FFFFFF', cursor: 'pointer' }}>
            Request ambulance
          </button>
                    <Link href="/dashboard/ambulances/alerts"
            style={{ padding: '10px 16px', background: C.bgAlt, border: `1px solid ${C.borderMed}`, fontSize: 13, fontWeight: 600, borderRadius: 12, textDecoration: 'none', color: C.text }}>
            Alerts
          </Link>
          {/* Fleet and coverage management moved to Queue Ambulance's operator
              console, which is the only place ambulances are managed now --
              including for a hospital that owns its own fleet. This page keeps
              inbound patients and alerts, which are hospital work. */}
        </div>
      </div>

      {receiveError && (
        <div role="alert" style={{ marginBottom: 16, padding: 12, borderRadius: 12, border: `1px solid ${C.red}4d`, background: `${C.red}14`, color: C.red, fontSize: 13 }}>
          {receiveError}
        </div>
      )}

      {!active.length ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 64, textAlign: 'center', color: C.textMuted, marginBottom: 32 }}>
          <Ambulance size={36} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontWeight: 600, color: C.textSub }}>No active ambulance jobs right now</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 32 }}>
          {active.map(r => {
            const patient = Array.isArray(r.patient) ? r.patient[0] : r.patient
            const dependent = Array.isArray(r.dependent) ? r.dependent[0] : r.dependent
            const unit = Array.isArray(r.unit) ? r.unit[0] : r.unit
            const provider = unit ? (Array.isArray(unit.provider) ? unit.provider[0] : unit.provider) : null
            const name = safePatientName(
              patient?.full_name ?? dependent?.full_name ?? r.caller_patient_name,
              'Unregistered caller',
            )
            const isCritical = (r.triage_level ?? 5) <= 2
            const sc = statusColors(r.status)
            const destination = Array.isArray(r.destination) ? r.destination[0] : r.destination
            const canReceive = r.is_inbound && ['transporting', 'arrived_at_destination'].includes(r.status)
            return (
              <div key={r.id} style={{
                borderRadius: 16, padding: 16, border: `1px solid ${isCritical ? `${C.red}4d` : C.border}`,
                background: isCritical ? `${C.red}14` : C.card,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 600, color: C.text }}>{name}</div>
                      {triageBadge(r.triage_level)}
                      {r.is_inbound && pill('Inbound', C.accent)}
                      {r.is_own_fleet && pill('Your fleet', C.blue)}
                      {isCritical && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: `${C.red}26`, border: `1px solid ${C.red}4d`, color: C.red, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <AlertTriangle size={10} /> CRITICAL
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>{r.symptom_description ?? 'No condition details provided'}</div>
                    <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      {r.contact_phone && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Phone size={11} /> {r.contact_phone}</span>}
                      {r.pickup_address && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={11} /> {r.pickup_address}</span>}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Clock size={11} /> ETA {formatEta(r.eta_seconds)}</span>
                    </div>
                    {unit && (
                      <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>
                        {provider?.name ?? 'Ambulance'} · {unit.call_sign ?? unit.plate_number} · {unit.vehicle_tier}
                      </div>
                    )}
                    <div style={{ fontSize: 12, color: destination ? C.textMuted : C.amber, marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Building2 size={11} /> {destination?.name ?? 'Destination not chosen yet'}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, border: `1px solid ${sc.border}`, background: sc.bg, color: sc.text, flexShrink: 0 }}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{r.booking_ref}</div>
                  {canReceive && (
                    <button onClick={() => receive(r.id)} disabled={receiving === r.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, border: 'none',
                        background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: receiving === r.id ? 0.6 : 1 }}>
                      <CheckCircle2 size={14} /> {receiving === r.id ? 'Confirming…' : 'Patient received'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!!history.length && (
        <>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: C.textSub, marginBottom: 12 }}>Recent history</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {history.map(r => {
              const sc = statusColors(r.status)
              return (
                <div key={r.id} style={{ borderRadius: 16, padding: 12, border: `1px solid ${C.border}`, background: C.card, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 13, color: C.textSub }}>
                    {r.booking_ref} · {r.symptom_description ?? '—'}
                    {r.disposition && <span style={{ color: C.textMuted }}> · {DISPOSITION_LABEL[r.disposition] ?? r.disposition}</span>}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, border: `1px solid ${sc.border}`, background: sc.bg, color: sc.text, flexShrink: 0 }}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}

      {requesting && (
        <RequestAmbulanceModal
          C={C}
          hospitalId={hospitalId}
          onClose={bookingRef => { setRequesting(false); if (bookingRef) router.refresh() }}
        />
      )}
    </div>
  )
}
