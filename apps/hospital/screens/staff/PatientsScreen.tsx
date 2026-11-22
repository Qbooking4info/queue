import { useCallback, useMemo, useState } from 'react'
import { View, FlatList, RefreshControl, ActivityIndicator } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { startConversation } from '@queue/shared/lib/chat'
import { staffApi, fmtDay } from '../../lib/staffApi'
import {
  Screen, AppBar, Card, Row, Hair, SearchField, Btn, Empty, Initials, Mono,
} from '@queue/shared/components/q'

// Everyone who has visited (web /dashboard/patients, same GET /api/patients),
// with a quick path to message them.

interface Patient {
  id: string; name: string; phone: string | null; gender: string | null; age: number | null
  patientNumber: string | null; visits: number; lastVisit: string | null; nextVisit: string | null; noShows: number
}
interface Props { navigation: any }

export function PatientsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
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
    return (patients ?? []).filter(p =>
      p.name.toLowerCase().includes(s)
      || (p.phone ?? '').includes(s.replace(/\s/g, ''))
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
    <Screen>
      <AppBar
        title="Patients"
        sub={patients ? `${patients.length} with a visit here` : undefined}
        onBack={() => navigation.goBack()}
      />
      <SearchField value={q} onChangeText={setQ} placeholder="Name, phone or patient ID" />

      {patients == null ? (
        <ActivityIndicator color={t.q.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={shown}
          keyExtractor={p => p.id}
          contentContainerStyle={{ paddingBottom: 28, paddingTop: 6 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }}
              tintColor={t.q.primary} colors={[t.q.primary]} />
          }
          ListEmptyComponent={
            <Card>
              <Empty
                icon="people-outline"
                title={q ? 'No patient matches that' : 'No patients yet'}
                body={q
                  ? 'Try their phone number, or the patient ID from their app profile.'
                  : 'Patients appear after their first booking or walk-in with an app account.'}
              />
            </Card>
          }
          renderItem={({ item: p, index }) => {
            const expanded = open === p.id
            return (
              <Card style={index === 0 ? undefined : { marginTop: -1 }}>
                {index > 0 && <Hair inset={0} />}
                <Row
                  leading={<Initials name={p.name} size={44} />}
                  title={p.name}
                  sub={[
                    p.patientNumber,
                    p.age != null ? `${p.age}` : null,
                    p.phone,
                  ].filter(Boolean).join(' · ') || 'No details'}
                  right={
                    <View style={{ alignItems: 'flex-end', gap: 2 }}>
                      <Mono size={12} weight="700">{p.visits}</Mono>
                      <Text style={{ fontSize: 10.5, color: t.q.ink60 }}>
                        {p.visits === 1 ? 'visit' : 'visits'}
                      </Text>
                    </View>
                  }
                  onPress={() => setOpen(expanded ? null : p.id)}
                />
                {expanded && (
                  <>
                    <Hair />
                    <View style={{ paddingHorizontal: 14, paddingVertical: 12, gap: 10 }}>
                      <Text style={{ fontSize: 12.5, lineHeight: 18, color: t.q.ink60 }}>
                        Last seen {fmtDay(p.lastVisit)}
                        {p.nextVisit ? ` · next ${fmtDay(p.nextVisit)}` : ''}
                        {p.noShows > 0 ? ` · ${p.noShows} missed` : ''}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Btn
                          label={busy === p.id ? 'Opening…' : 'Message'}
                          variant="secondary" small icon="chatbubble-outline"
                          loading={busy === p.id}
                          onPress={() => message(p)}
                        />
                      </View>
                    </View>
                  </>
                )}
              </Card>
            )
          }}
        />
      )}
    </Screen>
  )
}
