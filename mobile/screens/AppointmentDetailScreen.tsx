import { useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Alert,
} from 'react-native'
import { useTheme } from '../contexts/ThemeContext'
import { Avatar } from '../components/ui/Avatar'
import { Stars } from '../components/ui/Stars'

interface Props { navigation: any; route: any }

// ── Helpers ────────────────────────────────────────────────────────────────

function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  const { theme: t } = useTheme()
  return (
    <View style={[st.infoRow, { borderBottomColor: t.cardBorder }]}>
      <Text style={[st.infoLabel, { color: t.textMuted }]}>{label}</Text>
      <Text style={[st.infoValue, { color: accent ? t.accent : t.textPrimary }]}>{value}</Text>
    </View>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { theme: t } = useTheme()
  return (
    <View style={[st.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
      <Text style={[st.sectionTitle, { color: t.textMuted, borderBottomColor: t.cardBorder }]}>{title}</Text>
      {children}
    </View>
  )
}

// ── Screen ─────────────────────────────────────────────────────────────────

export function AppointmentDetailScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const raw = route?.params?.appointment ?? DEFAULT_APPT
  const [cancelled, setCancelled] = useState(false)

  // Normalise fields — works with both Supabase AppointmentWithRelations and old mock shape
  const appt = {
    id:           raw.booking_ref ?? raw.id,
    doctor:       raw.doctor?.full_name ?? raw.doctor ?? 'Doctor',
    doctorAvatar: raw.doctor?.full_name
      ? raw.doctor.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
      : (raw.doctorAvatar ?? 'DR'),
    spec:         (raw.doctor as any)?.specialty?.name ?? raw.spec ?? 'Specialist',
    hospital:     raw.hospital?.name ?? raw.hospital ?? 'Hospital',
    date:         raw.appointment_date ?? raw.date,
    time:         raw.start_time ?? raw.time,
    status:       raw.status,
    type:         raw.type,
    payment:      raw.payment ?? '—',
    rating:       raw.doctor?.avg_rating ?? raw.rating ?? 0,
    queue_position: raw.queue_position,
    estimated_wait: raw.estimated_wait,
  }

  const isVirtual   = appt.type === 'virtual'
  const isUpcoming  = ['confirmed', 'pending', 'checked_in', 'in_progress'].includes(appt.status)
  const isConfirmed = ['confirmed', 'checked_in'].includes(appt.status)

  const statusColor = {
    confirmed:   { bg: t.accentBg,  text: t.accent,    border: t.accentBorder },
    pending:     { bg: '#FEF8E7',   text: '#633806',   border: 'rgba(196,127,0,0.3)' },
    completed:   { bg: t.inputBg,   text: t.textMuted, border: t.cardBorder },
    cancelled:   { bg: '#FCEBEB',   text: '#791F1F',   border: 'rgba(163,45,45,0.3)' },
    checked_in:  { bg: '#E8F4FE',   text: '#1A5A8C',   border: 'rgba(26,90,140,0.3)' },
    in_progress: { bg: '#FEF0E6',   text: '#7A3A00',   border: 'rgba(122,58,0,0.3)' },
  }[cancelled ? 'cancelled' : appt.status as string] ?? { bg: t.accentBg, text: t.accent, border: t.accentBorder }

  const handleCancel = () => {
    Alert.alert(
      'Cancel appointment?',
      'A refund will be processed within 2–3 business days. Are you sure?',
      [
        { text: 'Keep appointment', style: 'cancel' },
        { text: 'Yes, cancel', style: 'destructive', onPress: () => setCancelled(true) },
      ]
    )
  }

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: t.canvasBg }]}>
      {/* Header */}
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={st.backBtn}>
          <Text style={[st.backArrow, { color: t.textMuted }]}>←</Text>
        </TouchableOpacity>
        <Text style={[st.headerTitle, { color: t.textPrimary }]}>Appointment</Text>
        <View style={[st.statusBadge, { backgroundColor: statusColor.bg, borderColor: statusColor.border }]}>
          <Text style={[st.statusText, { color: statusColor.text }]}>
            {cancelled ? 'Cancelled' : appt.status.charAt(0).toUpperCase() + appt.status.slice(1)}
          </Text>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>

        {/* Hero card */}
        <View style={[st.heroCard, { backgroundColor: t.bannerBg, borderColor: t.bannerBorder }]}>
          {/* Booking ID */}
          <View style={st.bookingIdRow}>
            <Text style={[st.bookingIdLabel, { color: t.accent }]}>BOOKING ID</Text>
            <Text style={[st.bookingId, { color: t.accent }]}>{appt.id}</Text>
          </View>

          {/* Doctor */}
          <View style={st.doctorRow}>
            <Avatar initials={appt.doctorAvatar ?? 'AO'} bg="#1A3A28" size={52} />
            <View style={{ flex: 1 }}>
              <Text style={st.doctorName}>{appt.doctor}</Text>
              <Text style={[st.doctorSpec, { color: 'rgba(255,255,255,0.55)' }]}>{appt.spec}</Text>
              <Stars rating={appt.rating ?? 4.9} />
            </View>
            {isVirtual && (
              <View style={[st.typePill, { backgroundColor: 'rgba(91,158,255,0.15)', borderColor: 'rgba(91,158,255,0.3)' }]}>
                <Text style={[st.typePillText, { color: '#85B7EB' }]}>💻 Virtual</Text>
              </View>
            )}
            {!isVirtual && (
              <View style={[st.typePill, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
                <Text style={[st.typePillText, { color: t.accent }]}>🏥 In-person</Text>
              </View>
            )}
          </View>

          {/* Date / time chips */}
          <View style={st.chipsRow}>
            {[
              { icon: '📅', val: appt.date },
              { icon: '⏰', val: appt.time },
              { icon: '📍', val: appt.hospital },
            ].map(c => (
              <View key={c.val} style={[st.chip, { backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.12)' }]}>
                <Text style={st.chipIcon}>{c.icon}</Text>
                <Text style={st.chipText} numberOfLines={1}>{c.val}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Virtual join banner */}
        {isVirtual && isConfirmed && !cancelled && (
          <TouchableOpacity style={[st.joinBanner, { backgroundColor: '#0D2240', borderColor: 'rgba(91,158,255,0.35)' }]}>
            <Text style={{ fontSize: 22 }}>📹</Text>
            <View style={{ flex: 1 }}>
              <Text style={[st.joinTitle, { color: '#85B7EB' }]}>Virtual consultation</Text>
              <Text style={[st.joinSub, { color: 'rgba(133,183,235,0.6)' }]}>Your video room opens 5 minutes before your slot</Text>
            </View>
            <View style={[st.joinBtn, { backgroundColor: '#1A7FC1' }]}>
              <Text style={st.joinBtnText}>Join</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Queue position (in-person upcoming) */}
        {!isVirtual && isConfirmed && !cancelled && (
          <View style={[st.queueCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <View style={st.queueLeft}>
              <Text style={[st.queueNum, { color: t.accent }]}>
                {appt.queue_position ?? '—'}
              </Text>
              <Text style={[st.queueLabel, { color: t.textMuted }]}>Queue position</Text>
            </View>
            <View style={[st.queueDivider, { backgroundColor: t.cardBorder }]} />
            <View style={st.queueRight}>
              <Text style={[st.queueNum, { color: t.textPrimary }]}>
                {appt.estimated_wait ? `~${appt.estimated_wait} min` : '—'}
              </Text>
              <Text style={[st.queueLabel, { color: t.textMuted }]}>Est. wait after check-in</Text>
            </View>
          </View>
        )}

        <View style={st.pad}>
          {/* Appointment details */}
          <Section title="Appointment details">
            <InfoRow label="Date"      value={appt.date} />
            <InfoRow label="Time"      value={appt.time} />
            <InfoRow label="Type"      value={isVirtual ? 'Virtual consultation' : 'In-person visit'} />
            <InfoRow label="Specialty" value={appt.spec} />
            <InfoRow label="Hospital"  value={appt.hospital} />
            <InfoRow label="Fee"       value={appt.payment} accent />
          </Section>

          {/* Doctor info */}
          <Section title="Your doctor">
            <View style={[st.doctorCard, { borderBottomColor: t.cardBorder }]}>
              <Avatar initials={appt.doctorAvatar ?? 'AO'} bg="#1A3A28" size={44} />
              <View style={{ flex: 1 }}>
                <Text style={[st.dcName, { color: t.textPrimary }]}>{appt.doctor}</Text>
                <Text style={[st.dcSpec, { color: t.textMuted }]}>{appt.spec} · {appt.hospital}</Text>
                <Stars rating={appt.rating ?? 4.9} />
              </View>
            </View>
            <InfoRow label="Experience"  value="12 years" />
            <InfoRow label="Consultations" value="1,240+ completed" />
            <InfoRow label="Languages"   value="English, Yoruba, Igbo" />
          </Section>

          {/* How to prepare */}
          {isUpcoming && !cancelled && (
            <Section title="How to prepare">
              {(isVirtual ? [
                '📶  Ensure stable internet connection before your session',
                '🎧  Use headphones for clearer audio',
                '📋  Have your previous test results ready to share',
                '💡  Find a quiet, well-lit space for the call',
              ] : [
                '🕐  Arrive 10 minutes before your appointment time',
                '🪪  Bring a valid ID and your HMO card if applicable',
                '📋  Bring any previous test results or referral letters',
                '💊  Bring a list of medications you currently take',
              ]).map(tip => (
                <View key={tip} style={[st.tipRow, { borderBottomColor: t.cardBorder }]}>
                  <Text style={[st.tipText, { color: t.textSecondary }]}>{tip}</Text>
                </View>
              ))}
            </Section>
          )}

          {/* Payment */}
          <Section title="Payment">
            <InfoRow label="Consultation fee" value={appt.payment} />
            <InfoRow label="Platform fee"     value="₦500" />
            <InfoRow label="Total paid"       value={appt.payment} accent />
            <InfoRow label="Payment method"   value="Card ending in 4522" />
          </Section>

          {/* Actions */}
          {isUpcoming && !cancelled && (
            <View style={st.actions}>
              <TouchableOpacity style={[st.rescheduleBtn, { borderColor: t.cardBorder, backgroundColor: t.cardBg }]}>
                <Text style={[st.rescheduleTxt, { color: t.textPrimary }]}>🗓  Reschedule</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleCancel}
                style={[st.cancelBtn, { borderColor: 'rgba(255,92,92,0.3)', backgroundColor: 'rgba(255,92,92,0.08)' }]}>
                <Text style={[st.cancelTxt, { color: '#FF5C5C' }]}>✕  Cancel</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Completed — rate & rebook */}
          {appt.status === 'completed' && (
            <View style={st.actions}>
              <TouchableOpacity style={[st.rescheduleBtn, { borderColor: t.accentBorder, backgroundColor: t.accentBg, flex: 1 }]}>
                <Text style={[st.rescheduleTxt, { color: t.accent }]}>⭐  Rate Dr. {appt.doctor.split(' ').pop()}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Cancelled refund note */}
          {cancelled && (
            <View style={[st.refundNote, { backgroundColor: 'rgba(255,92,92,0.08)', borderColor: 'rgba(255,92,92,0.2)' }]}>
              <Text style={[st.refundText, { color: '#FF5C5C' }]}>
                ✓  Appointment cancelled. Refund of {appt.payment} will arrive in 2–3 business days.
              </Text>
            </View>
          )}

          <View style={{ height: 32 }} />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

// Default data (used from the banner on HomeScreen)
const DEFAULT_APPT = {
  id: 'QUE-00421',
  hospital: 'Lagos Island General',
  doctor: 'Dr. Amaka Osei',
  doctorAvatar: 'AO',
  spec: 'Cardiology',
  date: 'Thu, 29 May',
  time: '9:00 AM',
  status: 'confirmed',
  type: 'in-person',
  payment: '₦15,500',
  rating: 4.9,
}

const st = StyleSheet.create({
  safe:           { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  backBtn:        { padding: 4 },
  backArrow:      { fontSize: 22 },
  headerTitle:    { flex: 1, fontSize: 18, fontWeight: '800', letterSpacing: -0.5 },
  statusBadge:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  statusText:     { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  // Hero
  heroCard:       { marginHorizontal: 20, borderRadius: 20, padding: 16, borderWidth: 1, marginBottom: 12 },
  bookingIdRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  bookingIdLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  bookingId:      { fontSize: 11, fontWeight: '700' },
  doctorRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  doctorName:     { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  doctorSpec:     { fontSize: 12, marginTop: 1, marginBottom: 4 },
  typePill:       { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  typePillText:   { fontSize: 10, fontWeight: '700' },
  chipsRow:       { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:           { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 99, borderWidth: 1, maxWidth: '100%' },
  chipIcon:       { fontSize: 12 },
  chipText:       { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '500', flexShrink: 1 },
  // Virtual join
  joinBanner:     { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, borderRadius: 16, padding: 14, borderWidth: 1, marginBottom: 12 },
  joinTitle:      { fontSize: 13, fontWeight: '700' },
  joinSub:        { fontSize: 11, marginTop: 2 },
  joinBtn:        { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  joinBtnText:    { fontSize: 12, fontWeight: '700', color: '#fff' },
  // Queue
  queueCard:      { flexDirection: 'row', marginHorizontal: 20, borderRadius: 16, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  queueLeft:      { flex: 1, alignItems: 'center', padding: 14 },
  queueRight:     { flex: 1, alignItems: 'center', padding: 14 },
  queueDivider:   { width: 1 },
  queueNum:       { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  queueLabel:     { fontSize: 10, marginTop: 2, textAlign: 'center' },
  // Pad
  pad:            { paddingHorizontal: 20 },
  // Section
  section:        { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 12 },
  sectionTitle:   { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, padding: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  // Rows
  infoRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 11, paddingHorizontal: 14, borderBottomWidth: 1, gap: 12 },
  infoLabel:      { fontSize: 12, flexShrink: 0 },
  infoValue:      { fontSize: 12, fontWeight: '600', textAlign: 'right', flex: 1 },
  // Doctor card
  doctorCard:     { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderBottomWidth: 1 },
  dcName:         { fontSize: 14, fontWeight: '700' },
  dcSpec:         { fontSize: 11, marginTop: 1, marginBottom: 4 },
  // Tips
  tipRow:         { padding: 11, paddingHorizontal: 14, borderBottomWidth: 1 },
  tipText:        { fontSize: 12, lineHeight: 18 },
  // Actions
  actions:        { flexDirection: 'row', gap: 10, marginBottom: 12 },
  rescheduleBtn:  { flex: 1, padding: 13, borderRadius: 13, alignItems: 'center', borderWidth: 1 },
  rescheduleTxt:  { fontSize: 13, fontWeight: '600' },
  cancelBtn:      { flex: 1, padding: 13, borderRadius: 13, alignItems: 'center', borderWidth: 1 },
  cancelTxt:      { fontSize: 13, fontWeight: '600' },
  // Refund
  refundNote:     { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 12 },
  refundText:     { fontSize: 12, lineHeight: 18 },
})
