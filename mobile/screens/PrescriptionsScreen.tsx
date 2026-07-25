import React, { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import { getCompletedAppointments } from '../lib/api'
import { fmtDate } from '../lib/format'

interface Props { navigation: any }

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
          <Ionicons name="arrow-back" size={22} color={t.textMuted} />
        </TouchableOpacity>
        <Text style={[s.title, { color: t.textPrimary }]}>Prescriptions & Labs</Text>
        <View style={{ width: 28 }} />
      </View>

      <View style={[s.tabBar, { borderBottomColor: t.cardBorder }]}>
        {(['prescriptions', 'labs'] as const).map(tb => (
          <TouchableOpacity key={tb} onPress={() => setTab(tb)} style={s.tabItem}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons
                name={tb === 'prescriptions' ? 'medkit-outline' : 'clipboard-outline'}
                size={13} color={tab === tb ? t.accent : t.textMuted}
              />
              <Text style={[s.tabText, { color: tab === tb ? t.accent : t.textMuted, fontWeight: tab === tb ? '700' : '400' }]}>
                {tb === 'prescriptions' ? 'Prescriptions' : 'Diagnoses'}
              </Text>
            </View>
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
              {appts.filter(a => a.doctor_notes).length === 0 ? (
                <EmptyState iconName="medkit-outline" title="No prescriptions on file" sub="Prescriptions from your completed consultations will appear here." />
              ) : (
                appts.filter(a => a.doctor_notes).map(a => (
                  <View key={a.id} style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                    <View style={s.cardHeader}>
                      <View style={[s.rxIcon, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
                        <Ionicons name="medkit-outline" size={20} color={t.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cardTitle, { color: t.textPrimary }]}>{a.doctor?.full_name ?? 'Doctor'}</Text>
                        <Text style={[s.cardSub, { color: t.textMuted }]}>
                          {a.doctor?.specialty?.name ?? 'Specialist'} · {a.hospital?.name ?? ''}
                        </Text>
                      </View>
                      <Text style={[s.cardDate, { color: t.textMuted }]}>{fmtDate(a.appointment_date)}</Text>
                    </View>
                    <View style={[s.infoRow, { borderTopColor: t.cardBorder }]}>
                      <Text style={[s.infoLabel, { color: t.textMuted }]}>Doctor's notes</Text>
                      <Text style={[s.infoValue, { color: t.textPrimary }]}>{a.doctor_notes}</Text>
                    </View>
                    {a.diagnosis && (
                      <View style={[s.infoRow, { borderTopColor: t.cardBorder }]}>
                        <Text style={[s.infoLabel, { color: t.textMuted }]}>Diagnosis</Text>
                        <Text style={[s.infoValue, { color: t.textPrimary }]}>{a.diagnosis}</Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </>
          )}

          {tab === 'labs' && (
            <>
              <Text style={[s.sectionSub, { color: t.textMuted }]}>Diagnoses from completed consultations</Text>
              {appts.filter(a => a.diagnosis).length === 0 ? (
                <EmptyState iconName="clipboard-outline" title="No diagnoses on file" sub="Diagnoses recorded by your doctors during completed consultations will appear here." />
              ) : (
                appts.filter(a => a.diagnosis).map(a => (
                  <View key={a.id} style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                    <View style={s.cardHeader}>
                      <View style={[s.rxIcon, { backgroundColor: 'rgba(56,189,248,0.15)', borderColor: 'rgba(56,189,248,0.3)' }]}>
                        <Ionicons name="flask-outline" size={20} color="rgba(56,189,248,0.9)" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.cardTitle, { color: t.textPrimary }]}>{a.doctor?.full_name ?? 'Doctor'}</Text>
                        <Text style={[s.cardSub, { color: t.textMuted }]}>{fmtDate(a.appointment_date)}</Text>
                      </View>
                      <View style={[s.statusBadge, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                        <Text style={[s.statusText, { color: t.accent }]}>Reviewed</Text>
                      </View>
                    </View>
                    <View style={[s.infoRow, { borderTopColor: t.cardBorder }]}>
                      <Text style={[s.infoLabel, { color: t.textMuted }]}>Diagnosis</Text>
                      <Text style={[s.infoValue, { color: t.textPrimary, flex: 1, textAlign: 'right' }]}>{a.diagnosis}</Text>
                    </View>
                    {a.doctor_notes && (
                      <View style={[s.infoRow, { borderTopColor: t.cardBorder }]}>
                        <Text style={[s.infoLabel, { color: t.textMuted }]}>Notes</Text>
                        <Text style={[s.infoValue, { color: t.textPrimary, flex: 1, textAlign: 'right' }]}>{a.doctor_notes}</Text>
                      </View>
                    )}
                  </View>
                ))
              )}
            </>
          )}

          {/* Consultations without notes */}
          {tab === 'prescriptions' && appts.filter(a => !a.doctor_notes).length > 0 && (
            <>
              <Text style={[s.sectionTitle, { color: t.textMuted }]}>Recent consultations</Text>
              {appts.filter(a => !a.doctor_notes).slice(0, 5).map(a => (
                <View key={a.id} style={[s.simpleRow, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                  <Ionicons name="medical-outline" size={14} color={t.textMuted} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.simpleTitle, { color: t.textPrimary }]}>{a.doctor?.full_name ?? 'Doctor'}</Text>
                    <Text style={[s.simpleSub, { color: t.textMuted }]}>{fmtDate(a.appointment_date)} · {a.hospital?.name ?? ''}</Text>
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

function EmptyState({ iconName, title, sub }: { iconName: React.ComponentProps<typeof Ionicons>['name']; title: string; sub: string }) {
  const { theme: t } = useTheme()
  return (
    <View style={[es.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
      <Ionicons name={iconName} size={40} color={t.textMuted} style={{ marginBottom: 10, opacity: 0.4 }} />
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
  simpleRow:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginBottom: 7, borderWidth: 1 },
  simpleTitle:    { fontSize: 13, fontWeight: '600' },
  simpleSub:      { fontSize: 11, marginTop: 1 },
  simpleStatus:   { fontSize: 11 },
})
