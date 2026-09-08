import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, TextInput } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
const VEHICLE_TIERS = ['PTS', 'BLS', 'ALS', 'CCT']

interface CrewOption { id: string; crew_role: string | null; crew_tier: string | null; users: { full_name: string } | null }
interface ShiftCrew { id: string; hospital_admin_id: string; hospital_admins: { crew_tier: string | null; users: { full_name: string } | null } | null }
interface Shift { id: string; crew_tier: string; starts_at: string; ends_at: string; ambulance_shift_crew: ShiftCrew[] }
interface Unit { id: string; plate_number: string; call_sign: string | null; ambulance_shifts: Shift[] }

interface Props { navigation: any; route: { params: { unitId: string; label: string } } }

async function jwt(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')
  return session.access_token
}

// Shifts need a specific date+time, not just a recurring daily window, so this
// can't reuse the app's usual bare "HH:MM" TextInput convention (see
// HospitalScheduleScreen's slot generator). One text field per boundary in
// "YYYY-MM-DD HH:MM" keeps it a plain TextInput -- no native date/time picker
// dependency exists anywhere in this app yet, and adding one is a native-module
// change that needs its own prebuild, not something to pull in for one screen.
function parseLocal(s: string): string | null {
  const m = s.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})$/)
  if (!m) return null
  const d = new Date(`${m[1]}T${m[2]}:00`)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

function fmt(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function AmbulanceUnitScheduleScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { unitId, label } = route.params
  const [unit, setUnit] = useState<Unit | null>(null)
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [shiftTier, setShiftTier] = useState('BLS')
  const [addingShift, setAddingShift] = useState(false)

  const load = useCallback(async () => {
    try {
      const token = await jwt()
      const [fleetRes, crewRes] = await Promise.all([
        fetch(`${API_URL}/api/ambulances/fleet`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/ambulances/fleet/crew`, { headers: { Authorization: `Bearer ${token}` } }),
      ])
      const fleet = await fleetRes.json()
      const crew = await crewRes.json()
      if (fleetRes.ok) setUnit((fleet.ambulances ?? []).find((u: Unit) => u.id === unitId) ?? null)
      if (crewRes.ok) setCrewOptions(crew.crew ?? [])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [unitId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function addShift() {
    const s = parseLocal(startsAt), e = parseLocal(endsAt)
    if (!s || !e) { Alert.alert('Enter both times', 'Use the format YYYY-MM-DD HH:MM, e.g. 2026-09-10 14:00.'); return }
    setAddingShift(true)
    haptics.tap()
    try {
      const token = await jwt()
      const res = await fetch(`${API_URL}/api/ambulances/fleet/shifts`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ambulanceId: unitId, startsAt: s, endsAt: e, crewTier: shiftTier }),
      })
      if (!res.ok) { const b = await res.json().catch(() => null); Alert.alert('Failed to add shift', b?.error); return }
      setStartsAt(''); setEndsAt('')
      await load()
    } finally { setAddingShift(false) }
  }

  function removeShift(shiftId: string) {
    Alert.alert('Remove this shift?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const token = await jwt()
        const res = await fetch(`${API_URL}/api/ambulances/fleet/shifts/${shiftId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
        if (!res.ok) { const b = await res.json().catch(() => null); Alert.alert('Failed to remove shift', b?.error); return }
        await load()
      } },
    ])
  }

  async function assignCrew(shiftId: string, hospitalAdminId: string) {
    const token = await jwt()
    const res = await fetch(`${API_URL}/api/ambulances/fleet/shifts/${shiftId}/crew`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ hospitalAdminId }),
    })
    if (!res.ok) { const b = await res.json().catch(() => null); Alert.alert('Failed to assign crew', b?.error); return }
    await load()
  }

  async function unassignCrew(shiftId: string, hospitalAdminId: string) {
    const token = await jwt()
    const res = await fetch(`${API_URL}/api/ambulances/fleet/shifts/${shiftId}/crew?hospitalAdminId=${hospitalAdminId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) { const b = await res.json().catch(() => null); Alert.alert('Failed to remove crew', b?.error); return }
    await load()
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.title, { color: t.textPrimary }]}>{label} · Shifts</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={t.accent} /></View>
      ) : !unit ? (
        <View style={st.center}><Text style={{ color: t.textMuted }}>Ambulance not found.</Text></View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          {unit.ambulance_shifts.length === 0 ? (
            <Text style={[st.hint, { color: t.textMuted, marginBottom: 16 }]}>No shifts scheduled.</Text>
          ) : (
            <View style={{ gap: 10, marginBottom: 16 }}>
              {unit.ambulance_shifts.map(shift => (
                <View key={shift.id} style={[st.shiftCard, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
                  <View style={st.shiftHeadRow}>
                    <Text style={[st.shiftRange, { color: t.textPrimary }]}>{fmt(shift.starts_at)} → {fmt(shift.ends_at)}</Text>
                    <TouchableOpacity onPress={() => removeShift(shift.id)} accessibilityLabel="Remove shift" hitSlop={8}>
                      <Ionicons name="trash-outline" size={14} color={t.danger} />
                    </TouchableOpacity>
                  </View>
                  <Text style={[st.shiftTier, { color: t.textMuted }]}>{shift.crew_tier}</Text>

                  {shift.ambulance_shift_crew.length > 0 && (
                    <View style={st.crewChipRow}>
                      {shift.ambulance_shift_crew.map(m => (
                        <View key={m.id} style={[st.crewChip, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                          <Text style={[st.crewChipText, { color: t.textPrimary }]}>{m.hospital_admins?.users?.full_name ?? '—'}</Text>
                          <TouchableOpacity onPress={() => unassignCrew(shift.id, m.hospital_admin_id)} accessibilityLabel="Remove from shift" hitSlop={6}>
                            <Ionicons name="close" size={13} color={t.danger} />
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  <AssignCrewRow theme={t} crewOptions={crewOptions} onAssign={id => assignCrew(shift.id, id)} />
                </View>
              ))}
            </View>
          )}

          <View style={[st.addCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[st.addCardTitle, { color: t.textPrimary }]}>Add a shift</Text>
            <TextInput value={startsAt} onChangeText={setStartsAt} placeholder="Starts — 2026-09-10 14:00" placeholderTextColor={t.textMuted}
              style={[st.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
            <TextInput value={endsAt} onChangeText={setEndsAt} placeholder="Ends — 2026-09-10 22:00" placeholderTextColor={t.textMuted}
              style={[st.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary, marginTop: 8 }]} />
            <View style={st.tierRow}>
              {VEHICLE_TIERS.map(tier => (
                <TouchableOpacity key={tier} onPress={() => setShiftTier(tier)}
                  style={[st.tierChip, { borderColor: shiftTier === tier ? t.accent : t.cardBorder, backgroundColor: shiftTier === tier ? t.accentBg : 'transparent' }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: shiftTier === tier ? t.accent : t.textMuted }}>{tier}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity onPress={addShift} disabled={addingShift} style={[st.addShiftBtn, { backgroundColor: t.accent, opacity: addingShift ? 0.6 : 1 }]}>
              {addingShift ? <ActivityIndicator size="small" color="#fff" /> : <Text style={st.addShiftBtnText}>+ Shift</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function AssignCrewRow({ theme: t, crewOptions, onAssign }: { theme: any; crewOptions: CrewOption[]; onAssign: (id: string) => void }) {
  if (crewOptions.length === 0) {
    return (
      <View style={st.noCrewRow}>
        <Ionicons name="people-outline" size={12} color={t.textMuted} />
        <Text style={[st.noCrewText, { color: t.textMuted }]}>No crew invited yet</Text>
      </View>
    )
  }
  return (
    <View style={st.assignRow}>
      {crewOptions.map(c => (
        <TouchableOpacity key={c.id} onPress={() => onAssign(c.id)}
          style={[st.crewOption, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={{ fontSize: 12, color: t.textSecondary }}>+ {c.users?.full_name ?? 'Unnamed crew'} ({c.crew_tier})</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 16, fontWeight: '800', flex: 1, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 13 },
  shiftCard: { borderRadius: 14, borderWidth: 1, padding: 12 },
  shiftHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  shiftRange: { fontSize: 12.5, fontWeight: '600', flex: 1 },
  shiftTier: { fontSize: 11, marginTop: 2 },
  crewChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  crewChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  crewChipText: { fontSize: 12 },
  assignRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  crewOption: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  noCrewRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  noCrewText: { fontSize: 12 },
  addCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  addCardTitle: { fontSize: 13, fontWeight: '700', marginBottom: 10 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tierChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  addShiftBtn: { borderRadius: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  addShiftBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
})
