'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Ambulance, Plus, Trash2, Users } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeContext'

const VEHICLE_TIERS = ['PTS', 'BLS', 'ALS', 'CCT']
const CAPABILITIES = ['oxygen', 'ventilator', 'incubator', 'bariatric', 'wheelchair']

interface CrewMember {
  id: string
  hospital_admin_id: string
  hospital_admins: { id: string; crew_role: string | null; crew_tier: string | null; users: { full_name: string } | { full_name: string }[] | null } | { id: string; crew_role: string | null; crew_tier: string | null; users: { full_name: string } | { full_name: string }[] | null }[] | null
}

interface Shift {
  id: string
  crew_tier: string
  starts_at: string
  ends_at: string
  ambulance_shift_crew: CrewMember[]
}

interface AmbulanceUnit {
  id: string
  plate_number: string
  call_sign: string | null
  vehicle_tier: string
  capabilities: string[]
  status: string
  is_active: boolean
  ambulance_shifts: Shift[]
}

interface Provider {
  id: string
  name: string
  contact_phone: string
  contact_email: string | null
  is_active: boolean
}

interface CrewOption {
  id: string
  crew_role: string | null
  crew_tier: string | null
  users: { full_name: string } | { full_name: string }[] | null
}

function crewName(row: CrewOption): string {
  const u = Array.isArray(row.users) ? row.users[0] : row.users
  return u?.full_name ?? 'Unnamed crew'
}

function toFormShift(m: CrewMember) {
  const ha = Array.isArray(m.hospital_admins) ? m.hospital_admins[0] : m.hospital_admins
  return { id: m.id, hospitalAdminId: m.hospital_admin_id, name: ha ? crewName(ha as CrewOption) : '—', tier: ha?.crew_tier ?? '—' }
}

export default function FleetPage() {
  const { theme: C } = useTheme()
  const [provider, setProvider]   = useState<Provider | null>(null)
  const [ambulances, setAmbulances] = useState<AmbulanceUnit[]>([])
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Setup form
  const [setupPhone, setSetupPhone] = useState('')
  const [setupEmail, setSetupEmail] = useState('')
  const [settingUp, setSettingUp] = useState(false)

  // Add ambulance form
  const [plateNumber, setPlateNumber] = useState('')
  const [callSign, setCallSign]       = useState('')
  const [vehicleTier, setVehicleTier] = useState('BLS')
  const [caps, setCaps]               = useState<string[]>([])
  const [address, setAddress]         = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [addingUnit, setAddingUnit] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [fleetRes, crewRes] = await Promise.all([
      fetch('/api/ambulances/fleet'),
      fetch('/api/ambulances/fleet/crew'),
    ])
    const fleet = await fleetRes.json()
    const crew = await crewRes.json()
    setProvider(fleet.provider)
    setAmbulances(fleet.ambulances ?? [])
    setCrewOptions(crew.crew ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSetup() {
    if (!setupPhone.trim()) { setError('Contact phone is required'); return }
    setSettingUp(true); setError('')
    const res = await fetch('/api/ambulances/fleet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactPhone: setupPhone, contactEmail: setupEmail || undefined }),
    })
    setSettingUp(false)
    if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.error ?? 'Failed to set up fleet'); return }
    await load()
  }

  async function geocodeAddress() {
    if (!address.trim()) return
    setGeocoding(true); setError('')
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(address)}`)
      const data = await res.json() as { lat: string; lon: string } | null
      if (!data) { setError('Address not found — try a more specific query'); return }
      setLat(parseFloat(data.lat)); setLng(parseFloat(data.lon))
    } finally {
      setGeocoding(false)
    }
  }

  async function handleAddUnit() {
    if (!plateNumber.trim()) { setError('Plate number is required'); return }
    if (lat == null || lng == null) { setError('Look up a home base address first'); return }
    setAddingUnit(true); setError('')
    const res = await fetch('/api/ambulances/fleet/units', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plateNumber, callSign: callSign || undefined, vehicleTier, capabilities: caps, lat, lng }),
    })
    setAddingUnit(false)
    if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.error ?? 'Failed to add unit'); return }
    setPlateNumber(''); setCallSign(''); setCaps([]); setAddress(''); setLat(null); setLng(null)
    await load()
  }

  async function removeUnit(id: string) {
    if (!confirm('Remove this ambulance? This cannot be undone.')) return
    const res = await fetch(`/api/ambulances/fleet/units/${id}`, { method: 'DELETE' })
    if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.error ?? 'Failed to remove unit'); return }
    await load()
  }

  async function addShift(ambulanceId: string, startsAt: string, endsAt: string, crewTier: string) {
    const res = await fetch('/api/ambulances/fleet/shifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ambulanceId, startsAt, endsAt, crewTier }),
    })
    if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.error ?? 'Failed to add shift'); return }
    await load()
  }

  async function removeShift(shiftId: string) {
    if (!confirm('Remove this shift?')) return
    const res = await fetch(`/api/ambulances/fleet/shifts/${shiftId}`, { method: 'DELETE' })
    if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.error ?? 'Failed to remove shift'); return }
    await load()
  }

  async function assignCrew(shiftId: string, hospitalAdminId: string) {
    const res = await fetch(`/api/ambulances/fleet/shifts/${shiftId}/crew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hospitalAdminId }),
    })
    if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.error ?? 'Failed to assign crew'); return }
    await load()
  }

  async function unassignCrew(shiftId: string, hospitalAdminId: string) {
    const res = await fetch(`/api/ambulances/fleet/shifts/${shiftId}/crew?hospitalAdminId=${hospitalAdminId}`, { method: 'DELETE' })
    if (!res.ok) { const b = await res.json().catch(() => null); setError(b?.error ?? 'Failed to remove crew'); return }
    await load()
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', background: C.bgAlt, border: `1px solid ${C.borderMed}`,
    borderRadius: 10, padding: '9px 12px', fontSize: 13, color: C.text,
    outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  const cardStyle: React.CSSProperties = {
    background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20,
  }

  if (loading) return <div style={{ padding: 24, color: C.textMuted }}>Loading…</div>

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <Link href="/dashboard/ambulances" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.textMuted, fontSize: 13, textDecoration: 'none' }}>
          <ArrowLeft size={14} /> Ambulances
        </Link>
        <span style={{ color: C.textMuted }}>/</span>
        <span style={{ fontSize: 13, color: C.text }}>Fleet</span>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: C.text }}>
        <Ambulance size={22} color={C.red} /> Your Fleet
      </h1>
      <p style={{ fontSize: 13, color: C.textSub, marginBottom: 24 }}>
        Manage your hospital&apos;s own ambulances, shifts, and crew. Invite crew members from the{' '}
        <Link href="/dashboard/staff/add" style={{ color: C.accent, textDecoration: 'underline' }}>Staff page</Link> first.
      </p>

      {error && (
        <div style={{ marginBottom: 24, padding: 14, borderRadius: 16, border: `1px solid ${C.red}4d`, background: C.redLight, fontSize: 13, color: C.red }}>
          {error}
        </div>
      )}

      {!provider ? (
        <div style={{ ...cardStyle, maxWidth: 420 }}>
          <h2 style={{ fontWeight: 600, marginBottom: 4, color: C.text }}>Set up your fleet</h2>
          <p style={{ fontSize: 12, color: C.textSub, marginBottom: 16 }}>This creates your hospital&apos;s own ambulance provider record.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input value={setupPhone} onChange={e => setSetupPhone(e.target.value)} placeholder="Contact phone *" style={inputStyle} />
            <input value={setupEmail} onChange={e => setSetupEmail(e.target.value)} placeholder="Contact email (optional)" style={inputStyle} />
            <button onClick={handleSetup} disabled={settingUp}
              style={{ padding: 12, borderRadius: 10, border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: settingUp ? 'not-allowed' : 'pointer', opacity: settingUp ? 0.6 : 1, fontFamily: 'inherit' }}>
              {settingUp ? 'Setting up…' : 'Set up fleet'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Add ambulance */}
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <h2 style={{ fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, color: C.text }}><Plus size={16} /> Add an ambulance</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <input value={plateNumber} onChange={e => setPlateNumber(e.target.value)} placeholder="Plate number *" style={inputStyle} />
              <input value={callSign} onChange={e => setCallSign(e.target.value)} placeholder="Call sign" style={inputStyle} />
            </div>
            <select value={vehicleTier} onChange={e => setVehicleTier(e.target.value)} style={{ ...inputStyle, marginBottom: 12 }}>
              {VEHICLE_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {CAPABILITIES.map(c => {
                const active = caps.includes(c)
                return (
                  <button key={c} type="button"
                    onClick={() => setCaps(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c])}
                    style={{
                      fontSize: 12, padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${active ? C.accentBorder : C.border}`,
                      background: active ? C.accentLight : C.bgAlt,
                      color: active ? C.accent : C.textSub,
                    }}>
                    {c}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Home base address" style={{ ...inputStyle, flex: 1 }} />
              <button onClick={geocodeAddress} disabled={geocoding}
                style={{ padding: '0 16px', borderRadius: 10, border: `1px solid ${C.borderMed}`, background: C.bgAlt, fontSize: 13, color: C.textSub, cursor: geocoding ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
                {geocoding ? '…' : 'Find'}
              </button>
            </div>
            {lat != null && lng != null && (
              <p style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>Location found: {lat.toFixed(4)}, {lng.toFixed(4)}</p>
            )}
            <button onClick={handleAddUnit} disabled={addingUnit}
              style={{ width: '100%', padding: 12, borderRadius: 10, border: 'none', background: C.accent, color: '#fff', fontSize: 13, fontWeight: 700, cursor: addingUnit ? 'not-allowed' : 'pointer', opacity: addingUnit ? 0.6 : 1, fontFamily: 'inherit' }}>
              {addingUnit ? 'Adding…' : 'Add ambulance'}
            </button>
          </div>

          {/* Units */}
          {ambulances.length === 0 ? (
            <div style={{ ...cardStyle, padding: 40, textAlign: 'center', color: C.textMuted }}>
              No ambulances yet — add your first one above.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {ambulances.map(a => (
                <UnitCard key={a.id} unit={a} crewOptions={crewOptions}
                  onRemoveUnit={removeUnit} onAddShift={addShift} onRemoveShift={removeShift}
                  onAssignCrew={assignCrew} onUnassignCrew={unassignCrew} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function UnitCard({ unit, crewOptions, onRemoveUnit, onAddShift, onRemoveShift, onAssignCrew, onUnassignCrew }: {
  unit: AmbulanceUnit
  crewOptions: CrewOption[]
  onRemoveUnit: (id: string) => void
  onAddShift: (ambulanceId: string, startsAt: string, endsAt: string, crewTier: string) => void
  onRemoveShift: (shiftId: string) => void
  onAssignCrew: (shiftId: string, hospitalAdminId: string) => void
  onUnassignCrew: (shiftId: string, hospitalAdminId: string) => void
}) {
  const { theme: C } = useTheme()
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt]     = useState('')
  const [shiftTier, setShiftTier] = useState(unit.vehicle_tier)

  const smallInputStyle: React.CSSProperties = {
    background: C.bgAlt, border: `1px solid ${C.borderMed}`, borderRadius: 10,
    padding: '8px 10px', fontSize: 12, color: C.text, outline: 'none', fontFamily: 'inherit',
  }

  return (
    <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 16, padding: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
        <div>
          <div style={{ fontWeight: 600, color: C.text }}>{unit.call_sign || unit.plate_number}</div>
          <div style={{ fontSize: 12, color: C.textSub }}>{unit.plate_number} · {unit.vehicle_tier} · {unit.status}</div>
          {unit.capabilities.length > 0 && (
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 4 }}>{unit.capabilities.join(', ')}</div>
          )}
        </div>
        <button onClick={() => onRemoveUnit(unit.id)}
          style={{ color: C.red, padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' }}>
          <Trash2 size={14} />
        </button>
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 12, marginTop: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Shifts</div>
        {unit.ambulance_shifts.length === 0 && <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 12 }}>No shifts scheduled.</div>}
        {unit.ambulance_shifts.map(shift => (
          <div key={shift.id} style={{ background: C.bgAlt, border: `1px solid ${C.border}`, borderRadius: 12, padding: 12, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: C.text }}>
                {new Date(shift.starts_at).toLocaleString()} &rarr; {new Date(shift.ends_at).toLocaleString()}
                <span style={{ color: C.textMuted }}> · {shift.crew_tier}</span>
              </div>
              <button onClick={() => onRemoveShift(shift.id)}
                style={{ color: C.red, padding: 4, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <Trash2 size={12} />
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {shift.ambulance_shift_crew.map(m => {
                const f = toFormShift(m)
                return (
                  <span key={m.id} style={{ fontSize: 12, background: C.card, border: `1px solid ${C.border}`, borderRadius: 99, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 6, color: C.text }}>
                    {f.name}
                    <button onClick={() => onUnassignCrew(shift.id, f.hospitalAdminId)}
                      style={{ color: C.red, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12 }}>&times;</button>
                  </span>
                )
              })}
            </div>
            <AssignCrewRow crewOptions={crewOptions} onAssign={id => onAssignCrew(shift.id, id)} />
          </div>
        ))}

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} style={{ ...smallInputStyle, flex: 1 }} />
          <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)} style={{ ...smallInputStyle, flex: 1 }} />
          <select value={shiftTier} onChange={e => setShiftTier(e.target.value)} style={smallInputStyle}>
            {VEHICLE_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            onClick={() => { if (startsAt && endsAt) { onAddShift(unit.id, new Date(startsAt).toISOString(), new Date(endsAt).toISOString(), shiftTier); setStartsAt(''); setEndsAt('') } }}
            style={{ padding: '0 12px', borderRadius: 10, border: `1px solid ${C.borderMed}`, background: C.bgAlt, fontSize: 12, color: C.textSub, whiteSpace: 'nowrap', cursor: 'pointer', fontFamily: 'inherit' }}>
            + Shift
          </button>
        </div>
      </div>
    </div>
  )
}

function AssignCrewRow({ crewOptions, onAssign }: { crewOptions: CrewOption[]; onAssign: (hospitalAdminId: string) => void }) {
  const { theme: C } = useTheme()
  const [selected, setSelected] = useState('')

  const smallInputStyle: React.CSSProperties = {
    background: C.card, border: `1px solid ${C.borderMed}`, borderRadius: 10,
    padding: '6px 10px', fontSize: 12, color: C.text, outline: 'none', fontFamily: 'inherit',
  }

  if (crewOptions.length === 0) {
    return <div style={{ fontSize: 12, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}><Users size={11} /> No crew invited yet</div>
  }
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      <select value={selected} onChange={e => setSelected(e.target.value)} style={{ ...smallInputStyle, flex: 1 }}>
        <option value="">Assign crew…</option>
        {crewOptions.map(c => <option key={c.id} value={c.id}>{crewName(c)} ({c.crew_tier})</option>)}
      </select>
      <button onClick={() => { if (selected) { onAssign(selected); setSelected('') } }}
        style={{ padding: '0 12px', borderRadius: 10, border: `1px solid ${C.borderMed}`, background: C.card, fontSize: 12, color: C.textSub, cursor: 'pointer', fontFamily: 'inherit' }}>
        Assign
      </button>
    </div>
  )
}
