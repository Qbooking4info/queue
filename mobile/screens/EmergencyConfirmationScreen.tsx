import { useEffect, useState, useRef } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, Animated,
} from 'react-native'
import { useTheme } from '../contexts/ThemeContext'

interface Props { navigation: any; route: any }

export function EmergencyConfirmationScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const {
    urgency, urgencyLabel, urgencyColor,
    symptom, hospital, doctor, slot, total, bookingRef,
  } = route.params

  const [show, setShow] = useState(false)
  const [queuePos] = useState(1)           // emergency = top of queue
  const [countdown, setCountdown] = useState(slot === 'Now (walk-in)' ? 0 : getMinutes(slot))
  const pulseAnim = useRef(new Animated.Value(1)).current

  useEffect(() => { setTimeout(() => setShow(true), 100) }, [])

  // Pulse animation for the alert icon
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,    duration: 600, useNativeDriver: true }),
      ])
    ).start()
  }, [])

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return
    const t = setInterval(() => setCountdown(c => Math.max(0, c - 1)), 60000)
    return () => clearInterval(t)
  }, [])

  return (
    <SafeAreaView style={[st.safe, { backgroundColor: '#0A0301' }]}>
      <ScrollView contentContainerStyle={st.scroll} showsVerticalScrollIndicator={false}>

        {/* Pulsing icon */}
        <Animated.View style={[st.iconCircle, { transform: [{ scale: pulseAnim }],
          borderColor: urgencyColor, backgroundColor: `${urgencyColor}18`,
          opacity: show ? 1 : 0 }]}>
          <Text style={st.iconEmoji}>🚨</Text>
        </Animated.View>

        <Text style={[st.headline, { opacity: show ? 1 : 0 }]}>
          Emergency booking confirmed!
        </Text>
        <Text style={[st.sub, { color: 'rgba(255,255,255,0.5)', opacity: show ? 1 : 0 }]}>
          You have been placed at the{' '}
          <Text style={{ color: urgencyColor, fontWeight: '700' }}>top of the queue</Text>
        </Text>

        {/* Live queue card */}
        <View style={[st.queueCard, { borderColor: `${urgencyColor}40`, backgroundColor: `${urgencyColor}0D`, opacity: show ? 1 : 0 }]}>
          <View style={st.queueStat}>
            <Text style={[st.queueNum, { color: urgencyColor }]}>#{queuePos}</Text>
            <Text style={[st.queueLabel, { color: 'rgba(255,255,255,0.4)' }]}>Queue position</Text>
          </View>
          <View style={[st.queueDivider, { backgroundColor: `${urgencyColor}30` }]} />
          <View style={st.queueStat}>
            <Text style={[st.queueNum, { color: '#fff' }]}>
              {countdown === 0 ? 'Now' : `~${countdown} min`}
            </Text>
            <Text style={[st.queueLabel, { color: 'rgba(255,255,255,0.4)' }]}>
              {slot === 'Now (walk-in)' ? 'Walk in now' : 'Time to slot'}
            </Text>
          </View>
          <View style={[st.queueDivider, { backgroundColor: `${urgencyColor}30` }]} />
          <View style={st.queueStat}>
            <Text style={[st.queueNum, { color: '#fff' }]}>₦{total?.toLocaleString()}</Text>
            <Text style={[st.queueLabel, { color: 'rgba(255,255,255,0.4)' }]}>Paid</Text>
          </View>
        </View>

        {/* Booking details */}
        <View style={[st.detailCard, { opacity: show ? 1 : 0 }]}>
          <View style={st.detailHeader}>
            <Text style={st.detailHeaderLabel}>Booking reference</Text>
            <Text style={[st.bookingId, { color: urgencyColor }]}>{bookingRef ?? 'QUE-EMG-XXXXX'}</Text>
          </View>

          {[
            { label: 'Hospital',   value: hospital?.name ?? '—' },
            { label: 'Doctor',     value: doctor?.full_name ?? doctor?.name ?? '—' },
            { label: 'Arrival',    value: slot ?? '—' },
            { label: 'Urgency',    value: urgencyLabel },
            { label: 'Condition',  value: symptom ?? '—' },
          ].map(row => (
            <View key={row.label} style={st.detailRow}>
              <Text style={st.detailLabel}>{row.label}</Text>
              <Text style={st.detailValue} numberOfLines={2}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Instructions */}
        <View style={[st.instructCard, { borderColor: `${urgencyColor}30`, backgroundColor: `${urgencyColor}0A`, opacity: show ? 1 : 0 }]}>
          <Text style={[st.instructTitle, { color: urgencyColor }]}>What to do now</Text>
          {[
            slot === 'Now (walk-in)'
              ? '🏃  Head to the hospital immediately — show this booking at the front desk'
              : `⏰  Arrive at ${hospital?.name} by your selected time`,
            '🪪  Bring a valid ID and this booking confirmation',
            '📋  You are flagged as priority — front desk has been notified',
            '📞  Hospital contact will be shared via SMS shortly',
          ].map(tip => (
            <View key={tip} style={[st.instructRow, { borderBottomColor: `${urgencyColor}20` }]}>
              <Text style={[st.instructText, { color: 'rgba(255,255,255,0.75)' }]}>{tip}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={[st.actions, { opacity: show ? 1 : 0 }]}>
          <TouchableOpacity style={[st.callBtn, { borderColor: `${urgencyColor}40`, backgroundColor: `${urgencyColor}18` }]}>
            <Text style={[st.callBtnText, { color: urgencyColor }]}>📞  Call hospital</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[st.callBtn, { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)' }]}>
            <Text style={[st.callBtnText, { color: 'rgba(255,255,255,0.6)' }]}>🗺  Get directions</Text>
          </TouchableOpacity>
        </View>

        <View style={[st.actionRow, { opacity: show ? 1 : 0 }]}>
          <TouchableOpacity
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Appointments' } }] })}
            style={[st.secondaryBtn, { borderColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={st.secondaryBtnText}>View bookings</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Home' } }] })}
            style={[st.doneBtn, { backgroundColor: urgencyColor }]}>
            <Text style={st.doneBtnText}>Back to home</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

function getMinutes(slot: string): number {
  if (slot === '15 min') return 15
  if (slot === '30 min') return 30
  if (slot === '45 min') return 45
  if (slot === '1 hr')   return 60
  return 0
}

const st = StyleSheet.create({
  safe:             { flex: 1 },
  scroll:           { alignItems: 'center', padding: 24, paddingTop: 40 },
  iconCircle:       { width: 90, height: 90, borderRadius: 28, alignItems: 'center',
                      justifyContent: 'center', borderWidth: 2, marginBottom: 18 },
  iconEmoji:        { fontSize: 38 },
  headline:         { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.6,
                      textAlign: 'center', marginBottom: 6 },
  sub:              { fontSize: 13, textAlign: 'center', lineHeight: 19, marginBottom: 24 },
  // Queue card
  queueCard:        { width: '100%', flexDirection: 'row', borderRadius: 18, borderWidth: 1,
                      overflow: 'hidden', marginBottom: 16 },
  queueStat:        { flex: 1, alignItems: 'center', paddingVertical: 16 },
  queueNum:         { fontSize: 20, fontWeight: '800', letterSpacing: -0.5 },
  queueLabel:       { fontSize: 10, marginTop: 3, textAlign: 'center' },
  queueDivider:     { width: 1 },
  // Detail card
  detailCard:       { width: '100%', backgroundColor: 'rgba(255,255,255,0.05)',
                      borderRadius: 18, padding: 16, marginBottom: 14,
                      borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  detailHeader:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  detailHeaderLabel:{ fontSize: 11, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: 0.7 },
  bookingId:        { fontSize: 12, fontWeight: '700' },
  detailRow:        { flexDirection: 'row', justifyContent: 'space-between',
                      paddingVertical: 8, borderBottomWidth: 1,
                      borderBottomColor: 'rgba(255,255,255,0.07)', gap: 12 },
  detailLabel:      { fontSize: 12, color: 'rgba(255,255,255,0.4)', flexShrink: 0 },
  detailValue:      { fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: '500',
                      textAlign: 'right', flex: 1 },
  // Instructions
  instructCard:     { width: '100%', borderRadius: 16, padding: 14, borderWidth: 1, marginBottom: 16 },
  instructTitle:    { fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
                      letterSpacing: 0.7, marginBottom: 10 },
  instructRow:      { paddingVertical: 8, borderBottomWidth: 1 },
  instructText:     { fontSize: 12, lineHeight: 18 },
  // Actions
  actions:          { flexDirection: 'row', gap: 10, width: '100%', marginBottom: 12 },
  callBtn:          { flex: 1, padding: 13, borderRadius: 13, alignItems: 'center', borderWidth: 1 },
  callBtnText:      { fontSize: 12, fontWeight: '700' },
  actionRow:        { flexDirection: 'row', gap: 9, width: '100%' },
  secondaryBtn:     { flex: 1, padding: 13, borderRadius: 13, alignItems: 'center', borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  secondaryBtnText: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  doneBtn:          { flex: 1, padding: 13, borderRadius: 13, alignItems: 'center' },
  doneBtnText:      { fontSize: 13, fontWeight: '700', color: '#fff' },
})
