import { useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView, Animated } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'

interface Props { navigation: any; route: any }

export function ConfirmationScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { hospital, doctor, slot, vtype, urgency, bookingRef } = route.params

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

  const dateLabel = slot?.slot_date ?? new Date().toLocaleDateString('en-NG')
  const timeLabel = slot?.start_time ?? '—'

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: t.splashBg }]}>
      <ScrollView contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

        {/* Animated checkmark */}
        <Animated.View style={[st.checkWrap, { opacity, transform: [{ scale }] }]}>
          <View style={[st.checkCircle, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
            <Text style={[st.checkIcon, { color: t.accent }]}>✓</Text>
          </View>
          <Text style={st.headline}>Booking confirmed!</Text>
          <Text style={st.sub}>We'll send you a reminder before your appointment.</Text>
        </Animated.View>

        {/* Booking card */}
        <Animated.View style={[st.card, { opacity }]}>
          <View style={st.cardHeader}>
            <View>
              <Text style={st.cardHeaderLabel}>Booking ID</Text>
              <Text style={[st.bookingId, { color: t.accent }]}>{bookingRef ?? 'QUE-XXXXX'}</Text>
            </View>
            <View style={[st.statusPill, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
              <Text style={[st.statusText, { color: t.accent }]}>Pending</Text>
            </View>
          </View>

          {[
            { icon: '👨‍⚕️', label: 'Doctor',   value: doctor.name },
            { icon: '🏥', label: 'Hospital', value: hospital.name },
            { icon: '📅', label: 'Date',     value: dateLabel },
            { icon: '⏰', label: 'Time',     value: timeLabel },
            { icon: '💊', label: 'Type',     value: vtype === 'virtual' ? 'Virtual consultation' : 'In-person visit' },
            { icon: '⚡', label: 'Urgency',  value: urgency.charAt(0).toUpperCase() + urgency.slice(1) },
          ].map(row => (
            <View key={row.label} style={st.cardRow}>
              <View style={st.cardRowLeft}>
                <Text style={st.cardRowIcon}>{row.icon}</Text>
                <Text style={st.cardLabel}>{row.label}</Text>
              </View>
              <Text style={st.cardValue} numberOfLines={2}>{row.value}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Info note */}
        <Animated.View style={[st.noteBox, { opacity }]}>
          <Text style={st.noteText}>
            🔔 A confirmation notification has been added to your notifications. The hospital will confirm your slot shortly.
          </Text>
        </Animated.View>

        {/* Actions */}
        <Animated.View style={[st.actions, { opacity }]}>
          <TouchableOpacity onPress={goBookings}
            style={[st.secondaryBtn, { borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.06)' }]}>
            <Text style={st.secondaryBtnText}>View bookings</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={goHome}
            style={[st.primaryBtn, { backgroundColor: t.accent }]}>
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
  // Animated header
  checkWrap:       { alignItems: 'center', marginBottom: 28 },
  checkCircle:     { width: 88, height: 88, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 2, marginBottom: 18 },
  checkIcon:       { fontSize: 38 },
  headline:        { fontSize: 24, fontWeight: '900', color: '#fff', letterSpacing: -0.8, textAlign: 'center' },
  sub:             { fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6, textAlign: 'center' },
  // Card
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
  // Note
  noteBox:         { width: '100%', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, padding: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', marginBottom: 20 },
  noteText:        { fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 18, textAlign: 'center' },
  // Buttons
  actions:         { flexDirection: 'row', gap: 9, width: '100%' },
  secondaryBtn:    { flex: 1, padding: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1 },
  secondaryBtnText:{ fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  primaryBtn:      { flex: 1, padding: 14, borderRadius: 14, alignItems: 'center' },
  primaryBtnText:  { fontSize: 13, fontWeight: '700', color: '#fff' },
})
