import { getHospitalContext } from '@/lib/getHospitalContext'
import { createAdminClient } from '@/lib/supabase/admin'
import { saveAppointmentNotes } from '../actions'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { VideoCallPanel } from '@/components/video/VideoCallPanel'

const STATUS_OPTS = ['in_progress', 'completed', 'no_show']

export default async function AppointmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { adminRecord } = await getHospitalContext()

  if (adminRecord.role !== 'specialist' && adminRecord.role !== 'admin' && adminRecord.role !== 'owner') redirect('/dashboard')

  const db = createAdminClient()
  const { data: appt } = await db
    .from('appointments')
    .select('*, users(full_name, phone, email, date_of_birth, gender, blood_group, address), doctors(full_name, title), hospitals(name)')
    .eq('id', id)
    .eq('hospital_id', adminRecord.hospital_id)
    .single()

  if (!appt) redirect('/dashboard/specialist')

  const patient = Array.isArray(appt.users) ? appt.users[0] : appt.users
  const doctor  = Array.isArray(appt.doctors) ? appt.doctors[0] : appt.doctors

  const age = patient?.date_of_birth
    ? Math.floor((Date.now() - new Date(patient.date_of_birth).getTime()) / (365.25 * 24 * 3600 * 1000))
    : null

  return (
    <div className="flex-1 p-6 max-w-3xl mx-auto w-full">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/specialist" className="text-[#4A6058] hover:text-white transition-colors text-sm">← Schedule</Link>
        <span className="text-[#4A6058]">/</span>
        <span className="text-sm font-mono text-[#7A9089]">{appt.booking_ref}</span>
      </div>

      <div className="grid md:grid-cols-5 gap-4">
        {/* Patient Info */}
        <div className="md:col-span-2 flex flex-col gap-3">
          <div className="bg-[#111915] border border-white/7 rounded-2xl p-4">
            <h2 className="font-bold text-sm mb-3 text-[#7A9089] uppercase tracking-wide">Patient</h2>
            <div className="w-12 h-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center text-lg font-bold text-green-400 mb-3">
              {patient?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2) ?? '?'}
            </div>
            <div className="font-bold text-base">{patient?.full_name ?? '—'}</div>
            {age && <div className="text-sm text-[#7A9089] mt-0.5">{age} yrs · {patient?.gender ?? '—'}</div>}
            <div className="mt-3 flex flex-col gap-1.5 text-xs text-[#7A9089]">
              {patient?.phone && <div>📞 {patient.phone}</div>}
              {patient?.email && <div>✉️ {patient.email}</div>}
              {patient?.blood_group && <div>🩸 {patient.blood_group}</div>}
              {patient?.address && <div>📍 {patient.address}</div>}
            </div>
          </div>

          <div className="bg-[#111915] border border-white/7 rounded-2xl p-4">
            <h2 className="font-bold text-sm mb-3 text-[#7A9089] uppercase tracking-wide">Appointment</h2>
            <div className="flex flex-col gap-1.5 text-sm">
              {[
                { label: 'Date',   value: appt.appointment_date },
                { label: 'Time',   value: appt.start_time?.slice(0, 5) },
                { label: 'Type',   value: appt.type },
                { label: 'Status', value: appt.status?.replace(/_/g, ' ') },
                { label: 'Doctor', value: `${doctor?.title} ${doctor?.full_name}` },
              ].map(r => (
                <div key={r.label} className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-[#4A6058]">{r.label}</span>
                  <span className="capitalize font-medium">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Notes Form */}
        <div className="md:col-span-3 flex flex-col gap-4">

          {/* Virtual call panel — shown only for virtual appointments */}
          {appt.type === 'virtual' && (
            <VideoCallPanel
              appointmentId={appt.id}
              patientName={patient?.full_name ?? 'Patient'}
            />
          )}

          <form action={saveAppointmentNotes} className="flex flex-col gap-4">
            <input type="hidden" name="appointment_id" value={appt.id} />

            <div className="bg-[#111915] border border-white/7 rounded-2xl p-5">
              <h2 className="font-bold mb-4">Clinical Notes</h2>

              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs text-[#7A9089] mb-1.5 block">Diagnosis</label>
                  <input
                    name="diagnosis"
                    defaultValue={appt.diagnosis ?? ''}
                    placeholder="Primary diagnosis..."
                    className="w-full bg-[#0A0F0D] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#7A9089] mb-1.5 block">Doctor Notes</label>
                  <textarea
                    name="doctor_notes"
                    defaultValue={appt.doctor_notes ?? ''}
                    rows={5}
                    placeholder="Clinical observations, treatment plan, follow-up instructions..."
                    className="w-full bg-[#0A0F0D] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50 resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#7A9089] mb-1.5 block">Prescription URL</label>
                  <input
                    name="prescription_url"
                    defaultValue={appt.prescription_url ?? ''}
                    placeholder="https://... (link to prescription file)"
                    className="w-full bg-[#0A0F0D] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50"
                  />
                </div>

                <div>
                  <label className="text-xs text-[#7A9089] mb-1.5 block">Update Status</label>
                  <select
                    name="status"
                    defaultValue={appt.status}
                    className="w-full bg-[#0A0F0D] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-green-500/50">
                    <option value="">— Keep current ({appt.status.replace(/_/g, ' ')}) —</option>
                    {STATUS_OPTS.filter(s => s !== appt.status).map(s => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <button type="submit"
              className="w-full py-3 bg-green-500 hover:bg-green-400 text-white font-bold text-sm rounded-xl transition-all">
              Save Notes & Update Status
            </button>
          </form>
        </div>   {/* end md:col-span-3 */}
      </div>
    </div>
  )
}
