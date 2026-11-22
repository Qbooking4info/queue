/**
 * Patient details -- what the doctor needs to know about the person before
 * reading today's note: who referred them, the vitals trend across the visits
 * this doctor has had with them, their allergies and their medication list.
 *
 * Scope note: the vitals history is built from THIS doctor's appointments with
 * this patient, because that is exactly what the doctor is allowed to read
 * (RLS: "Doctors can read appointment vitals" is scoped to their own
 * appointments). It is not the patient's whole chart, and the screen says so
 * rather than implying a complete record.
 */
import { useCallback, useState } from 'react'
import { View, ActivityIndicator, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { startConversation } from '@queue/shared/lib/chat'
import { getMedicalHistory, type MedicalHistory } from '@queue/shared/lib/api'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Stat, StatStrip,
  Btn, BottomBar, IconBtn, Empty, Initials, Mono, Pill, Notice, Chip,
} from '@queue/shared/components/q'

interface Props { navigation: any; route: { params: { appointmentId: string } } }

interface Appt {
  id: string
  appointment_date: string
  start_time: string | null
  status: string
  type: string
  urgency: string | null
  reason: string | null
  booking_ref: string | null
  diagnosis: string | null
  doctor_notes: string | null
  hospital_id: string
  patient_id: string | null
  walkin_patient_name: string | null
  walkin_patient_phone: string | null
  referral_reason: string | null
  patient: { id: string; full_name: string; phone: string | null; date_of_birth: string | null; gender: string | null; blood_group: string | null; patient_code?: string | null } | null
  referred_by: { full_name: string; title: string | null } | null
  referring_hospital: { name: string } | null
}

interface VitalPoint {
  recorded_at: string
  bp_systolic: number | null
  bp_diastolic: number | null
  weight_kg: number | null
  blood_sugar: number | null
}

function age(dob: string | null | undefined): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
  return a >= 0 && a < 130 ? a : null
}

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function PatientDetailsScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { doctorProfile } = useAuth()
  const { appointmentId } = route.params
  const [appt, setAppt] = useState<Appt | null>(null)
  const [vitals, setVitals] = useState<VitalPoint[]>([])
  const [history, setHistory] = useState<MedicalHistory | null>(null)
  const [historyFailed, setHistoryFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const { data } = await supabase
      .from('appointments')
      .select(`
        id, appointment_date, start_time, status, type, urgency, reason, booking_ref,
        diagnosis, doctor_notes, hospital_id, patient_id, walkin_patient_name, walkin_patient_phone,
        referral_reason,
        patient:users!appointments_patient_id_fkey(id, full_name, phone, date_of_birth, gender, blood_group, patient_code),
        referred_by:doctors!appointments_referred_by_doctor_id_fkey(full_name, title),
        referring_hospital:hospitals!appointments_referring_hospital_id_fkey(name)
      `)
      .eq('id', appointmentId)
      .single()

    const a = (data as any as Appt) ?? null
    setAppt(a)

    if (a?.patient_id && doctorProfile) {
      // Every appointment this doctor has had with this patient, then the
      // vitals recorded against them. Two queries rather than a join because
      // vitals_audit_log's RLS is written in terms of the appointment ids.
      const { data: mine } = await supabase
        .from('appointments')
        .select('id')
        .eq('patient_id', a.patient_id)
        .or(`doctor_id.eq.${doctorProfile.doctorId},assigned_doctor_id.eq.${doctorProfile.doctorId}`)
        .limit(60)
      const ids = ((mine as { id: string }[] | null) ?? []).map(r => r.id)
      if (ids.length) {
        const { data: v } = await supabase
          .from('vitals_audit_log')
          .select('recorded_at, bp_systolic, bp_diastolic, weight_kg, blood_sugar')
          .in('appointment_id', ids)
          .order('recorded_at', { ascending: true })
          .limit(60)
        setVitals(((v as VitalPoint[] | null) ?? []).filter(p => p.bp_systolic != null || p.blood_sugar != null || p.weight_kg != null))
      } else {
        setVitals([])
      }

      const h = await getMedicalHistory(a.patient_id)
      if (h.ok) { setHistory(h.data); setHistoryFailed(false) }
      else { setHistory(null); setHistoryFailed(true) }
    }
    setLoading(false)
  }, [appointmentId, doctorProfile])

  useFocusEffect(useCallback(() => { load() }, [load]))

  if (loading) {
    return (
      <Screen>
        <AppBar title="Patient details" onBack={() => navigation.goBack()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} size="large" />
        </View>
      </Screen>
    )
  }

  if (!appt) {
    return (
      <Screen>
        <AppBar title="Patient details" onBack={() => navigation.goBack()} />
        <Card style={{ marginTop: 12 }}>
          <Empty icon="person-outline" title="Patient not found"
            body="This appointment may have been cancelled or moved."
            action="Go back" onAction={() => navigation.goBack()} />
        </Card>
      </Screen>
    )
  }

  const name = appt.patient?.full_name ?? appt.walkin_patient_name ?? 'Patient'
  const phone = appt.patient?.phone ?? appt.walkin_patient_phone
  const a = age(appt.patient?.date_of_birth)
  const isEmergency = appt.urgency === 'emergency'
  const latest = vitals[vitals.length - 1] ?? null
  const bpPoints = vitals.filter(p => p.bp_systolic != null).slice(-10)
  const allergies = [
    ...(history?.allergies ?? []),
    ...(history?.otherAllergies ? [history.otherAllergies] : []),
  ].filter(Boolean)
  const conditions = [
    ...(history?.conditions ?? []),
    ...(history?.otherConditions ? [history.otherConditions] : []),
  ].filter(Boolean)
  const meds = (history?.medications ?? '').split(/\r?\n|,(?![^(]*\))/).map(s => s.trim()).filter(Boolean)

  async function message() {
    if (!appt?.patient?.id) return
    setBusy(true)
    const r = await startConversation('patient', appt.patient.id, appt.id)
    setBusy(false)
    if (r.ok) navigation.navigate('Chat', { conversationId: r.data })
    else { haptics.error(); Alert.alert('Messages', r.notReady ? 'Messaging is being switched on. Please check back soon.' : r.error) }
  }

  return (
    <Screen>
      <AppBar
        title="Patient details"
        sub={appt.booking_ref ?? undefined}
        onBack={() => navigation.goBack()}
        right={appt.patient?.id
          ? <IconBtn name="chatbubble-outline" label="Message patient" onPress={message} />
          : undefined} />

      <Body refreshControl={
        <RefreshControl refreshing={refreshing} tintColor={t.q.primary} colors={[t.q.primary]}
          onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false) }} />
      }>
        <Card style={{ marginTop: 12 }}>
          {!!appt.referred_by && (
            <>
              <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
                <CardLabel>
                  Referred from {appt.referring_hospital?.name ?? 'another hospital'}
                </CardLabel>
              </View>
            </>
          )}
          <Row
            leading={<Initials name={name} size={44} tint={isEmergency ? '#7F1D1D' : '#7C2D12'} />}
            title={[name, a != null ? String(a) : null].filter(Boolean).join(', ')}
            titleColor={isEmergency ? t.q.red : undefined}
            sub={[
              appt.patient?.gender,
              appt.patient?.blood_group ? `blood ${appt.patient.blood_group}` : null,
              appt.patient?.patient_code,
            ].filter(Boolean).join(' · ') || null}
            pill={isEmergency ? 'Critical' : appt.urgency === 'urgent' ? 'Urgent' : undefined}
            pillTone={isEmergency ? 'red' : 'amber'}
            pillSolid={isEmergency} />
          {!!phone && (
            <>
              <Hair />
              <Row compact icon="call-outline" title={phone} sub="Phone" />
            </>
          )}
          {!!appt.referral_reason && (
            <>
              <Hair />
              <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                <CardLabel>Reason for referral</CardLabel>
                <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink, marginTop: 6 }}>{appt.referral_reason}</Text>
              </View>
            </>
          )}
        </Card>

        <SectionHead title="Vitals" />
        {latest ? (
          <Card>
            <StatStrip>
              <Stat label="BP"
                value={latest.bp_systolic != null && latest.bp_diastolic != null ? `${latest.bp_systolic}/${latest.bp_diastolic}` : '—'}
                tone={latest.bp_systolic != null && latest.bp_systolic >= 140 ? 'amber' : undefined}
                note="last recorded" />
              <Stat label="Blood sugar" value={latest.blood_sugar ?? '—'} unit={latest.blood_sugar != null ? 'mg/dL' : undefined} note="last recorded" />
              <Stat label="Weight" value={latest.weight_kg ?? '—'} unit={latest.weight_kg != null ? 'kg' : undefined} note="last recorded" last />
            </StatStrip>
            {bpPoints.length > 1 && (
              <>
                <Hair inset={0} />
                <View style={{ padding: 14 }}>
                  <CardLabel>Blood pressure · your last {bpPoints.length} readings</CardLabel>
                  <BpBars points={bpPoints} />
                </View>
              </>
            )}
          </Card>
        ) : (
          <Notice tone="neutral" icon="pulse-outline">
            No vitals recorded in the visits you have had with this patient. The front desk records them at
            check-in, and you can record them yourself on the consultation screen.
          </Notice>
        )}

        <SectionHead title="Allergies" />
        {historyFailed ? (
          <Notice tone="amber" icon="alert-circle-outline">
            The medical history could not be loaded, so this is not "no known allergies" — it is unknown.
            Pull down to try again.
          </Notice>
        ) : allergies.length === 0 ? (
          <Card>
            <Empty icon="checkmark-circle-outline" title="None recorded"
              body="The patient has not listed any allergy in their profile." />
          </Card>
        ) : (
          <Card>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 14 }}>
              {allergies.map(x => <Pill key={x} label={x} tone="red" />)}
            </View>
          </Card>
        )}

        {conditions.length > 0 && (
          <>
            <SectionHead title="Conditions" />
            <Card>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 14 }}>
                {conditions.map(x => <Chip key={x} label={x} />)}
              </View>
            </Card>
          </>
        )}

        <SectionHead title={meds.length ? `Medications · ${meds.length}` : 'Medications'} />
        <Card>
          {meds.length === 0 ? (
            <Empty icon="medkit-outline" title="None recorded"
              body="Anything the patient has written into their profile shows up here." />
          ) : meds.map((m, i) => (
            <View key={`${m}-${i}`}>
              {i > 0 && <Hair />}
              <Row compact icon="ellipse-outline" title={m} />
            </View>
          ))}
        </Card>

        {!!(appt.diagnosis || appt.doctor_notes) && (
          <>
            <SectionHead title="This visit" />
            <Card>
              {!!appt.diagnosis && (
                <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                  <CardLabel>Diagnosis</CardLabel>
                  <Text style={{ fontSize: 14, lineHeight: 20, color: t.q.ink, marginTop: 6 }}>{appt.diagnosis}</Text>
                </View>
              )}
              {!!appt.diagnosis && !!appt.doctor_notes && <Hair />}
              {!!appt.doctor_notes && (
                <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                  <CardLabel>Notes</CardLabel>
                  <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink70, marginTop: 6 }}>{appt.doctor_notes}</Text>
                </View>
              )}
            </Card>
          </>
        )}
      </Body>

      <BottomBar meta={<>
        <Mono size={12} weight="600" color={t.q.ink60}>
          {new Date(appt.appointment_date + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })}
          {appt.start_time ? ` · ${appt.start_time.slice(0, 5)}` : ''}
        </Mono>
      </>}>
        <Btn grow label="Open consultation" icon="document-text-outline"
          onPress={() => navigation.navigate('PatientConsult', { appointmentId: appt.id })} />
        {!['completed', 'cancelled'].includes(appt.status) && (
          <Btn label="Refer" variant="secondary" loading={busy}
            onPress={() => navigation.navigate('ReferPatient', {
              appointmentId: appt.id,
              patientName: name,
              ownHospitalId: appt.hospital_id,
              isInProgress: appt.status === 'in_progress',
            })} />
        )}
      </BottomBar>
    </Screen>
  )
}

/** Paired systolic/diastolic bars. A line chart would imply readings at even
 *  intervals; these are whenever the patient happened to be seen. */
function BpBars({ points }: { points: VitalPoint[] }) {
  const { theme: t } = useTheme()
  const max = Math.max(180, ...points.map(p => p.bp_systolic ?? 0))
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 110 }}>
        {points.map((p, i) => {
          const sys = p.bp_systolic ?? 0
          const dia = p.bp_diastolic ?? 0
          const high = sys >= 140 || dia >= 90
          return (
            <View key={`${p.recorded_at}-${i}`} style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 4 }}>
              <Text style={{ fontSize: 9.5, color: t.q.ink60 }}>{sys}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 70 }}>
                <View style={{ width: 6, height: Math.max(4, (sys / max) * 70), borderRadius: 3, backgroundColor: high ? t.q.amberFill : t.q.primary }} />
                <View style={{ width: 6, height: Math.max(4, (dia / max) * 70), borderRadius: 3, backgroundColor: t.q.muted }} />
              </View>
              <Text style={{ fontSize: 9.5, color: t.q.ink60 }}>
                {DAY[new Date(p.recorded_at).getDay()]}
              </Text>
            </View>
          )
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 14, marginTop: 10 }}>
        <Legend color={t.q.primary} label="Systolic" />
        <Legend color={t.q.muted} label="Diastolic" />
        <Legend color={t.q.amberFill} label="140/90 or above" />
      </View>
    </View>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color }} />
      <Text style={{ fontSize: 11, color: t.q.ink60 }}>{label}</Text>
    </View>
  )
}
