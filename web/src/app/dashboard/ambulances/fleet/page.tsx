'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Ambulance, Plus, Trash2, Users } from 'lucide-react'

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

  if (loading) return <div className="flex-1 p-6 text-[#7A9089]">Loading…</div>

  return (
    <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/ambulances" className="inline-flex items-center gap-1 text-[#4A6058] hover:text-white transition-colors text-sm">
          <ArrowLeft size={14} /> Ambulances
        </Link>
        <span className="text-[#4A6058]">/</span>
        <span className="text-sm">Fleet</span>
      </div>

      <h1 className="text-2xl font-bold flex items-center gap-2 mb-2">
        <Ambulance size={22} className="text-red-400" /> Your Fleet
      </h1>
      <p className="text-sm text-[#7A9089] mb-6">
        Manage your hospital&apos;s own ambulances, shifts, and crew. Invite crew members from the{' '}
        <Link href="/dashboard/staff/add" className="underline underline-offset-2">Staff page</Link> first.
      </p>

      {error && (
        <div className="mb-6 p-4 rounded-2xl border border-red-500/30 bg-red-500/8 text-sm text-red-400">{error}</div>
      )}

      {!provider ? (
        <div className="bg-[#111915] border border-white/7 rounded-2xl p-6 max-w-md">
          <h2 className="font-semibold mb-1">Set up your fleet</h2>
          <p className="text-xs text-[#7A9089] mb-4">This creates your hospital&apos;s own ambulance provider record.</p>
          <div className="flex flex-col gap-3">
            <input value={setupPhone} onChange={e => setSetupPhone(e.target.value)} placeholder="Contact phone *"
              className="bg-[#0b0f0d] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50" />
            <input value={setupEmail} onChange={e => setSetupEmail(e.target.value)} placeholder="Contact email (optional)"
              className="bg-[#0b0f0d] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50" />
            <button onClick={handleSetup} disabled={settingUp}
              className="py-2.5 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white text-sm font-bold transition-all">
              {settingUp ? 'Setting up…' : 'Set up fleet'}
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Add ambulance */}
          <div className="bg-[#111915] border border-white/7 rounded-2xl p-5 mb-6">
            <h2 className="font-semibold mb-4 flex items-center gap-2"><Plus size={16} /> Add an ambulance</h2>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input value={plateNumber} onChange={e => setPlateNumber(e.target.value)} placeholder="Plate number *"
                className="bg-[#0b0f0d] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50" />
              <input value={callSign} onChange={e => setCallSign(e.target.value)} placeholder="Call sign"
                className="bg-[#0b0f0d] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50" />
            </div>
            <select value={vehicleTier} onChange={e => setVehicleTier(e.target.value)}
              className="w-full mb-3 bg-[#0b0f0d] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50">
              {VEHICLE_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <div className="flex flex-wrap gap-2 mb-3">
              {CAPABILITIES.map(c => (
                <button key={c} type="button"
                  onClick={() => setCaps(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c])}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    caps.includes(c) ? 'bg-green-500/15 border-green-500/40 text-green-400' : 'bg-white/5 border-white/10 text-[#7A9089]'
                  }`}>
                  {c}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mb-3">
              <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Home base address"
                className="flex-1 bg-[#0b0f0d] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50" />
              <button onClick={geocodeAddress} disabled={geocoding}
                className="px-4 rounded-xl bg-white/5 border border-white/10 text-sm text-[#7A9089] hover:text-white transition-all">
                {geocoding ? '…' : 'Find'}
              </button>
            </div>
            {lat != null && lng != null && (
              <p className="text-xs text-[#4A6058] mb-3">Location found: {lat.toFixed(4)}, {lng.toFixed(4)}</p>
            )}
            <button onClick={handleAddUnit} disabled={addingUnit}
              className="w-full py-2.5 rounded-xl bg-green-500 hover:bg-green-400 disabled:opacity-50 text-white text-sm font-bold transition-all">
              {addingUnit ? 'Adding…' : 'Add ambulance'}
            </button>
          </div>

          {/* Units */}
          {ambulances.length === 0 ? (
            <div className="bg-[#111915] border border-white/7 rounded-2xl p-10 text-center text-[#4A6058]">
              No ambulances yet — add your first one above.
            </div>
          ) : (
            <div className="flex flex-col gap-4">
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
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt]     = useState('')
  const [shiftTier, setShiftTier] = useState(unit.vehicle_tier)

  return (
    <div className="bg-[#111915] border border-white/7 rounded-2xl p-5">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="font-semibold">{unit.call_sign || unit.plate_number}</div>
          <div className="text-xs text-[#7A9089]">{unit.plate_number} · {unit.vehicle_tier} · {unit.status}</div>
          {unit.capabilities.length > 0 && (
            <div className="text-xs text-[#4A6058] mt-1">{unit.capabilities.join(', ')}</div>
          )}
        </div>
        <button onClick={() => onRemoveUnit(unit.id)} className="text-red-400 hover:text-red-300 p-1.5 rounded-lg hover:bg-red-500/10">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="border-t border-white/7 pt-3 mt-3">
        <div className="text-xs font-semibold text-[#7A9089] uppercase tracking-wide mb-2">Shifts</div>
        {unit.ambulance_shifts.length === 0 && <div className="text-xs text-[#4A6058] mb-3">No shifts scheduled.</div>}
        {unit.ambulance_shifts.map(shift => (
          <div key={shift.id} className="bg-[#0b0f0d] border border-white/7 rounded-xl p-3 mb-2">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs">
                {new Date(shift.starts_at).toLocaleString()} &rarr; {new Date(shift.ends_at).toLocaleString()}
                <span className="text-[#4A6058]"> · {shift.crew_tier}</span>
              </div>
              <button onClick={() => onRemoveShift(shift.id)} className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/10">
                <Trash2 size={12} />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {shift.ambulance_shift_crew.map(m => {
                const f = toFormShift(m)
                return (
                  <span key={m.id} className="text-xs bg-white/5 border border-white/10 rounded-full px-2.5 py-1 inline-flex items-center gap-1.5">
                    {f.name}
                    <button onClick={() => onUnassignCrew(shift.id, f.hospitalAdminId)} className="text-red-400 hover:text-red-300">&times;</button>
                  </span>
                )
              })}
            </div>
            <AssignCrewRow crewOptions={crewOptions} onAssign={id => onAssignCrew(shift.id, id)} />
          </div>
        ))}

        <div className="flex gap-2 mt-2">
          <input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)}
            className="flex-1 bg-[#0b0f0d] border border-white/10 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-500/50" />
          <input type="datetime-local" value={endsAt} onChange={e => setEndsAt(e.target.value)}
            className="flex-1 bg-[#0b0f0d] border border-white/10 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-500/50" />
          <select value={shiftTier} onChange={e => setShiftTier(e.target.value)}
            className="bg-[#0b0f0d] border border-white/10 rounded-xl px-2 py-2 text-xs focus:outline-none focus:border-green-500/50">
            {VEHICLE_TIERS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button
            onClick={() => { if (startsAt && endsAt) { onAddShift(unit.id, new Date(startsAt).toISOString(), new Date(endsAt).toISOString(), shiftTier); setStartsAt(''); setEndsAt('') } }}
            className="px-3 rounded-xl bg-white/5 border border-white/10 text-xs text-[#7A9089] hover:text-white whitespace-nowrap">
            + Shift
          </button>
        </div>
      </div>
    </div>
  )
}

function AssignCrewRow({ crewOptions, onAssign }: { crewOptions: CrewOption[]; onAssign: (hospitalAdminId: string) => void }) {
  const [selected, setSelected] = useState('')
  if (crewOptions.length === 0) {
    return <div className="text-xs text-[#4A6058] flex items-center gap-1"><Users size={11} /> No crew invited yet</div>
  }
  return (
    <div className="flex gap-2">
      <select value={selected} onChange={e => setSelected(e.target.value)}
        className="flex-1 bg-[#0b0f0d] border border-white/10 rounded-xl px-2 py-1.5 text-xs focus:outline-none focus:border-green-500/50">
        <option value="">Assign crew…</option>
        {crewOptions.map(c => <option key={c.id} value={c.id}>{crewName(c)} ({c.crew_tier})</option>)}
      </select>
      <button onClick={() => { if (selected) { onAssign(selected); setSelected('') } }}
        className="px-3 rounded-xl bg-white/5 border border-white/10 text-xs text-[#7A9089] hover:text-white">
        Assign
      </button>
    </div>
  )
}
