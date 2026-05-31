import { useState, useEffect } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, SafeAreaView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'

// ── Types ────────────────────────────────────────────────────────────────────

interface Doctor {
  id: string; full_name: string; title: string; qualification: string | null
  consultation_fee: number | null; virtual_fee: number | null; accepts_virtual: boolean
  specialties: { name: string } | null
}

interface TimeSlot {
  id: string; start_time: string; end_time: string; is_virtual: boolean | null
  booked_count: number | null; max_capacity: number | null
}

interface Service {
  id: string; name: string; description: string | null
  base_price: number | null; virtual_price: number | null; duration_mins: number | null
}

interface Dependent {
  id: string; full_name: string; relationship: string | null; date_of_birth: string | null
}

interface Hospital { id: string; name: string; phone: string | null }

// ── Helpers ───────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function getNextDays(n: number): string[] {
  const days: string[] = []
  const d = new Date()
  for (let i = 0; i < n; i++) {
    const date = new Date(d)
    date.setDate(d.getDate() + i)
    days.push(localDateStr(date))
  }
  return days
}

function formatDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })
}

// ── Common visit reasons (chief complaints) ───────────────────────────────────

const COMMON_REASONS = [
  'General check-up', 'Fever / Flu', 'Headache', 'Stomach pain',
  'Back pain', 'Cough', 'Skin condition', 'Follow-up visit',
  'Lab results review', 'Vaccination', 'Prescription renewal', 'Other',
]

// ── Main Screen ───────────────────────────────────────────────────────────────

export function BookingScreen({ route, navigation }: { route: any; navigation: any }) {
  const hospital: Hospital = route.params.hospital
  const preselectedDoctor: Doctor | null = route.params.doctor ?? null

  // Step state
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)

  // Step 1 — Doctor
  const [doctors, setDoctors]           = useState<Doctor[]>([])
  const [selectedDoctor, setDoctor]     = useState<Doctor | null>(preselectedDoctor)

  // Step 2 — Type
  const [selectedType, setType]         = useState<'in-person' | 'virtual'>('in-person')

  // Step 3 — Visit details (healthcare interoperability)
  const [services, setServices]         = useState<Service[]>([])
  const [selectedService, setService]   = useState<Service | null>(null)
  const [reason, setReason]             = useState('')
  const [customReason, setCustomReason] = useState('')
  const [dependents, setDependents]     = useState<Dependent[]>([])
  const [forDependent, setForDep]       = useState<Dependent | null>(null)  // null = self

  // Step 4 — Date — start from tomorrow so closed-today doesn't confuse clients
  const [selectedDate, setDate]         = useState<string>(getNextDays(14)[1])
  const days = getNextDays(14)

  // Step 5 — Time slot
  const [slots, setSlots]               = useState<TimeSlot[]>([])
  const [selectedSlot, setSlot]         = useState<TimeSlot | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)

  const [booking, setBooking]           = useState(false)

  // ── Load doctors ─────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.from('doctors')
      .select('id,full_name,title,qualification,consultation_fee,virtual_fee,accepts_virtual,specialties(name)')
      .eq('hospital_id', hospital.id).eq('is_active', true).order('full_name')
      .then(({ data }) => setDoctors((data as Doctor[]) ?? []))
  }, [hospital.id])

  // ── Load services & dependents when reaching step 3 ─────────────────────────

  useEffect(() => {
    if (step !== 3) return

    // Services for this hospital
    supabase.from('services')
      .select('id,name,description,base_price,virtual_price,duration_mins')
      .eq('hospital_id', hospital.id).eq('is_active', true).order('name')
      .then(({ data }) => setServices((data as Service[]) ?? []))

    // Patient's dependents
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return
      const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
      if (!profile) return
      supabase.from('dependents').select('id,full_name,relationship,date_of_birth')
        .eq('user_id', profile.id).order('full_name')
        .then(({ data }) => setDependents((data as Dependent[]) ?? []))
    })
  }, [step, hospital.id])

  // ── Load time slots ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedDoctor || !selectedDate || step !== 5) return
    setLoadingSlots(true)
    setSlot(null)
    supabase.from('time_slots')
      .select('id,start_time,end_time,is_virtual,booked_count,max_capacity')
      .eq('doctor_id', selectedDoctor.id)
      .eq('hospital_id', hospital.id)
      .eq('slot_date', selectedDate)
      .eq('is_available', true)
      .eq('is_virtual', selectedType === 'virtual')
      .order('start_time')
      .then(({ data }) => {
        const available = (data as TimeSlot[]) ?? []
        setSlots(available.filter(s => s.max_capacity == null || (s.booked_count ?? 0) < s.max_capacity))
        setLoadingSlots(false)
      })
      .catch(() => setLoadingSlots(false))
  }, [selectedDoctor, selectedDate, selectedType, hospital.id, step])

  // ── Booking submission ────────────────────────────────────────────────────────

  async function handleBook() {
    if (!selectedDoctor || !selectedSlot) return
    setBooking(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setBooking(false)
      Alert.alert('Session Expired', 'Please sign in again.')
      return
    }

    const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
    if (!profile) {
      setBooking(false)
      Alert.alert('Profile Error', 'Your patient profile could not be found. Please update your profile and try again.')
      return
    }

    const visitReason = reason === 'Other' ? customReason.trim() : reason
    const fee = selectedService
      ? (selectedType === 'virtual' ? selectedService.virtual_price : selectedService.base_price)
      : (selectedType === 'virtual' ? selectedDoctor.virtual_fee : selectedDoctor.consultation_fee)

    const { error } = await supabase.from('appointments').insert({
      patient_id:       profile.id,
      hospital_id:      hospital.id,
      doctor_id:        selectedDoctor.id,
      slot_id:          selectedSlot.id,
      appointment_date: selectedDate,
      start_time:       selectedSlot.start_time,
      type:             selectedType,
      status:           'pending',
      reason:           visitReason || null,
      service_id:       selectedService?.id ?? null,
      dependent_id:     forDependent?.id ?? null,
    })

    if (error) {
      setBooking(false)
      Alert.alert('Booking Failed', error.message)
      return
    }

    // Atomic increment — only succeeds if booked_count hasn't changed since we read it
    const { count } = await supabase.from('time_slots')
      .update({ booked_count: (selectedSlot.booked_count ?? 0) + 1 })
      .eq('id', selectedSlot.id)
      .eq('booked_count', selectedSlot.booked_count ?? 0)
      .select('id', { count: 'exact', head: true })

    // If count = 0 the slot was grabbed by someone else but appointment is already created — still valid,
    // the hospital dashboard will reconcile via actual appointment count.

    setBooking(false)

    const patientName = forDependent ? forDependent.full_name : 'you'
    Alert.alert(
      'Booking Confirmed! 🎉',
      `Appointment for ${patientName} with ${selectedDoctor.title} ${selectedDoctor.full_name} on ${formatDate(selectedDate)} at ${selectedSlot.start_time.slice(0, 5)} is pending confirmation.${fee != null ? `\n\nFee: ₦${fee.toLocaleString()}` : ''}`,
      [{ text: 'View Bookings', onPress: () => navigation.navigate('Appointments') },
       { text: 'Done', style: 'cancel' }]
    )
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  const fee = selectedService
    ? (selectedType === 'virtual' ? selectedService.virtual_price : selectedService.base_price)
    : (selectedType === 'virtual' ? selectedDoctor?.virtual_fee : selectedDoctor?.consultation_fee)

  const finalReason = reason === 'Other' ? customReason : reason
  const canProceed = (() => {
    if (step === 1) return !!selectedDoctor
    if (step === 2) return true
    if (step === 3) return !!finalReason.trim()
    if (step === 4) return !!selectedDate
    if (step === 5) return !!selectedSlot
    return false
  })()

  // ── Step progress bar ─────────────────────────────────────────────────────────

  const stepLabels = ['Doctor', 'Type', 'Visit', 'Date', 'Time']

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => step > 1 ? setStep((step - 1) as any) : navigation.goBack()}
            style={styles.backBtn}>
            <Text style={{ color: t.accent, fontSize: 16 }}>←</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Book Appointment</Text>
            <Text style={styles.subtitle}>{hospital.name}</Text>
          </View>
        </View>

        {/* Step progress */}
        <View style={styles.progressRow}>
          {stepLabels.map((label, i) => {
            const n = i + 1
            const done    = n < step
            const current = n === step
            return (
              <View key={n} style={styles.progressItem}>
                <View style={[styles.progressDot, done && styles.progressDone, current && styles.progressCurrent]}>
                  <Text style={{ fontSize: 9, fontWeight: '800', color: done ? '#060A07' : current ? '#060A07' : '#4A6058' }}>
                    {done ? '✓' : n}
                  </Text>
                </View>
                <Text style={[styles.progressLabel, current && { color: t.accent }]}>{label}</Text>
              </View>
            )
          })}
        </View>

        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

          {/* ── Step 1: Doctor ──────────────────────────────────────────────── */}
          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>Select a Doctor</Text>
              <Text style={styles.stepSubtitle}>Choose who you'd like to see</Text>
              {doctors.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={styles.emptyText}>No doctors available at this hospital yet.</Text>
                </View>
              ) : (
                <View style={styles.cardList}>
                  {doctors.map(d => {
                    const spec = Array.isArray(d.specialties) ? d.specialties[0] : d.specialties
                    const active = selectedDoctor?.id === d.id
                    return (
                      <TouchableOpacity key={d.id} onPress={() => setDoctor(d)}
                        style={[styles.card, active && styles.cardActive]}>
                        <View style={[styles.avatar, active && styles.avatarActive]}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: active ? '#060A07' : t.accent }}>
                            {d.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.cardTitle, active && { color: t.text }]}>{d.title} {d.full_name}</Text>
                          <Text style={styles.cardSub}>{spec?.name ?? 'General Practice'}</Text>
                          {d.qualification ? <Text style={styles.cardMeta}>{d.qualification}</Text> : null}
                        </View>
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          {d.consultation_fee ? <Text style={styles.feeText}>₦{d.consultation_fee.toLocaleString()}</Text> : null}
                          {d.accepts_virtual ? <Text style={styles.virtualBadge}>Virtual ✓</Text> : null}
                        </View>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
            </View>
          )}

          {/* ── Step 2: Type ────────────────────────────────────────────────── */}
          {step === 2 && selectedDoctor && (
            <View>
              <Text style={styles.stepTitle}>Appointment Type</Text>
              <Text style={styles.stepSubtitle}>How would you like to see {selectedDoctor.title} {selectedDoctor.full_name}?</Text>
              <View style={styles.typeRow}>
                <TouchableOpacity onPress={() => setType('in-person')}
                  style={[styles.typeCard, selectedType === 'in-person' && styles.typeCardActive]}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>🏥</Text>
                  <Text style={[styles.typeName, selectedType === 'in-person' && { color: t.text }]}>In-Person</Text>
                  <Text style={styles.typeMeta}>Visit the hospital</Text>
                  {selectedDoctor.consultation_fee
                    ? <Text style={styles.typePrice}>₦{selectedDoctor.consultation_fee.toLocaleString()}</Text>
                    : <Text style={styles.typeMeta}>Price TBC</Text>}
                </TouchableOpacity>
                {selectedDoctor.accepts_virtual && (
                  <TouchableOpacity onPress={() => setType('virtual')}
                    style={[styles.typeCard, selectedType === 'virtual' && styles.typeCardActive]}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>💻</Text>
                    <Text style={[styles.typeName, selectedType === 'virtual' && { color: t.text }]}>Virtual</Text>
                    <Text style={styles.typeMeta}>Video consultation</Text>
                    {selectedDoctor.virtual_fee
                      ? <Text style={styles.typePrice}>₦{selectedDoctor.virtual_fee.toLocaleString()}</Text>
                      : <Text style={styles.typeMeta}>Price TBC</Text>}
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* ── Step 3: Visit Details ────────────────────────────────────────── */}
          {step === 3 && (
            <View>
              <Text style={styles.stepTitle}>Visit Details</Text>
              <Text style={styles.stepSubtitle}>Help the doctor prepare for your visit</Text>

              {/* Who is this for? */}
              <Text style={styles.fieldLabel}>Who is this appointment for?</Text>
              <View style={styles.cardList}>
                <TouchableOpacity onPress={() => setForDep(null)}
                  style={[styles.smallCard, !forDependent && styles.smallCardActive]}>
                  <Text style={{ fontSize: 20 }}>👤</Text>
                  <Text style={[styles.smallCardText, !forDependent && { color: t.text }]}>Myself</Text>
                </TouchableOpacity>
                {dependents.map(dep => (
                  <TouchableOpacity key={dep.id} onPress={() => setForDep(dep)}
                    style={[styles.smallCard, forDependent?.id === dep.id && styles.smallCardActive]}>
                    <Text style={{ fontSize: 20 }}>👨‍👧</Text>
                    <View>
                      <Text style={[styles.smallCardText, forDependent?.id === dep.id && { color: t.text }]}>{dep.full_name}</Text>
                      {dep.relationship ? <Text style={styles.cardMeta}>{dep.relationship}</Text> : null}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Reason for visit */}
              <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Reason for Visit <Text style={{ color: t.accent }}>*</Text></Text>
              <Text style={styles.fieldHint}>Select the main reason or describe your symptoms</Text>
              <View style={styles.reasonGrid}>
                {COMMON_REASONS.map(r => (
                  <TouchableOpacity key={r} onPress={() => setReason(r)}
                    style={[styles.reasonChip, reason === r && styles.reasonChipActive]}>
                    <Text style={[styles.reasonText, reason === r && styles.reasonTextActive]}>{r}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {reason === 'Other' && (
                <TextInput
                  value={customReason}
                  onChangeText={setCustomReason}
                  placeholder="Describe your symptoms or reason…"
                  placeholderTextColor={t.textMuted}
                  style={styles.textArea}
                  multiline
                  numberOfLines={3}
                  maxLength={300}
                />
              )}

              {/* Service selection (optional) */}
              {services.length > 0 && (
                <>
                  <Text style={[styles.fieldLabel, { marginTop: spacing.xl }]}>Service <Text style={styles.optionalTag}>(optional)</Text></Text>
                  <Text style={styles.fieldHint}>Select if you need a specific service</Text>
                  <View style={styles.cardList}>
                    {services.map(svc => {
                      const price = selectedType === 'virtual' ? svc.virtual_price : svc.base_price
                      const active = selectedService?.id === svc.id
                      return (
                        <TouchableOpacity key={svc.id}
                          onPress={() => setService(active ? null : svc)}
                          style={[styles.card, active && styles.cardActive]}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.cardTitle, active && { color: t.text }]}>{svc.name}</Text>
                            {svc.description ? <Text style={styles.cardSub}>{svc.description}</Text> : null}
                            {svc.duration_mins ? <Text style={styles.cardMeta}>~{svc.duration_mins} min</Text> : null}
                          </View>
                          {price ? <Text style={styles.feeText}>₦{price.toLocaleString()}</Text> : null}
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </>
              )}
            </View>
          )}

          {/* ── Step 4: Date ─────────────────────────────────────────────────── */}
          {step === 4 && (
            <View>
              <Text style={styles.stepTitle}>Select Date</Text>
              <Text style={styles.stepSubtitle}>Choose your preferred appointment date</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -spacing.xl }}
                contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
                {days.map(day => {
                  const d = new Date(day + 'T00:00:00')
                  const active = selectedDate === day
                  const isToday = day === localDateStr(new Date())
                  return (
                    <TouchableOpacity key={day} onPress={() => setDate(day)}
                      style={[styles.dayChip, active && styles.dayChipActive]}>
                      <Text style={[styles.dayChipWeekday, active && { color: t.accent }]}>
                        {isToday ? 'Today' : d.toLocaleDateString('en-NG', { weekday: 'short' })}
                      </Text>
                      <Text style={[styles.dayChipDate, active && { color: t.text }]}>{d.getDate()}</Text>
                      <Text style={[styles.dayChipMonth, active && { color: t.accent }]}>
                        {d.toLocaleDateString('en-NG', { month: 'short' })}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </View>
          )}

          {/* ── Step 5: Time Slot ─────────────────────────────────────────────── */}
          {step === 5 && (
            <View>
              <Text style={styles.stepTitle}>Select Time</Text>
              <Text style={styles.stepSubtitle}>{formatDate(selectedDate)} — available slots</Text>
              {loadingSlots ? (
                <ActivityIndicator color={t.accent} style={{ paddingVertical: 40 }} />
              ) : slots.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={{ fontSize: 32, marginBottom: 8 }}>📅</Text>
                  <Text style={styles.emptyText}>No slots available on this date.</Text>
                  <Text style={styles.emptyHint}>Go back and try a different date, or contact the hospital directly.</Text>
                  <TouchableOpacity onPress={() => setStep(4)} style={styles.emptyAction}>
                    <Text style={{ color: t.accent, fontSize: font.sm, fontWeight: '700' }}>← Change Date</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.slotsGrid}>
                  {slots.map(slot => {
                    const active = selectedSlot?.id === slot.id
                    return (
                      <TouchableOpacity key={slot.id} onPress={() => setSlot(slot)}
                        style={[styles.slotBtn, active && styles.slotBtnActive]}>
                        <Text style={[styles.slotTime, active && { color: t.accent }]}>
                          {slot.start_time.slice(0, 5)}
                        </Text>
                        <Text style={[styles.slotEnd, active && { color: t.accent + '99' }]}>
                          – {slot.end_time.slice(0, 5)}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
            </View>
          )}

          <View style={{ height: 140 }} />
        </ScrollView>

        {/* Bottom CTA */}
        <View style={styles.cta}>
          {step === 5 && selectedSlot && selectedDoctor ? (
            <View style={styles.ctaSummary}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ctaMain}>
                  {selectedDoctor.title} {selectedDoctor.full_name}
                </Text>
                <Text style={styles.ctaSub}>
                  {formatDate(selectedDate)} · {selectedSlot.start_time.slice(0, 5)} · {selectedType === 'virtual' ? '💻 Virtual' : '🏥 In-person'}
                </Text>
                {forDependent && <Text style={styles.ctaSub}>For: {forDependent.full_name}</Text>}
                {fee ? <Text style={styles.ctaFee}>₦{fee.toLocaleString()}</Text> : null}
              </View>
              <TouchableOpacity onPress={handleBook} disabled={booking} style={styles.confirmBtn}>
                {booking
                  ? <ActivityIndicator color="#060A07" />
                  : <Text style={styles.confirmBtnText}>Confirm</Text>}
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setStep((step + 1) as any)}
              disabled={!canProceed}
              style={[styles.nextBtn, !canProceed && styles.nextBtnDisabled]}>
              <Text style={styles.nextBtnText}>
                {step === 4 ? 'See Available Times →' : 'Continue →'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe:              { flex: 1, backgroundColor: t.bg },
  header:            { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.border },
  backBtn:           { width: 36, height: 36, borderRadius: 10, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  title:             { fontSize: font.lg, fontWeight: '800', color: t.text, letterSpacing: -0.4 },
  subtitle:          { fontSize: font.sm, color: t.textSub, marginTop: 1 },

  progressRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, paddingHorizontal: spacing.xl, gap: spacing.xs, borderBottomWidth: 1, borderBottomColor: t.border },
  progressItem:      { alignItems: 'center', gap: 3, flex: 1 },
  progressDot:       { width: 20, height: 20, borderRadius: 10, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  progressDone:      { backgroundColor: t.accent, borderColor: t.accent },
  progressCurrent:   { backgroundColor: t.accent, borderColor: t.accent },
  progressLabel:     { fontSize: 9, color: t.textMuted, fontWeight: '600' },

  scroll:            { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  stepTitle:         { fontSize: font.xl, fontWeight: '800', color: t.text, letterSpacing: -0.3, marginBottom: 4 },
  stepSubtitle:      { fontSize: font.sm, color: t.textSub, marginBottom: spacing.lg },

  cardList:          { flexDirection: 'column', gap: spacing.sm },
  card:              { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.md },
  cardActive:        { borderColor: t.accent, backgroundColor: t.accentMuted },
  avatar:            { width: 44, height: 44, borderRadius: 12, backgroundColor: t.accentMuted, alignItems: 'center', justifyContent: 'center', shrink: 0 },
  avatarActive:      { backgroundColor: t.accent },
  cardTitle:         { fontSize: font.base, fontWeight: '700', color: t.textSub },
  cardSub:           { fontSize: font.xs, color: t.textMuted, marginTop: 1 },
  cardMeta:          { fontSize: font.xs, color: t.textMuted, marginTop: 1 },
  feeText:           { fontSize: font.sm, fontWeight: '700', color: t.accent },
  virtualBadge:      { fontSize: font.xs, color: '#5B9EFF' },

  typeRow:           { flexDirection: 'row', gap: spacing.sm },
  typeCard:          { flex: 1, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.lg, alignItems: 'center', gap: 4 },
  typeCardActive:    { borderColor: t.accent, backgroundColor: t.accentMuted },
  typeName:          { fontSize: font.base, fontWeight: '700', color: t.textSub },
  typeMeta:          { fontSize: font.xs, color: t.textMuted },
  typePrice:         { fontSize: font.sm, fontWeight: '700', color: t.accent, marginTop: 4 },

  fieldLabel:        { fontSize: font.sm, fontWeight: '700', color: t.text, marginBottom: 4 },
  fieldHint:         { fontSize: font.xs, color: t.textMuted, marginBottom: spacing.md },
  optionalTag:       { fontWeight: '400', color: t.textMuted },

  smallCard:         { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.md },
  smallCardActive:   { borderColor: t.accent, backgroundColor: t.accentMuted },
  smallCardText:     { fontSize: font.sm, fontWeight: '700', color: t.textSub },

  reasonGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reasonChip:        { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg },
  reasonChipActive:  { borderColor: t.accent, backgroundColor: t.accentMuted },
  reasonText:        { fontSize: font.sm, color: t.textSub, fontWeight: '600' },
  reasonTextActive:  { color: t.accent },
  textArea:          { marginTop: spacing.sm, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.md, color: t.text, fontSize: font.sm, textAlignVertical: 'top', minHeight: 80 },

  dayChip:           { alignItems: 'center', backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 60 },
  dayChipActive:     { borderColor: t.accent, backgroundColor: t.accentMuted },
  dayChipWeekday:    { fontSize: font.xs, color: t.textMuted, fontWeight: '600' },
  dayChipDate:       { fontSize: font.xl, fontWeight: '800', color: t.textSub, marginTop: 2 },
  dayChipMonth:      { fontSize: font.xs, color: t.textMuted, marginTop: 1 },

  slotsGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slotBtn:           { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minWidth: '30%', alignItems: 'center' },
  slotBtnActive:     { borderColor: t.accent, backgroundColor: t.accentMuted },
  slotTime:          { fontSize: font.base, fontWeight: '800', color: t.textSub },
  slotEnd:           { fontSize: font.xs, color: t.textMuted, marginTop: 1 },

  emptyBox:          { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl * 2, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, gap: 6 },
  emptyText:         { fontSize: font.base, fontWeight: '700', color: t.textSub, textAlign: 'center' },
  emptyHint:         { fontSize: font.sm, color: t.textMuted, textAlign: 'center', paddingHorizontal: spacing.xl },
  emptyAction:       { marginTop: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, backgroundColor: t.accentMuted, borderRadius: radius.lg, borderWidth: 1, borderColor: t.accent + '40' },

  cta:               { padding: spacing.xl, paddingBottom: 32, backgroundColor: t.bg, borderTopWidth: 1, borderTopColor: t.border },
  ctaSummary:        { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ctaMain:           { fontSize: font.sm, fontWeight: '800', color: t.text },
  ctaSub:            { fontSize: font.xs, color: t.textSub, marginTop: 1 },
  ctaFee:            { fontSize: font.sm, fontWeight: '700', color: t.accent, marginTop: 2 },
  confirmBtn:        { backgroundColor: t.accent, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: spacing.xl, alignItems: 'center', justifyContent: 'center', minWidth: 120 },
  confirmBtnText:    { fontSize: font.base, fontWeight: '800', color: '#060A07' },
  nextBtn:           { backgroundColor: t.accent, borderRadius: radius.lg, paddingVertical: 16, alignItems: 'center' },
  nextBtnDisabled:   { backgroundColor: t.accentMuted, opacity: 0.5 },
  nextBtnText:       { fontSize: font.base, fontWeight: '800', color: '#060A07' },
})
