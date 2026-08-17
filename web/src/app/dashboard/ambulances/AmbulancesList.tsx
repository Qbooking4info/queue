'use client'
import Link from 'next/link'
import { Ambulance, Phone, Clock, MapPin, AlertTriangle } from 'lucide-react'
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

export function AmbulancesList({ requests, canManageFleet }: { requests: TransportRow[]; canManageFleet: boolean }) {
  const { theme: C } = useTheme()
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
    <div style={{ padding: 24, maxWidth: 880, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8, color: C.text }}>
            <Ambulance size={22} color={C.red} /> Inbound Ambulances
          </h1>
          <p style={{ fontSize: 13, color: C.textSub, marginTop: 2 }}>
            Transport requests heading to this hospital, dispatched by Queue&apos;s ambulance network.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Alerts first: dispatcher_alerts records every request that found no
              ambulance, and until now nothing surfaced it. */}
          <Link href="/dashboard/ambulances/alerts"
            style={{ padding: '10px 16px', background: C.bgAlt, border: `1px solid ${C.borderMed}`, fontSize: 13, fontWeight: 600, borderRadius: 12, textDecoration: 'none', color: C.text }}>
            Alerts
          </Link>
          {canManageFleet && (
            <Link href="/dashboard/ambulances/coverage"
              style={{ padding: '10px 16px', background: C.bgAlt, border: `1px solid ${C.borderMed}`, fontSize: 13, fontWeight: 600, borderRadius: 12, textDecoration: 'none', color: C.text }}>
              Coverage
            </Link>
          )}
          {canManageFleet && (
            <Link href="/dashboard/ambulances/fleet"
              style={{ padding: '10px 16px', background: C.bgAlt, border: `1px solid ${C.borderMed}`, fontSize: 13, fontWeight: 600, borderRadius: 12, textDecoration: 'none', color: C.text }}>
              Manage Fleet
            </Link>
          )}
        </div>
      </div>

      {!active.length ? (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 64, textAlign: 'center', color: C.textMuted, marginBottom: 32 }}>
          <Ambulance size={36} style={{ margin: '0 auto 12px' }} />
          <div style={{ fontWeight: 600, color: C.textSub }}>No ambulances inbound right now</div>
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
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, border: `1px solid ${sc.border}`, background: sc.bg, color: sc.text, flexShrink: 0 }}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: C.textMuted, marginTop: 8 }}>{r.booking_ref}</div>
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
                  <div style={{ fontSize: 13, color: C.textSub }}>{r.booking_ref} · {r.symptom_description ?? '—'}</div>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 99, border: `1px solid ${sc.border}`, background: sc.bg, color: sc.text, flexShrink: 0 }}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
