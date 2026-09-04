// Booking a doctor directly has no pre-generated time_slots to pick from --
// there's no hospital-style availability calendar for an independent doctor
// yet. The patient picks a preferred date/time, the booking is created
// 'pending' / 'pending_review', and the doctor confirms or reschedules it
// themselves from the doctors app's Appointments screen.
import { useState } from 'react'
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Button } from '@queue/shared/components/ui/Button'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { createDirectAppointment, IndependentDoctorProfile } from '@queue/shared/lib/api'
import { haptics } from '@queue/shared/lib/haptics'
import { fmtLocalDate } from '@queue/shared/lib/format'

interface Props { navigation: any; route: any }

function nextDays(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return { iso: fmtLocalDate(d), label: d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' }) }
  })
}

const TIMES = Array.from({ length: 20 }, (_, i) => {
  const totalMins = 8 * 60 + i * 30 // 08:00 -> 17:30
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  return { value: `${hh}:${mm}`, label: `${h % 12 || 12}:${mm} ${ampm}` }
})

const DATES = nextDays(14)

export function DirectBookingScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { user } = useAuth()
  const { doctor, visitType } = route.params as { doctor: IndependentDoctorProfile; visitType: 'virtual' | 'home_visit' }

  const [date, setDate] = useState(DATES[0].iso)
  const [time, setTime] = useState('')
  const [reason, setReason] = useState('')
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const fee = visitType === 'virtual' ? doctor.virtualFee : doctor.homeVisitFee

  async function handleSubmit() {
    if (!user) { setError('You must be signed in.'); return }
    if (!time) { setError('Please choose a time.'); return }
    if (!reason.trim()) { setError(`Please describe your reason for this ${visitType === 'virtual' ? 'consultation' : 'visit'}.`); return }
    if (visitType === 'home_visit' && !address.trim()) { setError('Please enter the address for your home visit.'); return }

    setSubmitting(true); setError('')
    const result = await createDirectAppointment({
      patientId: user.id,
      doctorUserId: doctor.userId,
      date, startTime: time, type: visitType,
      reason: reason.trim(),
      homeVisitAddress: visitType === 'home_visit' ? address.trim() : undefined,
    })
    setSubmitting(false)

    if (!result.ok) { setError(result.error); return }
    haptics.success()
    navigation.navigate('Confirmation', {
      directBooking: true,
      doctor: { full_name: `${doctor.title ? doctor.title + ' ' : ''}${doctor.fullName}` },
      bookingRef: result.bookingRef,
      approvalStatus: 'pending_approval',
      selectedDate: date,
      bookingType: visitType,
    })
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back">
            <Ionicons name="arrow-back" size={20} color={t.textPrimary} />
          </TouchableOpacity>
          <Text style={[st.title, { color: t.textPrimary }]}>
            {visitType === 'virtual' ? 'Book Virtual Consult' : 'Book Home Visit'}
          </Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={[st.doctorCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.textPrimary }}>
              {doctor.title ? `${doctor.title} ` : ''}{doctor.fullName}
            </Text>
            {doctor.specialty && <Text style={{ fontSize: 12, color: t.accent, marginTop: 2 }}>{doctor.specialty.name}</Text>}
            {fee != null && <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 4 }}>Fee: ₦{fee.toLocaleString()}</Text>}
          </View>

          <Text style={[st.label, { color: t.textMuted }]}>PREFERRED DATE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}>
            {DATES.map(d => (
              <TouchableOpacity key={d.iso} onPress={() => { haptics.tap(); setDate(d.iso) }}
                style={[st.dateChip, { backgroundColor: date === d.iso ? t.accentBg : t.cardBg, borderColor: date === d.iso ? t.accentBorder : t.cardBorder }]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: date === d.iso ? t.accent : t.textPrimary }}>{d.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[st.label, { color: t.textMuted, marginTop: 16 }]}>PREFERRED TIME</Text>
          <View style={st.timeGrid}>
            {TIMES.map(tm => (
              <TouchableOpacity key={tm.value} onPress={() => { haptics.tap(); setTime(tm.value) }}
                style={[st.timeChip, { backgroundColor: time === tm.value ? t.accentBg : t.cardBg, borderColor: time === tm.value ? t.accentBorder : t.cardBorder }]}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: time === tm.value ? t.accent : t.textPrimary }}>{tm.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {visitType === 'home_visit' && (
            <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
              <Text style={[st.label, { color: t.textMuted, paddingHorizontal: 0 }]}>YOUR ADDRESS</Text>
              <TextInput value={address} onChangeText={setAddress} placeholder="Where should the doctor visit you?"
                placeholderTextColor={t.textMuted} multiline
                style={[st.textArea, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
            </View>
          )}

          <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
            <Text style={[st.label, { color: t.textMuted, paddingHorizontal: 0 }]}>{visitType === 'virtual' ? 'REASON FOR CONSULTATION' : 'REASON FOR VISIT'}</Text>
            <TextInput value={reason} onChangeText={setReason} placeholder="Briefly describe your symptoms or reason…"
              placeholderTextColor={t.textMuted} multiline
              style={[st.textArea, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
          </View>

          {error ? (
            <View style={[st.errorBox, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }]}>
              <Text style={{ fontSize: 12, color: t.danger }}>{error}</Text>
            </View>
          ) : null}

          <Button label="Request Appointment" onPress={handleSubmit} loading={submitting} style={{ marginHorizontal: 20, marginTop: 20 }} />
          <Text style={{ fontSize: 11, color: t.textMuted, textAlign: 'center', marginTop: 10, paddingHorizontal: 30 }}>
            This is a request — the doctor will confirm your exact time or suggest an alternative.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const st = StyleSheet.create({
  safe:         { flex: 1 },
  header:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 14 },
  title:        { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  doctorCard:   { marginHorizontal: 20, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16 },
  label:        { fontSize: 10, fontWeight: '700', letterSpacing: 0.6, marginBottom: 8, paddingHorizontal: 20 },
  dateChip:     { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  timeGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20 },
  timeChip:     { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, minWidth: '22%', alignItems: 'center' },
  textArea:     { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 13, minHeight: 80, textAlignVertical: 'top' },
  errorBox:     { marginHorizontal: 20, marginTop: 14, padding: 12, borderRadius: 10, borderWidth: 1 },
})
