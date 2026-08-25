import { useState, useCallback, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { Alert } from '../../contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth }  from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { haptics }  from '../../lib/haptics'
import { todayLocalDate } from '../../lib/format'

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
  const [urgency,   setUrgency]   = useState<'routine' | 'urgent' | 'emergency'>('routine')
  const [apptType,  setApptType]  = useState<'in-person' | 'virtual'>('in-person')
  const [doctors,   setDoctors]   = useState<Doctor[]>([])
  const [clinics,   setClinics]   = useState<Clinic[]>([])
  const [doctorId,  setDoctorId]  = useState<string | null>(null)
  const [clinicId,  setClinicId]  = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [bookingRef, setBookingRef] = useState('')

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

  async function handleSubmit() {
    if (!patientName.trim()) { Alert.alert('Required', 'Please enter the patient name.'); return }
    if (!reason.trim()) { Alert.alert('Required', 'Please enter the visit reason.'); return }
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
          urgency,
          type: apptType,
          staffId: user?.id || null,
        }),
      })

      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Booking failed')

      haptics.success()
      setBookingRef(body.bookingRef ?? body.booking_ref ?? '')
      setSubmitted(true)
    } catch (e) {
      haptics.error()
      Alert.alert('Booking failed', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={[s.successIcon, { backgroundColor: 'rgba(0,194,101,0.12)', borderColor: 'rgba(0,194,101,0.3)' }]}>
            <Ionicons name="checkmark-circle" size={56} color="#00C265" />
          </View>
          <Text style={[s.successTitle, { color: t.textPrimary }]}>Walk-in Registered</Text>
          <Text style={[s.successRef, { color: t.accent }]}>{bookingRef}</Text>
          <Text style={[s.successSub, { color: t.textMuted }]}>
            {patientName} has been added to the queue.
          </Text>
          <TouchableOpacity style={[s.doneBtn, { backgroundColor: t.accent }]} onPress={() => {
            setSubmitted(false); setPatientName(''); setPatientPhone(''); setPatientNumber('')
            setFoundPatient(null); setReason(''); setDoctorId(null); setClinicId(null)
          }}>
            <Text style={s.doneBtnText}>Register Another</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <Text style={[s.title, { color: t.textPrimary }]}>Walk-in</Text>
          <Text style={[s.sub, { color: t.textMuted }]}>Register a walk-in patient to the queue.</Text>

          {/* Patient lookup */}
          <Text style={[s.sectionLabel, { color: t.textMuted }]}>PATIENT LOOKUP (OPTIONAL)</Text>
          <View style={[s.lookupRow]}>
            <View style={[s.input, { flex: 1, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
              <TextInput value={patientNumber} onChangeText={setPatientNumber}
                placeholder="Patient ID (QH-...)" placeholderTextColor={t.textMuted}
                style={[s.inputText, { color: t.textPrimary }]} autoCapitalize="characters" />
            </View>
            <TouchableOpacity onPress={handleLookup} disabled={lookupLoading || (!patientNumber.trim() && !patientPhone.trim())}
              style={[s.lookupBtn, { backgroundColor: t.accent }]}>
              {lookupLoading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
          <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, marginTop: 8 }]}>
            <TextInput value={patientPhone} onChangeText={setPatientPhone}
              placeholder="Or search by phone number" placeholderTextColor={t.textMuted}
              keyboardType="phone-pad" style={[s.inputText, { color: t.textPrimary }]} />
          </View>
          {foundPatient && (
            <View style={[s.foundBanner, { backgroundColor: 'rgba(0,194,101,0.1)', borderColor: 'rgba(0,194,101,0.3)' }]}>
              <Ionicons name="person-circle-outline" size={18} color="#00C265" />
              <Text style={[s.foundText, { color: '#00C265' }]}>Found: {foundPatient.full_name} · {foundPatient.patient_number}</Text>
            </View>
          )}

          {/* Patient info */}
          <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 20 }]}>PATIENT INFO</Text>
          <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
            <TextInput value={patientName} onChangeText={setPatientName}
              placeholder="Full name *" placeholderTextColor={t.textMuted}
              style={[s.inputText, { color: t.textPrimary }]} />
          </View>
          <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, marginTop: 8 }]}>
            <TextInput value={patientPhone} onChangeText={setPatientPhone}
              placeholder="Phone number" placeholderTextColor={t.textMuted}
              keyboardType="phone-pad" style={[s.inputText, { color: t.textPrimary }]} />
          </View>

          {/* Visit reason */}
          <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 20 }]}>VISIT REASON *</Text>
          <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, height: 80, alignItems: 'flex-start', paddingTop: 12 }]}>
            <TextInput value={reason} onChangeText={setReason}
              placeholder="Reason for visit…" placeholderTextColor={t.textMuted} multiline
              style={[s.inputText, { color: t.textPrimary }]} />
          </View>

          {/* Urgency */}
          <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 20 }]}>URGENCY</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['routine', 'urgent', 'emergency'] as const).map(u => {
              const colors = { routine: t.accent, urgent: '#EF9F27', emergency: '#FF5C5C' }
              const color = colors[u]
              const active = urgency === u
              return (
                <TouchableOpacity key={u} onPress={() => setUrgency(u)}
                  style={[s.urgencyBtn, { borderColor: active ? color : t.cardBorder, backgroundColor: active ? `${color}18` : t.cardBg }]}>
                  <Text style={[s.urgencyText, { color: active ? color : t.textMuted }]}>{u.charAt(0).toUpperCase() + u.slice(1)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Visit type */}
          <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 20 }]}>VISIT TYPE</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['in-person', 'virtual'] as const).map(tp => {
              const active = apptType === tp
              return (
                <TouchableOpacity key={tp} onPress={() => setApptType(tp)}
                  style={[s.urgencyBtn, { borderColor: active ? t.accent : t.cardBorder, backgroundColor: active ? `${t.accent}18` : t.cardBg }]}>
                  <Text style={[s.urgencyText, { color: active ? t.accent : t.textMuted }]}>{tp === 'in-person' ? 'In-person' : 'Virtual'}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Assign doctor (optional) */}
          {doctors.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 20 }]}>ASSIGN DOCTOR (OPTIONAL)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => setDoctorId(null)}
                    style={[s.docChip, { borderColor: !doctorId ? t.accent : t.cardBorder, backgroundColor: !doctorId ? `${t.accent}18` : t.cardBg }]}>
                    <Text style={[s.docChipText, { color: !doctorId ? t.accent : t.textMuted }]}>Any</Text>
                  </TouchableOpacity>
                  {doctors.map(d => {
                    const active = doctorId === d.id
                    return (
                      <TouchableOpacity key={d.id} onPress={() => setDoctorId(d.id)}
                        style={[s.docChip, { borderColor: active ? t.accent : t.cardBorder, backgroundColor: active ? `${t.accent}18` : t.cardBg }]}>
                        <Text style={[s.docChipText, { color: active ? t.accent : t.textPrimary }]}>{[d.title, d.full_name].filter(Boolean).join(' ')}</Text>
                        {d.specialty_name && <Text style={[s.docSpec, { color: t.textMuted }]}>{d.specialty_name}</Text>}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </ScrollView>
            </>
          )}

          {/* Assign clinic (optional) */}
          {clinics.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 16 }]}>ASSIGN CLINIC (OPTIONAL)</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TouchableOpacity onPress={() => setClinicId(null)}
                    style={[s.docChip, { borderColor: !clinicId ? t.accent : t.cardBorder, backgroundColor: !clinicId ? `${t.accent}18` : t.cardBg }]}>
                    <Text style={[s.docChipText, { color: !clinicId ? t.accent : t.textMuted }]}>Any</Text>
                  </TouchableOpacity>
                  {clinics.map(c => {
                    const active = clinicId === c.id
                    return (
                      <TouchableOpacity key={c.id} onPress={() => setClinicId(c.id)}
                        style={[s.docChip, { borderColor: active ? t.accent : t.cardBorder, backgroundColor: active ? `${t.accent}18` : t.cardBg }]}>
                        <Text style={[s.docChipText, { color: active ? t.accent : t.textPrimary }]}>{c.name}</Text>
                        {c.is_opd && <Text style={[s.docSpec, { color: t.textMuted }]}>OPD</Text>}
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </ScrollView>
            </>
          )}

          <TouchableOpacity onPress={handleSubmit} disabled={loading}
            style={[s.submitBtn, { backgroundColor: loading ? `${t.accent}88` : t.accent, marginTop: 28 }]}>
            {loading ? <ActivityIndicator color="#fff" /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="person-add-outline" size={18} color="#fff" />
                <Text style={s.submitText}>Add to Queue</Text>
              </View>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:        { flex: 1 },
  title:       { fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  sub:         { fontSize: 13, marginBottom: 20 },
  sectionLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  lookupRow:   { flexDirection: 'row', gap: 8 },
  lookupBtn:   { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  input:       { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, justifyContent: 'center' },
  inputText:   { fontSize: 14 },
  foundBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  foundText:   { fontSize: 12, fontWeight: '600' },
  urgencyBtn:  { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 10, alignItems: 'center' },
  urgencyText: { fontSize: 12, fontWeight: '700' },
  docChip:     { borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, minWidth: 100 },
  docChipText: { fontSize: 12, fontWeight: '700' },
  docSpec:     { fontSize: 10, marginTop: 2 },
  submitBtn:   { borderRadius: 14, padding: 16, alignItems: 'center' },
  submitText:  { fontSize: 15, fontWeight: '800', color: '#fff' },
  successIcon: { width: 96, height: 96, borderRadius: 28, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginBottom: 20 },
  successTitle: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4, textAlign: 'center' },
  successRef:  { fontSize: 20, fontWeight: '800', marginTop: 6, marginBottom: 8 },
  successSub:  { fontSize: 14, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  doneBtn:     { borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
  doneBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
})
