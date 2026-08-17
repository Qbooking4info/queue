'use client'
import Link from 'next/link'
import { ArrowLeft, MapPin, Radio, Users } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

interface Attempt {
  id: string
  round: number
  radius_m: number
  candidates_found: number
  candidates_after_filter: number
  reject_reasons: Record<string, number> | null
  offers_made: number
  nearest_unit_m: number | null
  active_units_total: number | null
  on_duty_units_total: number | null
  created_at: string
  request: {
    id: string
    booking_ref: string
    status: string
    triage_level: number | null
    pickup_address: string | null
  } | null
}

const REASON_LABEL: Record<string, string> = {
  tier_too_low: 'Crew/vehicle tier below what the call required',
  missing_capability: 'Missing required equipment',
  shift_too_short: 'Could not finish the job inside the shift',
  no_eta: 'No usable position for the unit',
}

const km = (m: number) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`

export function CoverageReport({ attempts, days }: { attempts: Attempt[]; days: number }) {
  const { theme: C } = useTheme()

  const unserved = attempts.filter(a => a.candidates_after_filter === 0)
  const nearestVals = unserved.map(a => a.nearest_unit_m).filter((n): n is number => n != null)
  const avgNearest = nearestVals.length ? nearestVals.reduce((s, n) => s + n, 0) / nearestVals.length : null
  const minNearest = nearestVals.length ? Math.min(...nearestVals) : null

  // Why did rounds fail? Two distinct buckets, and they mean different things.
  const noneInRange = unserved.filter(a => a.candidates_found === 0).length
  const allFiltered = unserved.filter(a => a.candidates_found > 0).length

  const reasonTally: Record<string, number> = {}
  for (const a of attempts) {
    for (const [k, v] of Object.entries(a.reject_reasons ?? {})) {
      reasonTally[k] = (reasonTally[k] ?? 0) + (typeof v === 'number' ? v : 0)
    }
  }

  const dutySamples = attempts.map(a => a.on_duty_units_total).filter((n): n is number => n != null)
  const avgOnDuty = dutySamples.length ? dutySamples.reduce((s, n) => s + n, 0) / dutySamples.length : null
  const activeTotal = attempts.find(a => a.active_units_total != null)?.active_units_total ?? null

  // The headline diagnosis. This is the sentence the operator actually needs.
  let diagnosis = ''
  if (attempts.length === 0) diagnosis = 'No dispatch rounds recorded yet — nothing to diagnose.'
  else if (unserved.length === 0) diagnosis = 'Every dispatch round found at least one usable unit.'
  else if (avgOnDuty !== null && avgOnDuty < 0.5 && activeTotal)
    diagnosis = `Adoption gap: ${activeTotal} unit(s) registered but almost none on duty when calls came in. The fleet exists; it is not signed on.`
  else if (avgNearest !== null && avgNearest > 10000)
    diagnosis = `Coverage gap: when a call went unserved, the nearest unit averaged ${km(avgNearest)} away. You need supply closer to these pickups.`
  else if (allFiltered > noneInRange)
    diagnosis = 'Capacity/clinical gap: units were in range but none were usable — see the rejection reasons below.'
  else
    diagnosis = 'Coverage gap: no units were within the search radius for most failed rounds.'

  const stat = (label: string, value: string, sub?: string) => (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 16, flex: '1 1 160px' }}>
      <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: C.text, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textSub, marginTop: 3 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ maxWidth: 980 }}>
      <Link href="/dashboard/ambulances" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: C.textSub, textDecoration: 'none', marginBottom: 16 }}>
        <ArrowLeft size={14} /> Ambulances
      </Link>

      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 4 }}>Coverage gaps</h1>
      <p style={{ fontSize: 13, color: C.textSub, marginBottom: 20 }}>
        What dispatch actually saw over the last {days} days. Use this to decide where to add supply.
      </p>

      <div style={{ background: C.bgAlt, border: `1px solid ${C.borderMed}`, borderRadius: 14, padding: '14px 16px', marginBottom: 18 }}>
        <div style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Diagnosis</div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.5 }}>{diagnosis}</div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        {stat('Rounds', String(attempts.length), `${unserved.length} found nothing usable`)}
        {stat('Nearest unit (failed rounds)', avgNearest !== null ? km(avgNearest) : '—', minNearest !== null ? `closest was ${km(minNearest)}` : 'no data')}
        {stat('Avg units on duty', avgOnDuty !== null ? avgOnDuty.toFixed(1) : '—', activeTotal !== null ? `of ${activeTotal} registered` : undefined)}
        {stat('Offers made', String(attempts.reduce((s, a) => s + a.offers_made, 0)), 'across all rounds')}
      </div>

      {unserved.length > 0 && (
        <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 18, marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 12 }}>Why rounds failed</div>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSub }}>
              <MapPin size={14} /> <strong style={{ color: C.text }}>{noneInRange}</strong> had no unit in radius at all
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.textSub }}>
              <Users size={14} /> <strong style={{ color: C.text }}>{allFiltered}</strong> had units nearby but none usable
            </div>
          </div>
          {Object.keys(reasonTally).length > 0 && (
            <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
              {Object.entries(reasonTally).sort((a, b) => b[1] - a[1]).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: C.textSub, padding: '5px 0' }}>
                  <span>{REASON_LABEL[k] ?? k}</span>
                  <strong style={{ color: C.text }}>{v}</strong>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
          Unserved rounds {unserved.length > 0 && <span style={{ color: C.textMuted, fontWeight: 500 }}>· newest first</span>}
        </div>
        {unserved.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: C.textMuted, fontSize: 13 }}>
            {attempts.length === 0
              ? 'No dispatch rounds recorded in this window.'
              : 'Nothing here — every round found a usable unit.'}
          </div>
        ) : (
          unserved.slice(0, 40).map(a => (
            <div key={a.id} style={{ padding: '12px 18px', borderBottom: `1px solid ${C.border}`, display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', fontSize: 12.5 }}>
              <span style={{ fontWeight: 700, color: C.text, minWidth: 110 }}>{a.request?.booking_ref ?? '—'}</span>
              {a.request?.triage_level != null && <span style={{ color: C.textSub }}>Triage {a.request.triage_level}</span>}
              <span style={{ color: C.textSub }}>round {a.round} · {km(a.radius_m)} radius</span>
              <span style={{ color: a.nearest_unit_m != null && a.nearest_unit_m > 10000 ? '#EA580C' : C.textSub, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Radio size={12} /> nearest {a.nearest_unit_m != null ? km(a.nearest_unit_m) : 'unknown'}
              </span>
              <span style={{ color: C.textMuted }}>{a.on_duty_units_total ?? 0} on duty</span>
              {a.request?.pickup_address && (
                <span style={{ color: C.textMuted, flex: 1, minWidth: 160, textAlign: 'right' }}>{a.request.pickup_address}</span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
