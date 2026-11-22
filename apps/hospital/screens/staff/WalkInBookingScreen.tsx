import { useState, useCallback, useEffect } from 'react'
import { View, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Ionicons } from '@expo/vector-icons'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Field, Notice, Btn,
  BottomBar, Initials, Mono, Chip, BigFigure,
} from '@queue/shared/components/q'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { todayLocalDate } from '@queue/shared/lib/format'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

interface Doctor { id: string; full_name: string; title: string | null; specialty_name: string | null }
interface Clinic { id: string; name: string; is_opd: boolean }
interface FoundPatient { id: string; full_name: string; phone: string; patient_number: string }

interface Props { navigation: any }

export function WalkInBookingScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile, user } = useAuth()

  const [patientName,   setPatientName]   = useState('')
  const [patientPhone,  setPatientPhone]  = useState('')
  const [patientNumber, setPatientNumber] = useState('')
  const [foundPatient,  setFoundPatient]  = useState<FoundPatient | null>(null)
  const [lookupLoading, setLookupLoading] = useState(false)

  const [reason,    setReason]    = useState('')
  const [doctors,   setDoctors]   = useState<Doctor[]>([])
  const [clinics,   setClinics]   = useState<Clinic[]>([])
  const [doctorId,  setDoctorId]  = useState<string | null>(null)
  const [clinicId,  setClinicId]  = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [bookingRef, setBookingRef] = useState('')
  const [urgency, setUrgency] = useState<'routine' | 'urgent' | 'emergency'>('routine')
  const [visitType, setVisitType] = useState<'in-person' | 'virtual'>('in-person')
  // What the desk reads out. Comes back from the walk-in route, which checks
  // the patient in and lets the renumber trigger assign the number.
  const [queueNumber, setQueueNumber] = useState<number | null>(null)
  const [checkInError, setCheckInError] = useState<string | null>(null)

  const hospitalId = staffProfile?.hospitalId

  // Load doctors and clinics on mount
  useEffect(() => {
    if (!hospitalId) return
    ;(async () => {
      const [docRes, clinicRes] = await Promise.all([
        supabase.from('doctors')
          .select('id, full_name, title, specialty:specialties!doctors_specialty_id_fkey(name)')
          .eq('hospital_id', hospitalId)
          .eq('is_active', true)
          .order('full_name'),
        supabase.from('hospital_clinics')
          .select('id, name, is_opd')
          .eq('hospital_id', hospitalId)
          .order('name'),
      ])
      setDoctors((docRes.data ?? []).map((d: any) => ({ ...d, specialty_name: d.specialty?.name ?? null })))
      setClinics(clinicRes.data ?? [])
    })()
  }, [hospitalId])

  async function handleLookup() {
    const query = patientNumber.trim() || patientPhone.trim()
    if (!query) return
    setLookupLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      const param = patientNumber.trim() ? `patientNumber=${encodeURIComponent(patientNumber.trim())}` : `phone=${encodeURIComponent(patientPhone.trim())}`
      const res = await fetch(`${API_URL}/api/appointments/walkin?${param}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      })
      const body = await res.json()
      if (body.found && body.patient) {
        setFoundPatient(body.patient)
        setPatientName(body.patient.full_name)
        setPatientPhone(body.patient.phone)
      } else {
        setFoundPatient(null)
        Alert.alert('Patient not found', 'No existing patient found with this hospital. The walk-in will be recorded as a new visitor.')
      }
    } catch {
      Alert.alert('Error', 'Could not search for patient.')
    } finally {
      setLookupLoading(false)
    }
  }

  function resetForm() {
    setUrgency('routine'); setVisitType('in-person')
    setQueueNumber(null); setCheckInError(null)
    setSubmitted(false)
    setPatientName(''); setPatientPhone(''); setPatientNumber('')
    setFoundPatient(null); setReason(''); setDoctorId(null); setClinicId(null)
  }

  async function handleSubmit() {
    if (!patientName.trim()) { Alert.alert('Required', 'Please enter the patient name.'); return }
    if (!reason.trim()) { Alert.alert('Required', 'Please enter the reason for the visit.'); return }
    if (!hospitalId) return

    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not authenticated')

      const today = todayLocalDate()
      const now   = new Date()
      const startTime = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`

      const res = await fetch(`${API_URL}/api/appointments/walkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          hospitalId,
          patientName: patientName.trim(),
          patientPhone: patientPhone.trim() || null,
          patientNumber: foundPatient?.patient_number || null,
          patientId: foundPatient?.id || null,
          doctorId: doctorId || null,
          clinicId: clinicId || null,
          date: today,
          startTime,
          reason: reason.trim(),
          staffId: user?.id || null,
          urgency,
          type: visitType,
        }),
      })

      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Booking failed')

      haptics.success()
      setBookingRef(body.bookingRef ?? body.booking_ref ?? '')
      setQueueNumber(typeof body.queuePosition === 'number' ? body.queuePosition : null)
      setCheckInError(body.checkedIn === false ? (body.checkInError ?? 'They were registered but not checked in.') : null)
      setSubmitted(true)
    } catch (e) {
      haptics.error()
      Alert.alert('Booking failed', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Registered ────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <Screen>
        <AppBar title="Walk-in registered" sub={bookingRef || undefined} />
        <Body>
          <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 18, gap: 8 }}>
            <View style={{
              width: 64, height: 64, borderRadius: 32, backgroundColor: t.q.greenBg,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="checkmark" size={30} color={t.q.green} />
            </View>
            <Text style={{ fontSize: 22, fontWeight: '800', letterSpacing: -0.5, color: t.q.ink, textAlign: 'center' }}>
              {patientName} is registered
            </Text>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60, textAlign: 'center' }}>
              {[clinics.find(c => c.id === clinicId)?.name ?? 'General outpatient',
                doctors.find(d => d.id === doctorId)?.full_name ?? 'next available doctor'].join(' · ')}
            </Text>
          </View>

          {/* The number the board will actually call. The walk-in route checks
              the patient in, and the renumber trigger assigns it. */}
          {queueNumber != null ? (
            <Card>
              <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                <BigFigure label="Queue number" value={queueNumber} color={t.q.primary} />
              </View>
            </Card>
          ) : checkInError ? (
            <Notice tone="amber" icon="information-circle-outline">
              {checkInError} Check them in from the queue to give them a number.
            </Notice>
          ) : (
            <Notice tone="neutral" icon="information-circle-outline">
              They are checked in. Their number appears on the queue screen.
            </Notice>
          )}

          <SectionHead title="Tell the patient" />
          <Card pad>
            {[
              `Their booking reference is ${bookingRef || 'on the way'}`,
              patientPhone.trim()
                ? `They get updates on ${patientPhone.trim()}`
                : 'Add their phone number next time so they get updates',
              queueNumber != null
                ? `They are number ${queueNumber} in today's queue`
                : 'They will be given a queue number at check-in',
            ].map((line, i) => (
              <View key={line} style={{ flexDirection: 'row', gap: 12, paddingVertical: 7 }}>
                <Mono size={13} weight="700" color={t.q.primary}>{i + 1}</Mono>
                <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: t.q.ink70 }}>{line}</Text>
              </View>
            ))}
          </Card>
        </Body>

        <BottomBar meta={<>
          <Mono size={12} color={t.q.ink60}>{bookingRef}</Mono>
          {queueNumber != null && (
            <>
              <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
              <Mono size={12} weight="700" color={t.q.primary}>number {queueNumber}</Mono>
            </>
          )}
        </>}>
          <Btn label="Register another" variant="secondary" onPress={resetForm} />
          <Btn grow label="Go to the queue" icon="list-outline"
            onPress={() => { resetForm(); navigation.navigate('FrontDeskQueue') }} />
        </BottomBar>
      </Screen>
    )
  }

  // ── Intake ────────────────────────────────────────────────────────────────
  return (
    <Screen>
      <AppBar large title="Walk-in" />

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <Body keyboardShouldPersistTaps="handled">
          <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60 }}>
              Register someone who has walked in, then check them in to give them a number.
            </Text>
          </View>

          <SectionHead title="Already a patient?" />
          <View style={{ paddingHorizontal: 16, gap: 10 }}>
            <Field
              label="Phone number or Patient ID"
              value={patientNumber}
              onChangeText={setPatientNumber}
              placeholder="K7M3QX, or their phone number"
              autoCapitalize="characters"
            />
            <Btn
              label={lookupLoading ? 'Looking…' : 'Find patient'}
              variant="secondary"
              icon="search"
              loading={lookupLoading}
              disabled={!patientNumber.trim() && !patientPhone.trim()}
              onPress={handleLookup}
            />
          </View>

          {foundPatient && (
            <Card style={{ marginTop: 12 }}>
              <Row
                icon="person-circle-outline" iconTone="green"
                tint
                title={foundPatient.full_name}
                sub={[foundPatient.phone, foundPatient.patient_number].filter(Boolean).join(' · ')}
                pill="Linked" pillTone="green"
              />
            </Card>
          )}

          <SectionHead title={foundPatient ? 'Check these are right' : 'Or a new patient'} />
          <View style={{ paddingHorizontal: 16, gap: 14 }}>
            <Field
              label="Full name"
              value={patientName}
              onChangeText={setPatientName}
              placeholder="Patient full name"
              autoCapitalize="words"
            />
            <Field
              label="Phone number"
              hint="So they get queue updates by SMS"
              value={patientPhone}
              onChangeText={setPatientPhone}
              placeholder="+234 …"
              keyboardType="phone-pad"
            />
            <Field
              label="Reason for visit"
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={3}
              placeholder="What has brought them in?"
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
          </View>

          {clinics.length > 0 && (
            <>
              <SectionHead title="Clinic" />
              <Card>
                <Row
                  icon="shuffle-outline"
                  iconTone={!clinicId ? 'teal' : 'neutral'}
                  tint={!clinicId}
                  title="Any clinic"
                  sub="The front desk decides on arrival"
                  right={!clinicId ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                  onPress={() => setClinicId(null)}
                />
                {clinics.map(c => {
                  const on = clinicId === c.id
                  return (
                    <View key={c.id}>
                      <Hair />
                      <Row
                        icon="medical-outline"
                        iconTone={on ? 'teal' : 'neutral'}
                        tint={on}
                        title={c.name}
                        sub={c.is_opd ? 'General outpatient · no referral needed' : null}
                        right={on ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                        onPress={() => setClinicId(c.id)}
                      />
                    </View>
                  )
                })}
              </Card>
            </>
          )}

          {doctors.length > 0 && (
            <>
              <SectionHead title="Doctor" />
              <Card>
                <Row
                  icon="shuffle-outline"
                  iconTone={!doctorId ? 'teal' : 'neutral'}
                  tint={!doctorId}
                  title="Next available"
                  sub="Assigned when they are called"
                  right={!doctorId ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                  onPress={() => setDoctorId(null)}
                />
                {doctors.map(d => {
                  const on = doctorId === d.id
                  return (
                    <View key={d.id}>
                      <Hair />
                      <Row
                        leading={<Initials name={d.full_name} size={40} tint="#7C2D12" />}
                        tint={on}
                        title={[d.title, d.full_name].filter(Boolean).join(' ')}
                        sub={d.specialty_name}
                        right={on ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                        onPress={() => setDoctorId(on ? null : d.id)}
                      />
                    </View>
                  )
                })}
              </Card>
            </>
          )}

          <SectionHead title="How urgent" />
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
            {(['routine', 'urgent', 'emergency'] as const).map(u => (
              <Chip key={u} label={u === 'emergency' ? 'Emergency' : u === 'urgent' ? 'Urgent' : 'Routine'}
                on={urgency === u} onPress={() => { haptics.tap(); setUrgency(u) }} />
            ))}
          </View>
          {urgency === 'emergency' && (
            <Notice tone="red" icon="alert-circle">
              An emergency is placed above the numbered queue, ahead of everyone already waiting.
            </Notice>
          )}

          <SectionHead title="Kind of visit" />
          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
            {([['in-person', 'In person'], ['virtual', 'Video']] as const).map(([v, label]) => (
              <Chip key={v} label={label} on={visitType === v}
                onPress={() => { haptics.tap(); setVisitType(v) }} />
            ))}
          </View>

          <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
            <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
              Registering a walk-in checks them in straight away, which is what gives them their queue
              number.
            </Text>
          </View>
        </Body>

        <BottomBar>
          <Btn
            grow
            label="Add to queue"
            icon="person-add-outline"
            loading={loading}
            disabled={!patientName.trim() || !reason.trim()}
            onPress={handleSubmit}
          />
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  )
}
