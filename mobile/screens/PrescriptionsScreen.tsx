import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, SafeAreaView, ActivityIndicator,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { getCompletedAppointments } from '../lib/api'

interface Props { navigation: any }

const MOCK_PRESCRIPTIONS = [
  { id: 'rx1', doctor: 'Dr. Amaka Osei', specialty: 'Cardiology', date: '2026-05-22', drug: 'Lisinopril 10mg', instructions: 'Once daily in the morning. Do not stop suddenly.', duration: '90 days', refills: 2 },
  { id: 'rx2', doctor: 'Dr. Fatima Aliyu', specialty: 'Pediatrics', date: '2026-05-06', drug: 'Amoxicillin 250mg/5ml', instructions: 'Three times daily with food for 7 days.', duration: '7 days', refills: 0 },
]

const MOCK_LABS = [
  { id: 'lab1', doctor: 'Dr. Bola Adeyemi', specialty: 'Cardiology', date: '2026-05-22', test: 'Full Blood Count (FBC)', status: 'Reviewed', result: 'Within normal range. Haemoglobin 13.2 g/dL, WBC 6.4 ×10³/μL.' },
  { id: 'lab2', doctor: 'Dr. Bola Adeyemi', specialty: 'Cardiology', date: '2026-05-22', test: 'Lipid Panel', status: 'Reviewed', result: 'LDL slightly elevated at 130 mg/dL. Recommend dietary changes.' },
]

export function PrescriptionsScreen({ navigation }: Props) {
  const { theme: t }    = useTheme()
  const { user }        = useAuth()
  const [appts, setAppts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'prescriptions' | 'labs'>('prescriptions')

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setAppts(await getCompletedAppointments(user.id))
    setLoading(false)
  }, [user])

  useFocusEffect(useCallback(() => { load() }, [load]))

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[s.back, { color: t.textMuted }]}>←</Text>
        </TouchableOpacity>
        <Text style={[s.title, { color: t.textPrimary }]}>Prescriptions & Labs</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={[s.tabBar, { borderBottomColor: t.cardBorder }]}>
        {(['prescriptions', 'labs'] as const).map(tb => (
          <TouchableOpacity key={tb} onPress={() => setTab(tb)} style={s.tabItem}>
            <Text style={[s.tabText, { color: tab === tb ? t.accent : t.textMuted, fontWeight: tab === tb ? '700' : '400' }]}>
              {tb === 'prescriptions' ? '💊 Prescriptions' : '🔬 Lab Results'}
            </Text>
            <View style={[s.tabUnderline, { backgroundColor: tab === tb ? t.accent : 'transparent' }]} />
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

          {tab === 'prescriptions' && (
            <>
              <Text style={[s.sectionSub, { color: t.textMuted }]}>Medications prescribed by your doctors</Text>
              {MOCK_PRESCRIPTIONS.length === 0 ? (
                <EmptyState icon="💊" title="No prescriptions yet" sub="Prescriptions from your consultations will appear here." />
              ) : (
                MOCK_PRESCRIPTIONS.map(rx => (
                  <View key={rx.id} style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                    <View style={s.cardHeader}>
                      <View style={[s.rxIcon, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
                        <Text style={{ fontSize: 20 }}>💊</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cardTitle, { color: t.textPrimary }]}>{rx.drug}</Text>
                        <Text style={[s.cardSub, { color: t.textMuted }]}>{rx.doctor} · {rx.specialty}</Text>
                      </View>
                      <Text style={[s.cardDate, { color: t.textMuted }]}>{rx.date}</Text>
                    </View>
                    {[
                      { label: 'Instructions', value: rx.instructions },
                      { label: 'Duration',     value: rx.duration },
                      { label: 'Refills',      value: `${rx.refills} remaining` },
                    ].map(row => (
                      <View key={row.label} style={[s.infoRow, { borderTopColor: t.cardBorder }]}>
                        <Text style={[s.infoLabel, { color: t.textMuted }]}>{row.label}</Text>
                        <Text style={[s.infoValue, { color: t.textPrimary }]}>{row.value}</Text>
                      </View>
                    ))}
                    <TouchableOpacity style={[s.downloadBtn, { borderColor: t.accentBorder, backgroundColor: t.accentBg }]}>
                      <Text style={[s.downloadBtnText, { color: t.accent }]}>📄  Download PDF</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </>
          )}

          {tab === 'labs' && (
            <>
              <Text style={[s.sectionSub, { color: t.textMuted }]}>Lab results and diagnostic reports</Text>
              {MOCK_LABS.length === 0 ? (
                <EmptyState icon="🔬" title="No lab results yet" sub="Lab results ordered by your doctors will appear here." />
              ) : (
                MOCK_LABS.map(lab => (
                  <View key={lab.id} style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                    <View style={s.cardHeader}>
                      <View style={[s.rxIcon, { backgroundColor: 'rgba(56,189,248,0.15)', borderColor: 'rgba(56,189,248,0.3)' }]}>
                        <Text style={{ fontSize: 20 }}>🔬</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cardTitle, { color: t.textPrimary }]}>{lab.test}</Text>
                        <Text style={[s.cardSub, { color: t.textMuted }]}>{lab.doctor} · {lab.date}</Text>
                      </View>
                      <View style={[s.statusBadge, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                        <Text style={[s.statusText, { color: t.accent }]}>{lab.status}</Text>
                      </View>
                    </View>
                    <View style={[s.infoRow, { borderTopColor: t.cardBorder }]}>
                      <Text style={[s.infoLabel, { color: t.textMuted }]}>Result</Text>
                      <Text style={[s.infoValue, { color: t.textPrimary, flex: 1, textAlign: 'right' }]}>{lab.result}</Text>
                    </View>
                    <TouchableOpacity style={[s.downloadBtn, { borderColor: 'rgba(56,189,248,0.3)', backgroundColor: 'rgba(56,189,248,0.08)' }]}>
                      <Text style={[s.downloadBtnText, { color: '#38BDF8' }]}>📄  Download report</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </>
          )}

          {/* Appointments with no prescription */}
          {tab === 'prescriptions' && appts.length > 0 && (
            <>
              <Text style={[s.sectionTitle, { color: t.textMuted }]}>Recent consultations</Text>
              {appts.slice(0, 5).map(a => (
                <View key={a.id} style={[s.simpleRow, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                  <Text style={{ fontSize: 14 }}>🩺</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.simpleTitle, { color: t.textPrimary }]}>{a.doctor?.full_name ?? 'Doctor'}</Text>
                    <Text style={[s.simpleSub, { color: t.textMuted }]}>{a.appointment_date} · {a.hospital?.name ?? ''}</Text>
                  </View>
                  <Text style={[s.simpleStatus, { color: t.textMuted }]}>No Rx</Text>
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  const { theme: t } = useTheme()
  return (
    <View style={[es.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
      <Text style={{ fontSize: 36, marginBottom: 10 }}>{icon}</Text>
      <Text style={[es.title, { color: t.textPrimary }]}>{title}</Text>
      <Text style={[es.sub, { color: t.textMuted }]}>{sub}</Text>
    </View>
  )
}
const es = StyleSheet.create({ card: { borderRadius: 18, borderWidth: 1, padding: 32, alignItems: 'center' }, title: { fontSize: 15, fontWeight: '700', marginBottom: 6 }, sub: { fontSize: 12, textAlign: 'center', lineHeight: 18 } })

const s = StyleSheet.create({
  safe:           { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  back:           { fontSize: 22 },
  title:          { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  tabBar:         { flexDirection: 'row', borderBottomWidth: 1, paddingHorizontal: 20 },
  tabItem:        { flex: 1, alignItems: 'center', paddingVertical: 11 },
  tabText:        { fontSize: 12 },
  tabUnderline:   { height: 2, width: '80%', borderRadius: 99, marginTop: 4 },
  sectionSub:     { fontSize: 11, marginBottom: 14 },
  sectionTitle:   { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 8 },
  card:           { borderRadius: 16, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  cardHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  rxIcon:         { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  cardTitle:      { fontSize: 13, fontWeight: '700' },
  cardSub:        { fontSize: 11, marginTop: 1 },
  cardDate:       { fontSize: 10 },
  infoRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: 11, paddingHorizontal: 14, borderTopWidth: 1, gap: 16 },
  infoLabel:      { fontSize: 11, fontWeight: '600', flexShrink: 0 },
  infoValue:      { fontSize: 12, textAlign: 'right', flex: 1 },
  statusBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99, borderWidth: 1 },
  statusText:     { fontSize: 10, fontWeight: '700' },
  downloadBtn:    { margin: 12, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1 },
  downloadBtnText:{ fontSize: 12, fontWeight: '600' },
  simpleRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginBottom: 7, borderWidth: 1 },
  simpleTitle:    { fontSize: 13, fontWeight: '600' },
  simpleSub:      { fontSize: 11, marginTop: 1 },
  simpleStatus:   { fontSize: 11 },
})
