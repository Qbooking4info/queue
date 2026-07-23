import { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Animated } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../contexts/ThemeContext'

interface Props { navigation: any; route: any }

export function ConfirmationScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()

  const {
    hospital,
    doctor,          // null for physical or virtual with no preference
    bookingRef,
    approvalStatus,  // 'auto_approved' | 'pending_approval'
    selectedDate,
    urgency,
    bookingType,     // 'virtual' | 'physical'
  } = route.params ?? {}

  const isPending  = approvalStatus === 'pending_approval'
  const isVirtual  = bookingType === 'virtual'
  const doctorName = doctor?.full_name ?? doctor?.name ?? null

  const scale   = useRef(new Animated.Value(0.3)).current
  const opacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.timing(opacity, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start()
  }, [])

  function goHome() {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Home' } }] })
  }
  function goBookings() {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Appointments' } }] })
  }

  const accentColor = isPending ? '#EF9F27' : t.accent

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: t.splashBg }]}>
      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

        {/* Animated icon */}
        <Animated.View style={[st.checkWrap, { opacity, transform: [{ scale }] }]}>
          <View style={[st.checkCircle, {
            backgroundColor: isPending ? 'rgba(239,159,39,0.14)' : t.accentBgMid,
            borderColor:     isPending ? 'rgba(239,159,39,0.35)' : t.accentBorder,
          }]}>
            <Ionicons name={isPending ? 'document-text-outline' : 'checkmark-circle'} size={38} color={accentColor} />
          </View>
          <Text style={st.headline}>
            {isPending ? 'Booking submitted!' : 'Booking confirmed!'}
          </Text>
          <Text style={st.sub}>
            {isPending
              ? 'The hospital will review your request and notify you once approved.'
              : 'We\'ll send you a reminder before your appointment.'}
          </Text>
        </Animated.View>

        {/* Pending approval notice */}
        {isPending && (
          <Animated.View style={[st.pendingBanner, { opacity }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <Ionicons name="hourglass-outline" size={14} color="#EF9F27" />
              <Text style={[st.pendingTitle, { marginBottom: 0 }]}>Awaiting hospital approval</Text>
            </View>
            <Text style={st.pendingText}>
              Your payment will only be charged once the hospital approves your booking.
              If rejected, you'll receive a full refund.
            </Text>
          </Animated.View>
        )}

        {/* Booking card */}
        <Animated.View style={[st.card, { opacity }]}>
          <View style={st.cardHeader}>
            <View>
              <Text style={st.cardHeaderLabel}>Booking ID</Text>
              <Text style={[st.bookingId, { color: accentColor }]}>{bookingRef ?? '—'}</Text>
            </View>
            <View style={[st.statusPill, {
              backgroundColor: isPending ? 'rgba(239,159,39,0.14)' : t.accentBgMid,
              borderColor:     isPending ? 'rgba(239,159,39,0.35)' : t.accentBorder,
            }]}>
              <Text style={[st.statusText, { color: accentColor }]}>
                {isPending ? 'Pending Review' : 'Confirmed'}
              </Text>
            </View>
          </View>

          {[
            {
              icon: isVirtual ? 'videocam-outline' as const : 'walk-outline' as const,
              label: 'Visit type',
              value: isVirtual ? 'Virtual consultation' : 'Physical visit',
            },
            {
              icon: 'person-outline' as const,
              label: 'Doctor',
              value: doctorName
                ?? (isVirtual ? 'Hospital will assign' : 'Assigned when you arrive'),
            },
            {
              icon: 'business-outline' as const,
              label: 'Hospital',
              value: hospital?.name ?? '—',
            },
            {
              icon: 'calendar-outline' as const,
              label: 'Date',
              value: selectedDate ?? '—',
            },
            {
              icon: 'flash-outline' as const,
              label: 'Urgency',
              value: urgency
                ? urgency.charAt(0).toUpperCase() + urgency.slice(1)
                : 'Routine',
            },
          ].map(row => (
            <View key={row.label} style={st.cardRow}>
              <View style={st.cardRowLeft}>
                <Ionicons name={row.icon} size={14} color="rgba(255,255,255,0.5)" />
                <Text style={st.cardLabel}>{row.label}</Text>
              </View>
              <Text style={st.cardValue} numberOfLines={2}>{row.value}</Text>
            </View>
          ))}
        </Animated.View>

        {/* What happens next */}
        <Animated.View style={[st.noteBox, { opacity }]}>
          <Text style={st.noteTitle}>What happens next</Text>
          {isVirtual ? (
            isPending ? (
              <Text style={st.noteText}>
                1. Hospital reviews your booking request{'\n'}
                2. You'll receive a notification when approved{'\n'}
                3. A doctor will be confirmed for your virtual session{'\n'}
                4. Check your Bookings tab for updates
              </Text>
            ) : (
              <Text style={st.noteText}>
                {doctorName
                  ? `Your virtual appointment with ${doctorName} is confirmed.`
                  : 'The hospital will assign a doctor for your virtual session.'}{'\n'}
                Check your Bookings tab for the meeting link when your appointment time approaches.
              </Text>
            )
          ) : (
            <Text style={st.noteText}>
              Present at the {hospital?.name ?? 'hospital'} reception on {selectedDate ?? 'the scheduled date'}.{'\n'}
              The front desk will assign you an available doctor when you arrive.
            </Text>
          )}
        </Animated.View>

        {/* Actions */}
        <Animated.View style={[st.actions, { opacity }]}>
          <TouchableOpacity onPress={goBookings}
            style={[st.secondaryBtn, { borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.06)' }]}>
            <Text style={st.secondaryBtnText}>View bookings</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goHome}
            style={[st.primaryBtn, { backgroundColor: accentColor }]}>
            <Text style={st.primaryBtnText}>Back to home</Text>
          </TouchableOpacity>
        </Animated.View>

      </ScrollView>
    </SafeAreaView>
  )
}

const st = StyleSheet.create({
  safe:            { flex: 1 },
  content:         { alignItems: 'center', padding: 28, paddingTop: 40 },
  checkWrap:       { alignItems: 'center', marginBottom: 24 },
  checkCircle:     { width: 88, height: 88, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 18 },
  checkIcon:       { fontSize: 38 },
  headline:        { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.8, textAlign: 'center' },
  sub:             { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6, textAlign: 'center', lineHeight: 19 },
  pendingBanner:   { width: '100%', backgroundColor: 'rgba(239,159,39,0.1)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(239,159,39,0.3)', marginBottom: 14 },
  pendingTitle:    { fontSize: 13, fontWeight: '700', color: '#EF9F27', marginBottom: 5 },
  pendingText:     { fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 18 },
  card:            { width: '100%', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 20, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginBottom: 12 },
  cardHeader:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' },
  cardHeaderLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.7, textTransform: 'uppercase', marginBottom: 3 },
  bookingId:       { fontSize: 14, fontWeight: '800' },
  statusPill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  statusText:      { fontSize: 11, fontWeight: '700' },
  cardRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)', gap: 12 },
  cardRowLeft:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardRowIcon:     { fontSize: 14 },
  cardLabel:       { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  cardValue:       { fontSize: 12, color: 'rgba(255,255,255,0.88)', fontWeight: '600', textAlign: 'right', flex: 1 },
  noteBox:         { width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 20 },
  noteTitle:       { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.6)', marginBottom: 7 },
  noteText:        { fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 19 },
  actions:         { flexDirection: 'row', gap: 9, width: '100%' },
  secondaryBtn:    { flex: 1, padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
  secondaryBtnText:{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  primaryBtn:      { flex: 1, padding: 14, borderRadius: 14, alignItems: 'center' },
  primaryBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },
})
