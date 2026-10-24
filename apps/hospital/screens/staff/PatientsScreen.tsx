import { useCallback, useMemo, useState } from 'react'
import { View, FlatList, TextInput, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { startConversation } from '@queue/shared/lib/chat'
import { Header, EmptyState } from '@queue/shared/components/ui/v3'
import { staffApi, fmtDay } from '../../lib/staffApi'

// v3.1 Patients (web /dashboard/patients, same GET /api/patients): everyone who
// has visited, with a quick path to message them or start a care plan.

interface Patient {
  id: string; name: string; phone: string | null; gender: string | null; age: number | null
  patientNumber: string | null; visits: number; lastVisit: string | null; nextVisit: string | null; noShows: number
}
interface Props { navigation: any }

export function PatientsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const [patients, setPatients] = useState<Patient[] | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    const r = await staffApi<{ patients: Patient[] }>('/api/patients')
    setPatients(r.ok ? r.data.patients : [])
    if (!r.ok) Alert.alert('Could not load patients', r.error)
    setRefreshing(false)
  }, [])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return patients ?? []
    return (patients ?? []).filter(p => p.name.toLowerCase().includes(s) || (p.phone ?? '').includes(s.replace(/\s/g, ''))
      || (p.patientNumber ?? '').toLowerCase().includes(s))
  }, [patients, q])

  async function message(p: Patient) {
    setBusy(p.id)
    const r = await startConversation('patient', p.id)
    setBusy(null)
    if (r.ok) navigation.navigate('Chat', { conversationId: r.data })
    else Alert.alert('Could not open chat', r.error)
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="Patients" subtitle={patients ? `${patients.length} with a visit here` : undefined} onBack={() => navigation.goBack()}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFFFF', borderRadius: 12, paddingHorizontal: 12, height: 46 }}>
          <Ionicons name="search" size={18} color="#4B5B5E" />
          <TextInput value={q} onChangeText={setQ} placeholder="Name, phone or QB number" placeholderTextColor="#6B7280"
            accessibilityLabel="Search patients" autoCorrect={false} style={{ flex: 1, fontSize: 15, color: '#0B1B1E' }} />
        </View>
      </Header>
      {patients == null ? <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} /> : (
        <FlatList
          data={shown}
          keyExtractor={p => p.id}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 32 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
          ListEmptyComponent={<EmptyState icon="people-outline" title={q ? 'No patient matches' : 'No patients yet'}
            body={q ? 'Try a phone number or the QB number from their app profile.' : 'Patients appear after their first booking or walk-in with an app account.'} />}
          renderItem={({ item: p }) => {
            const expanded = open === p.id
            return (
              <View style={{ backgroundColor: t.cardBg, borderColor: t.cardBorder, borderWidth: 1, borderRadius: 14, overflow: 'hidden' }}>
                <TouchableOpacity onPress={() => setOpen(expanded ? null : p.id)} accessibilityRole="button" accessibilityState={{ expanded }}
                  style={{ padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 99, backgroundColor: t.accentBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: t.accent, fontWeight: '800' }}>{p.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }} numberOfLines={1}>{p.name}</Text>
                    <Text style={{ fontSize: 12, color: t.textMuted, marginTop: 2 }} numberOfLines={1}>
                      {[p.patientNumber, p.age != null ? `${p.age}y` : null, p.phone].filter(Boolean).join(' · ') || 'No details'}
                    </Text>
                    <Text style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }}>
                      {p.visits} visit{p.visits === 1 ? '' : 's'} · last {fmtDay(p.lastVisit)}{p.nextVisit ? ` · next ${fmtDay(p.nextVisit)}` : ''}
                    </Text>
                  </View>
                  <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={t.textMuted} />
                </TouchableOpacity>
                {expanded && (
                  <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 14 }}>
                    <TouchableOpacity onPress={() => message(p)} disabled={busy === p.id} accessibilityRole="button"
                      style={{ flex: 1, height: 44, borderRadius: 12, borderWidth: 1, borderColor: t.cardBorder, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
                      {busy === p.id ? <ActivityIndicator color={t.accent} /> : <><Ionicons name="chatbubble-outline" size={16} color={t.accent} /><Text style={{ color: t.accent, fontWeight: '700' }}>Message</Text></>}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )
          }}
        />
      )}
    </View>
  )
}
