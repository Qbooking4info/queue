import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, SafeAreaView } from 'react-native'
import { useTheme } from '../contexts/ThemeContext'

interface Props { navigation: any; route: any }

export function ConfirmationScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { hospital, doctor, slot, vtype, urgency } = route.params
  const [show, setShow] = useState(false)
  useEffect(() => { setTimeout(() => setShow(true), 100) }, [])

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.splashBg }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Checkmark */}
        <View style={[styles.checkCircle, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder,
          opacity: show ? 1 : 0, transform: [{ scale: show ? 1 : 0.4 }] }]}>
          <Text style={[styles.check, { color: t.accent }]}>✓</Text>
        </View>

        <Text style={[styles.headline, { opacity: show ? 1 : 0 }]}>Booking confirmed!</Text>
        <Text style={[styles.sub, { color: 'rgba(255,255,255,0.5)', opacity: show ? 1 : 0 }]}>
          Reminder sent to your phone and email
        </Text>

        {/* Booking card */}
        <View style={[styles.card, { opacity: show ? 1 : 0 }]}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardHeaderLabel}>Booking ID</Text>
            <Text style={[styles.bookingId, { color: t.accent }]}>QUE-00422</Text>
          </View>
          {[
            { label: 'Doctor',   value: doctor.name },
            { label: 'Hospital', value: hospital.name },
            { label: 'Date',     value: 'Thu, 29 May 2025' },
            { label: 'Time',     value: slot ?? '—' },
            { label: 'Type',     value: vtype === 'virtual' ? 'Virtual consult' : 'In-person' },
            { label: 'Urgency',  value: urgency.charAt(0).toUpperCase() + urgency.slice(1) },
          ].map(row => (
            <View key={row.label} style={styles.cardRow}>
              <Text style={styles.cardLabel}>{row.label}</Text>
              <Text style={styles.cardValue} numberOfLines={2}>{row.value}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <View style={[styles.actions, { opacity: show ? 1 : 0 }]}>
          <TouchableOpacity style={styles.calBtn}>
            <Text style={styles.calBtnText}>Add to calendar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('MainTabs', { screen: 'Appointments' })}
            style={[styles.doneBtn, { backgroundColor: t.accent }]}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:           { flex: 1 },
  content:        { alignItems: 'center', padding: 28, paddingTop: 48 },
  checkCircle:    { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, marginBottom: 18 },
  check:          { fontSize: 34 },
  headline:       { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.8, textAlign: 'center' },
  sub:            { fontSize: 13, marginTop: 6, textAlign: 'center' },
  card:           { width: '100%', backgroundColor: 'rgba(255,255,255,0.06)',
                    borderRadius: 18, padding: 18, marginTop: 24,
                    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cardHeaderLabel:{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.7, textTransform: 'uppercase' },
  bookingId:      { fontSize: 12, fontWeight: '700', fontFamily: undefined },
  cardRow:        { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8,
                    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)', gap: 16 },
  cardLabel:      { fontSize: 12, color: 'rgba(255,255,255,0.4)' },
  cardValue:      { fontSize: 12, color: 'rgba(255,255,255,0.9)', fontWeight: '500', textAlign: 'right', flex: 1 },
  actions:        { flexDirection: 'row', gap: 9, marginTop: 18, width: '100%' },
  calBtn:         { flex: 1, padding: 13, borderRadius: 13, alignItems: 'center',
                    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)' },
  calBtnText:     { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  doneBtn:        { flex: 1, padding: 13, borderRadius: 13, alignItems: 'center' },
  doneBtnText:    { fontSize: 12, fontWeight: '700', color: '#fff' },
})
