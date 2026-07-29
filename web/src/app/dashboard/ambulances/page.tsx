import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Ambulance, Phone, Clock, MapPin, AlertTriangle } from 'lucide-react'
import { getHospitalContext } from '@/lib/getHospitalContext'
import { safePatientName } from '@/lib/dashboard-utils'
import { AutoRefreshAmbulances } from './AutoRefreshAmbulances'

export const dynamic = 'force-dynamic'

const STATUS_COLOR: Record<string, string> = {
  requested:               'text-amber-400 bg-amber-500/10 border-amber-500/20',
  scheduled:               'text-amber-400 bg-amber-500/10 border-amber-500/20',
  searching:               'text-amber-400 bg-amber-500/10 border-amber-500/20',
  matched:                 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  en_route_to_patient:     'text-blue-400 bg-blue-500/10 border-blue-500/20',
  on_scene:                'text-blue-400 bg-blue-500/10 border-blue-500/20',
  transporting:            'text-green-400 bg-green-500/10 border-green-500/20',
  arrived_at_destination:  'text-green-400 bg-green-500/10 border-green-500/20',
  completed:               'text-gray-500 bg-white/5 border-white/10',
  cancelled_by_requester:  'text-red-400 bg-red-500/10 border-red-500/20',
  cancelled_by_provider:   'text-red-400 bg-red-500/10 border-red-500/20',
  no_unit_available:       'text-red-400 bg-red-500/10 border-red-500/20',
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

// Active = anything not yet closed out. Shown above the completed/cancelled history.
const ACTIVE_STATUSES = [
  'requested', 'scheduled', 'searching', 'matched',
  'en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination',
]

function triageBadge(level: number | null) {
  if (level == null) return null
  const color = level <= 2 ? 'text-red-400 bg-red-500/10 border-red-500/20'
    : level === 3 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-gray-400 bg-white/5 border-white/10'
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${color}`}>
      Triage {level}
    </span>
  )
}

function formatEta(seconds: number | null): string {
  if (seconds == null) return '—'
  const mins = Math.round(seconds / 60)
  if (mins <= 1) return 'Arriving now'
  return `~${mins} min`
}

export default async function AmbulancesPage() {
  const { db, adminRecord } = await getHospitalContext()

  if (!['admin', 'owner', 'front_desk'].includes(adminRecord.role ?? '')) redirect('/dashboard')

  const { data: requestsRaw } = await db
    .from('transport_requests')
    .select(`
      id, booking_ref, status, request_type, triage_level, symptom_description,
      eta_seconds, eta_updated_at, pickup_address, contact_phone, caller_patient_name,
      created_at, matched_at,
      patient:users!transport_requests_patient_id_fkey(full_name),
      dependent:dependents(full_name),
      unit:ambulances(plate_number, call_sign, vehicle_tier, provider:ambulance_providers(name))
    `)
    .eq('destination_hospital_id', adminRecord.hospital_id)
    .order('created_at', { ascending: false })
    .limit(50)

  const requests = requestsRaw ?? []
  const active = requests.filter(r => ACTIVE_STATUSES.includes(r.status))
  const history = requests.filter(r => !ACTIVE_STATUSES.includes(r.status))

  return (
    <div className="flex-1 p-6 max-w-4xl mx-auto w-full">
      <AutoRefreshAmbulances hospitalId={adminRecord.hospital_id} />
      <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Ambulance size={22} className="text-red-400" /> Inbound Ambulances
          </h1>
          <p className="text-sm text-[#7A9089] mt-0.5">
            Transport requests heading to this hospital, dispatched by Queue&apos;s ambulance network.
          </p>
        </div>
        {(adminRecord.role === 'admin' || adminRecord.role === 'owner') && (
          <Link href="/dashboard/ambulances/fleet"
            className="px-4 py-2 bg-white/5 border border-white/10 hover:border-white/20 text-sm font-semibold rounded-xl transition-all">
            Manage Fleet
          </Link>
        )}
      </div>

      {!active.length ? (
        <div className="bg-[#111915] border border-white/7 rounded-2xl p-16 text-center text-[#4A6058] mb-8">
          <Ambulance size={36} className="mx-auto mb-3" />
          <div className="font-medium text-[#7A9089]">No ambulances inbound right now</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 mb-8">
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
            return (
              <div key={r.id} className={`rounded-2xl p-4 border ${isCritical ? 'bg-red-500/8 border-red-500/30' : 'bg-[#111915] border-white/7'}`}>
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-semibold">{name}</div>
                      {triageBadge(r.triage_level)}
                      {isCritical && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 border border-red-500/30 text-red-400 inline-flex items-center gap-1">
                          <AlertTriangle size={10} /> CRITICAL
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#7A9089] mt-1">{r.symptom_description ?? 'No condition details provided'}</div>
                    <div className="text-xs text-[#4A6058] mt-1 flex items-center gap-3 flex-wrap">
                      {r.contact_phone && <span className="flex items-center gap-1"><Phone size={11} /> {r.contact_phone}</span>}
                      {r.pickup_address && <span className="flex items-center gap-1"><MapPin size={11} /> {r.pickup_address}</span>}
                      <span className="flex items-center gap-1"><Clock size={11} /> ETA {formatEta(r.eta_seconds)}</span>
                    </div>
                    {unit && (
                      <div className="text-xs text-[#4A6058] mt-1">
                        {provider?.name ?? 'Ambulance'} · {unit.call_sign ?? unit.plate_number} · {unit.vehicle_tier}
                      </div>
                    )}
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${STATUS_COLOR[r.status] ?? 'text-gray-400 bg-white/5 border-white/10'}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <div className="text-[11px] text-[#4A6058] mt-2">{r.booking_ref}</div>
              </div>
            )
          })}
        </div>
      )}

      {!!history.length && (
        <>
          <h2 className="text-sm font-semibold text-[#7A9089] mb-3">Recent history</h2>
          <div className="flex flex-col gap-2">
            {history.map(r => (
              <div key={r.id} className="rounded-2xl p-3 border bg-[#111915] border-white/7 flex items-center justify-between gap-2">
                <div className="text-sm text-[#7A9089]">{r.booking_ref} · {r.symptom_description ?? '—'}</div>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full border shrink-0 ${STATUS_COLOR[r.status] ?? 'text-gray-400 bg-white/5 border-white/10'}`}>
                  {STATUS_LABEL[r.status] ?? r.status}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
