// Booking a doctor directly has no pre-generated time_slots to pick from --
// there is no hospital-style availability calendar for an independent doctor
// yet. The patient picks a preferred date and time, the booking is created
// 'pending' / 'pending_review', and the doctor confirms or reschedules it
// themselves from the doctor app's Appointments screen.
import { useState } from 'react'
import { View, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { EntityAvatar } from '@queue/shared/components/ui/EntityAvatar'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { createDirectAppointment, type IndependentDoctorProfile } from '@queue/shared/lib/api'
import { haptics } from '@queue/shared/lib/haptics'
import { fmtLocalDate } from '@queue/shared/lib/format'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, SectionHead, Field, Notice,
  Btn, BottomBar, Mono, MONO,
} from '@queue/shared/components/q'

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
  return { value: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, label: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }
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

  const isHome = visitType === 'home_visit'
  const fee = isHome ? doctor.homeVisitFee : doctor.virtualFee

  async function handleSubmit() {
    if (!user) { setError('You must be signed in.'); return }
    if (!time) { setError('Please choose a time.'); return }
    if (!reason.trim()) { setError(`Please describe your reason for this ${isHome ? 'visit' : 'consultation'}.`); return }
    if (isHome && !address.trim()) { setError('Please enter the address for your home visit.'); return }

    setSubmitting(true); setError('')
    const result = await createDirectAppointment({
      patientId: user.id,
      doctorUserId: doctor.userId,
      date, startTime: time, type: visitType,
      reason: reason.trim(),
      homeVisitAddress: isHome ? address.trim() : undefined,
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
      startTime: time,
      bookingType: visitType,
    })
  }

  return (
    <Screen>
      <AppBar title={isHome ? 'Request a home visit' : 'Request a video visit'} onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <Body keyboardShouldPersistTaps="handled">
          <Card>
            <Row
              leading={<EntityAvatar size={40} kind="doctor" uri={doctor.avatarUrl} gender={doctor.gender} label={doctor.fullName} />}
              title={`${doctor.title ? doctor.title + ' ' : ''}${doctor.fullName}`}
              sub={[doctor.specialty?.name, isHome ? 'Home visit' : 'Video visit'].filter(Boolean).join(' · ')}
              right={fee != null ? <Mono size={13} weight="700">₦{fee.toLocaleString('en-NG')}</Mono> : undefined}
            />
          </Card>

          <Notice tone="teal" icon="information-circle-outline">
            The doctor confirms or declines within a couple of hours. You pay only once they confirm.
          </Notice>

          <View style={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: 8 }}>
            <CardLabel>Preferred date</CardLabel>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ flexGrow: 0 }}>
            {DATES.map(d => {
              const on = date === d.iso
              return (
                <Pressable
                  key={d.iso}
                  onPress={() => { haptics.tap(); setDate(d.iso) }}
                  accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{
                    minHeight: 48, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
                    borderRadius: 14, backgroundColor: on ? t.q.sel : t.q.surface,
                    borderWidth: 1, borderColor: on ? t.q.primary : t.q.line,
                  }}>
                  <Text style={{ fontSize: 13, fontWeight: on ? '700' : '600', color: on ? t.q.primary : t.q.ink }}>
                    {d.label}
                  </Text>
                </Pressable>
              )
            })}
          </ScrollView>

          <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 }}>
            <CardLabel>Preferred time</CardLabel>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
            {TIMES.map(tm => {
              const on = time === tm.value
              return (
                <Pressable
                  key={tm.value}
                  onPress={() => { haptics.tap(); setTime(tm.value) }}
                  accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{
                    flexGrow: 1, flexBasis: '21%', minHeight: 44,
                    alignItems: 'center', justifyContent: 'center', borderRadius: 12,
                    backgroundColor: on ? t.q.sel : t.q.surface,
                    borderWidth: 1, borderColor: on ? t.q.primary : t.q.line,
                  }}>
                  <Text style={{ fontFamily: MONO, fontSize: 12.5, fontWeight: on ? '700' : '400', color: on ? t.q.primary : t.q.ink70 }}>
                    {tm.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {isHome && (
            <>
              <SectionHead title="Your address" />
              <View style={{ paddingHorizontal: 16 }}>
                <Field
                  label="Where should the doctor visit you?"
                  value={address} onChangeText={setAddress}
                  multiline placeholder="Street, area, landmark, flat or gate number"
                  style={{ minHeight: 80, textAlignVertical: 'top' }}
                />
              </View>
            </>
          )}

          <SectionHead title={isHome ? 'Reason for visit' : 'Reason for consultation'} />
          <View style={{ paddingHorizontal: 16 }}>
            <Field
              label="What should the doctor know?"
              value={reason} onChangeText={setReason}
              multiline placeholder="Briefly describe your symptoms or reason…"
              style={{ minHeight: 88, textAlignVertical: 'top' }}
              error={error || undefined}
            />
          </View>

          <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
            <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
              This is a request. The doctor confirms your exact time, or suggests another.
            </Text>
          </View>
        </Body>

        <BottomBar meta={
          fee != null ? (
            <>
              <Mono size={12} weight="700">₦{fee.toLocaleString('en-NG')}</Mono>
              <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
              <Mono size={12} color={t.q.ink60}>after confirmation</Mono>
            </>
          ) : undefined
        }>
          <Btn grow label="Request appointment" loading={submitting} onPress={handleSubmit} />
        </BottomBar>
      </KeyboardAvoidingView>
    </Screen>
  )
}
