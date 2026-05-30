import { useState, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, SafeAreaView, Alert, ActivityIndicator } from 'react-native'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'

interface Doctor {
  id: string; full_name: string; title: string; qualification: string | null
  consultation_fee: number | null; virtual_fee: number | null; accepts_virtual: boolean
  specialties: { name: string } | null
}

interface TimeSlot {
  id: string; start_time: string; end_time: string; is_virtual: boolean | null
  booked_count: number | null; max_capacity: number | null
}

interface Hospital {
  id: string; name: string; phone: string | null; whatsapp: string | null
}

function localDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
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

function formatDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function BookingScreen({ route, navigation }: { route: any; navigation: any }) {
  const hospital: Hospital = route.params.hospital
  const preselectedDoctor: Doctor | null = route.params.doctor ?? null

  const [doctors, setDoctors]       = useState<Doctor[]>([])
  const [selectedDoctor, setDoctor] = useState<Doctor | null>(preselectedDoctor)
  const [selectedDate, setDate]     = useState<string>(getNextDays(1)[0])
  const [selectedType, setType]     = useState<'in-person' | 'virtual'>('in-person')
  const [slots, setSlots]           = useState<TimeSlot[]>([])
  const [selectedSlot, setSlot]     = useState<TimeSlot | null>(null)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [booking, setBooking]       = useState(false)

  const days = getNextDays(14)

  useEffect(() => {
    supabase.from('doctors')
      .select('id,full_name,title,qualification,consultation_fee,virtual_fee,accepts_virtual,specialties(name)')
      .eq('hospital_id', hospital.id)
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setDoctors((data as Doctor[]) ?? []))
  }, [hospital.id])

  useEffect(() => {
    if (!selectedDoctor || !selectedDate) return
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
        setSlots(available.filter(s =>
          s.max_capacity == null || (s.booked_count ?? 0) < s.max_capacity
        ))
        setLoadingSlots(false)
      })
      .catch(() => setLoadingSlots(false))
  }, [selectedDoctor, selectedDate, selectedType, hospital.id])

  async function handleBook() {
    if (!selectedDoctor) { Alert.alert('Select Doctor', 'Please select a doctor.'); return }
    if (!selectedSlot) { Alert.alert('Select Time', 'Please select a time slot.'); return }

    setBooking(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setBooking(false); Alert.alert('Error', 'Please sign in again.'); return }
    const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
    if (!profile) { setBooking(false); return }

    const fee = selectedType === 'virtual' ? selectedDoctor.virtual_fee : selectedDoctor.consultation_fee

    const { error } = await supabase.from('appointments').insert({
      patient_id:       profile.id,
      hospital_id:      hospital.id,
      doctor_id:        selectedDoctor.id,
      slot_id:          selectedSlot.id,
      appointment_date: selectedDate,
      start_time:       selectedSlot.start_time,
      type:             selectedType,
      status:           'pending',
    })

    if (error) {
      setBooking(false)
      Alert.alert('Booking Failed', error.message)
      return
    }

    // Atomic-ish increment: only update if booked_count hasn't changed since we read it
    await supabase.from('time_slots')
      .update({ booked_count: (selectedSlot.booked_count ?? 0) + 1 })
      .eq('id', selectedSlot.id)
      .eq('booked_count', selectedSlot.booked_count ?? 0)

    setBooking(false)
    Alert.alert(
      'Booking Confirmed! 🎉',
      `Your appointment with ${selectedDoctor.title} ${selectedDoctor.full_name} on ${formatDate(selectedDate)} at ${selectedSlot.start_time.slice(0, 5)} is pending confirmation.${fee != null ? `\n\nFee: ₦${fee.toLocaleString()}` : ''}`,
      [{ text: 'View Bookings', onPress: () => navigation.navigate('Appointments') }]
    )
  }

  const fee = selectedType === 'virtual' ? selectedDoctor?.virtual_fee : selectedDoctor?.consultation_fee

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={{ color: t.accent, fontSize: 16 }}>←</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Book Appointment</Text>
          <Text style={styles.subtitle}>{hospital.name}</Text>
        </View>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Step 1 — Doctor */}
        <Text style={styles.stepLabel}>1. Select Doctor</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.xl }} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
          {doctors.map(d => {
            const spec = Array.isArray(d.specialties) ? d.specialties[0] : d.specialties
            const active = selectedDoctor?.id === d.id
            return (
              <TouchableOpacity key={d.id} onPress={() => setDoctor(d)}
                style={[styles.doctorChip, active && styles.doctorChipActive]}>
                <View style={[styles.doctorAvatar, active && styles.doctorAvatarActive]}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: active ? '#060A07' : t.accent }}>
                    {d.full_name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                  </Text>
                </View>
                <View>
                  <Text style={[styles.doctorChipName, active && { color: t.text }]}>{d.title} {d.full_name}</Text>
                  <Text style={styles.doctorChipSpec}>{spec?.name ?? 'General'}</Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Step 2 — Type */}
        {selectedDoctor && (
          <>
            <Text style={[styles.stepLabel, { marginTop: spacing.xl }]}>2. Appointment Type</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity onPress={() => setType('in-person')}
                style={[styles.typeBtn, selectedType === 'in-person' && styles.typeBtnActive]}>
                <Text style={{ fontSize: 20, marginBottom: 4 }}>🏥</Text>
                <Text style={[styles.typeBtnLabel, selectedType === 'in-person' && styles.typeBtnLabelActive]}>In-Person</Text>
                {selectedDoctor.consultation_fee ? <Text style={styles.typeFee}>₦{selectedDoctor.consultation_fee.toLocaleString()}</Text> : null}
              </TouchableOpacity>
              {selectedDoctor.accepts_virtual && (
                <TouchableOpacity onPress={() => setType('virtual')}
                  style={[styles.typeBtn, selectedType === 'virtual' && styles.typeBtnActive]}>
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>💻</Text>
                  <Text style={[styles.typeBtnLabel, selectedType === 'virtual' && styles.typeBtnLabelActive]}>Virtual</Text>
                  {selectedDoctor.virtual_fee ? <Text style={styles.typeFee}>₦{selectedDoctor.virtual_fee.toLocaleString()}</Text> : null}
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* Step 3 — Date */}
        {selectedDoctor && (
          <>
            <Text style={[styles.stepLabel, { marginTop: spacing.xl }]}>3. Select Date</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -spacing.xl }} contentContainerStyle={{ paddingHorizontal: spacing.xl, gap: spacing.sm }}>
              {days.map(day => {
                const d = new Date(day + 'T00:00:00')
                const active = selectedDate === day
                return (
                  <TouchableOpacity key={day} onPress={() => setDate(day)}
                    style={[styles.dayChip, active && styles.dayChipActive]}>
                    <Text style={[styles.dayChipDay, active && styles.dayChipDayActive]}>
                      {d.toLocaleDateString('en-NG', { weekday: 'short' })}
                    </Text>
                    <Text style={[styles.dayChipDate, active && styles.dayChipDateActive]}>
                      {d.getDate()}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </>
        )}

        {/* Step 4 — Time Slot */}
        {selectedDoctor && selectedDate && (
          <>
            <Text style={[styles.stepLabel, { marginTop: spacing.xl }]}>4. Select Time</Text>
            {loadingSlots ? (
              <ActivityIndicator color={t.accent} style={{ paddingVertical: 20 }} />
            ) : slots.length === 0 ? (
              <Text style={styles.noSlots}>No available slots for this date. Try another date.</Text>
            ) : (
              <View style={styles.slotsGrid}>
                {slots.map(slot => {
                  const active = selectedSlot?.id === slot.id
                  return (
                    <TouchableOpacity key={slot.id} onPress={() => setSlot(slot)}
                      style={[styles.slotBtn, active && styles.slotBtnActive]}>
                      <Text style={[styles.slotText, active && styles.slotTextActive]}>
                        {slot.start_time.slice(0, 5)}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
          </>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Confirm CTA */}
      {selectedDoctor && selectedSlot && (
        <View style={styles.cta}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ctaTime}>{formatDate(selectedDate)} · {selectedSlot.start_time.slice(0, 5)}</Text>
            {fee ? <Text style={styles.ctaFee}>₦{fee.toLocaleString()}</Text> : null}
          </View>
          <TouchableOpacity onPress={handleBook} disabled={booking} style={styles.bookBtn}>
            {booking
              ? <ActivityIndicator color="#060A07" />
              : <Text style={styles.bookBtnText}>Confirm Booking</Text>
            }
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: t.bg },
  header:             { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.border },
  backBtn:            { width: 36, height: 36, borderRadius: 10, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  title:              { fontSize: font.lg, fontWeight: '800', color: t.text, letterSpacing: -0.4 },
  subtitle:           { fontSize: font.sm, color: t.textSub, marginTop: 1 },
  scroll:             { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  stepLabel:          { fontSize: font.xs, fontWeight: '700', color: t.textSub, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: spacing.md },
  doctorChip:         { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 180 },
  doctorChipActive:   { borderColor: t.accent, backgroundColor: t.accentMuted },
  doctorAvatar:       { width: 36, height: 36, borderRadius: 10, backgroundColor: t.accentMuted, alignItems: 'center', justifyContent: 'center' },
  doctorAvatarActive: { backgroundColor: t.accent },
  doctorChipName:     { fontSize: font.sm, fontWeight: '700', color: t.textSub },
  doctorChipSpec:     { fontSize: font.xs, color: t.textMuted },
  typeRow:            { flexDirection: 'row', gap: spacing.sm },
  typeBtn:            { flex: 1, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.xl, padding: spacing.lg, alignItems: 'center' },
  typeBtnActive:      { borderColor: t.accent, backgroundColor: t.accentMuted },
  typeBtnLabel:       { fontSize: font.sm, fontWeight: '700', color: t.textSub },
  typeBtnLabelActive: { color: t.text },
  typeFee:            { fontSize: font.xs, color: t.accent, marginTop: 3 },
  dayChip:            { alignItems: 'center', backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 56 },
  dayChipActive:      { borderColor: t.accent, backgroundColor: t.accentMuted },
  dayChipDay:         { fontSize: font.xs, color: t.textMuted, fontWeight: '600' },
  dayChipDayActive:   { color: t.accent },
  dayChipDate:        { fontSize: font.lg, fontWeight: '800', color: t.textSub, marginTop: 2 },
  dayChipDateActive:  { color: t.text },
  noSlots:            { fontSize: font.sm, color: t.textMuted, textAlign: 'center', paddingVertical: 20 },
  slotsGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  slotBtn:            { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minWidth: '30%', alignItems: 'center' },
  slotBtnActive:      { borderColor: t.accent, backgroundColor: t.accentMuted },
  slotText:           { fontSize: font.sm, fontWeight: '700', color: t.textSub },
  slotTextActive:     { color: t.accent },
  cta:                { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.xl, paddingBottom: 32, backgroundColor: t.bg, borderTopWidth: 1, borderTopColor: t.border },
  ctaTime:            { fontSize: font.sm, fontWeight: '700', color: t.text },
  ctaFee:             { fontSize: font.xs, color: t.accent, marginTop: 2 },
  bookBtn:            { backgroundColor: t.accent, borderRadius: radius.lg, paddingVertical: 14, paddingHorizontal: spacing.xl, alignItems: 'center', justifyContent: 'center', minWidth: 160 },
  bookBtnText:        { fontSize: font.base, fontWeight: '800', color: '#060A07' },
})
