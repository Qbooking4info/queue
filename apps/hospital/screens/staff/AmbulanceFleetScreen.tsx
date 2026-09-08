import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { Button } from '@queue/shared/components/ui/Button'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
const VEHICLE_TIERS = ['PTS', 'BLS', 'ALS', 'CCT']
const CAPABILITIES = ['oxygen', 'ventilator', 'incubator', 'bariatric', 'wheelchair']

interface Shift { id: string; crew_tier: string; starts_at: string; ends_at: string; ambulance_shift_crew: unknown[] }
interface Unit {
  id: string; plate_number: string; call_sign: string | null; vehicle_tier: string
  capabilities: string[]; status: string; is_active: boolean; ambulance_shifts: Shift[]
  on_duty?: boolean; visible_to_dispatch?: boolean; seconds_since_ping?: number | null
}
interface Provider { id: string; name: string; contact_phone: string; contact_email: string | null }

interface Props { navigation: any }

async function jwt(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')
  return session.access_token
}

export function AmbulanceFleetScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [provider, setProvider] = useState<Provider | null>(null)
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showAddUnit, setShowAddUnit] = useState(false)
  const [dutyBusyId, setDutyBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const token = await jwt()
      const res = await fetch(`${API_URL}/api/ambulances/fleet`, { headers: { Authorization: `Bearer ${token}` } })
      const body = await res.json()
      if (res.ok) { setProvider(body.provider); setUnits(body.ambulances ?? []) }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function toggleDuty(unit: Unit) {
    const now = Date.now()
    const covering = unit.ambulance_shifts.some(s => new Date(s.starts_at).getTime() <= now && new Date(s.ends_at).getTime() > now)
    const onDuty = unit.status === 'available' && covering
    setDutyBusyId(unit.id)
    haptics.tap()
    try {
      const token = await jwt()
      const res = await fetch(`${API_URL}/api/ambulances/fleet/units/${unit.id}/duty`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ onDuty: !onDuty }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => null)
        Alert.alert('Could not change duty status', b?.error ?? 'Try again.')
        return
      }
      await load()
    } catch {
      Alert.alert('Could not change duty status', 'Check your connection and try again.')
    } finally { setDutyBusyId(null) }
  }

  function removeUnit(unit: Unit) {
    Alert.alert('Remove this ambulance?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try {
          const token = await jwt()
          const res = await fetch(`${API_URL}/api/ambulances/fleet/units/${unit.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
          if (!res.ok) { const b = await res.json().catch(() => null); Alert.alert('Could not remove unit', b?.error ?? 'Try again.'); return }
          await load()
        } catch {
          Alert.alert('Could not remove unit', 'Check your connection and try again.')
        }
      } },
    ])
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[st.safe, { backgroundColor: t.canvasBg }]}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.title, { color: t.textPrimary }]}>Your Fleet</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={st.center}><ActivityIndicator color={t.accent} /></View>
      ) : !provider ? (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <FleetSetupCard theme={t} onDone={load} />
        </ScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          <Text style={[st.hint, { color: t.textSecondary }]}>
            Manage your hospital&apos;s own ambulances, shifts, and crew. Invite crew members from Staff Management first.
          </Text>

          <TouchableOpacity onPress={() => setShowAddUnit(true)} style={[st.addBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
            <Ionicons name="add" size={16} color={t.accent} />
            <Text style={[st.addBtnText, { color: t.accent }]}>Add an ambulance</Text>
          </TouchableOpacity>

          {units.length === 0 ? (
            <View style={[st.empty, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[st.emptyText, { color: t.textMuted }]}>No ambulances yet — add your first one above.</Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {units.map(u => (
                <UnitCard key={u.id} unit={u} theme={t} dutyBusy={dutyBusyId === u.id}
                  onToggleDuty={() => toggleDuty(u)} onRemove={() => removeUnit(u)}
                  onManageShifts={() => navigation.navigate('AmbulanceUnitSchedule', { unitId: u.id, label: u.call_sign || u.plate_number })} />
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {showAddUnit && <AddUnitModal theme={t} onClose={() => setShowAddUnit(false)} onDone={() => { setShowAddUnit(false); load() }} />}
    </SafeAreaView>
  )
}

function FleetSetupCard({ theme: t, onDone }: { theme: any; onDone: () => void }) {
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!phone.trim()) { Alert.alert('Contact phone is required'); return }
    setBusy(true)
    try {
      const token = await jwt()
      const res = await fetch(`${API_URL}/api/ambulances/fleet`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contactPhone: phone, contactEmail: email || undefined }),
      })
      if (!res.ok) { const b = await res.json().catch(() => null); Alert.alert('Failed to set up fleet', b?.error); return }
      onDone()
    } catch {
      Alert.alert('Failed to set up fleet', 'Check your connection and try again.')
    } finally { setBusy(false) }
  }

  return (
    <View style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
      <Text style={[st.cardTitle, { color: t.textPrimary }]}>Set up your fleet</Text>
      <Text style={[st.hint, { color: t.textSecondary, marginBottom: 14 }]}>This creates your hospital&apos;s own ambulance provider record.</Text>
      <TextInput value={phone} onChangeText={setPhone} placeholder="Contact phone *" placeholderTextColor={t.textMuted} keyboardType="phone-pad"
        style={[st.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
      <TextInput value={email} onChangeText={setEmail} placeholder="Contact email (optional)" placeholderTextColor={t.textMuted} keyboardType="email-address" autoCapitalize="none"
        style={[st.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary, marginTop: 10 }]} />
      <Button label="Set up fleet" onPress={submit} loading={busy} style={{ marginTop: 14 }} />
    </View>
  )
}

function UnitCard({ unit, theme: t, dutyBusy, onToggleDuty, onRemove, onManageShifts }: {
  unit: Unit; theme: any; dutyBusy: boolean; onToggleDuty: () => void; onRemove: () => void; onManageShifts: () => void
}) {
  const now = Date.now()
  const covering = unit.ambulance_shifts.find(s => new Date(s.starts_at).getTime() <= now && new Date(s.ends_at).getTime() > now) ?? null
  const onDuty = unit.on_duty ?? (unit.status === 'available' && covering != null)
  const dispatchable = unit.visible_to_dispatch ?? false
  const pingAge = unit.seconds_since_ping ?? null

  return (
    <View style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
      <View style={st.unitTop}>
        <View style={{ flex: 1 }}>
          <Text style={[st.unitName, { color: t.textPrimary }]}>{unit.call_sign || unit.plate_number}</Text>
          <Text style={[st.unitMeta, { color: t.textSecondary }]}>{unit.plate_number} · {unit.vehicle_tier} · {unit.status}</Text>
          {unit.capabilities.length > 0 && <Text style={[st.unitCaps, { color: t.textMuted }]}>{unit.capabilities.join(', ')}</Text>}
        </View>
        <TouchableOpacity onPress={onRemove} accessibilityLabel={`Remove ${unit.call_sign || unit.plate_number}`} hitSlop={8} style={{ padding: 4 }}>
          <Ionicons name="trash-outline" size={16} color={t.danger} />
        </TouchableOpacity>
      </View>

      <TouchableOpacity onPress={onToggleDuty} disabled={dutyBusy}
        style={[st.dutyBtn, { backgroundColor: onDuty ? t.dangerSubtle : t.statusOpen.bg, borderColor: onDuty ? t.dangerBorder : t.statusOpen.border, opacity: dutyBusy ? 0.5 : 1 }]}>
        {dutyBusy ? <ActivityIndicator size="small" color={onDuty ? t.danger : t.statusOpen.text} /> : (
          <Text style={[st.dutyBtnText, { color: onDuty ? t.danger : t.statusOpen.text }]}>{onDuty ? 'Go off duty' : 'Go on duty'}</Text>
        )}
      </TouchableOpacity>

      {onDuty && (
        <View style={[st.dispatchBanner, { backgroundColor: dispatchable ? t.statusOpen.bg : t.statusProgress.bg, borderColor: dispatchable ? t.statusOpen.border : t.statusProgress.border }]}>
          <Text style={[st.dispatchText, { color: dispatchable ? t.statusOpen.text : t.statusProgress.text }]}>
            {dispatchable
              ? `Visible to dispatch — can receive jobs.${pingAge != null ? ` Last position ${pingAge}s ago.` : ''}`
              : `On duty but NOT dispatchable — ${pingAge == null ? 'this unit has never reported a position.' : `last position was ${pingAge}s ago and is too stale.`} A crew member must have the app open.`}
          </Text>
        </View>
      )}

      <TouchableOpacity onPress={onManageShifts} style={[st.shiftsBtn, { borderColor: t.cardBorder }]}>
        <Ionicons name="calendar-outline" size={14} color={t.textPrimary} />
        <Text style={[st.shiftsBtnText, { color: t.textPrimary }]}>Manage shifts ({unit.ambulance_shifts.length})</Text>
        <Ionicons name="chevron-forward" size={14} color={t.textMuted} />
      </TouchableOpacity>
    </View>
  )
}

function AddUnitModal({ theme: t, onClose, onDone }: { theme: any; onClose: () => void; onDone: () => void }) {
  const [plateNumber, setPlateNumber] = useState('')
  const [callSign, setCallSign] = useState('')
  const [vehicleTier, setVehicleTier] = useState('BLS')
  const [caps, setCaps] = useState<string[]>([])
  const [address, setAddress] = useState('')
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [busy, setBusy] = useState(false)

  function toggleCap(c: string) { setCaps(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]) }

  async function geocode() {
    if (!address.trim()) return
    setGeocoding(true)
    try {
      const res = await fetch(`${API_URL}/api/geocode?q=${encodeURIComponent(address)}`)
      const data = await res.json() as { lat: string; lon: string } | null
      if (!data) { Alert.alert('Address not found', 'Try a more specific query.'); return }
      setLat(parseFloat(data.lat)); setLng(parseFloat(data.lon))
    } catch {
      Alert.alert('Could not look up that address', 'Check your connection and try again.')
    } finally { setGeocoding(false) }
  }

  async function submit() {
    if (!plateNumber.trim()) { Alert.alert('Plate number is required'); return }
    if (lat == null || lng == null) { Alert.alert('Look up a home base address first'); return }
    setBusy(true)
    try {
      const token = await jwt()
      const res = await fetch(`${API_URL}/api/ambulances/fleet/units`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ plateNumber, callSign: callSign || undefined, vehicleTier, capabilities: caps, lat, lng }),
      })
      if (!res.ok) { const b = await res.json().catch(() => null); Alert.alert('Failed to add unit', b?.error); return }
      onDone()
    } catch {
      Alert.alert('Failed to add unit', 'Check your connection and try again.')
    } finally { setBusy(false) }
  }

  return (
    <View style={st.overlay}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
        <View style={[st.modalCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={st.modalHeadRow}>
              <Text style={[st.cardTitle, { color: t.textPrimary }]}>Add an ambulance</Text>
              <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={8}><Ionicons name="close" size={22} color={t.textMuted} /></TouchableOpacity>
            </View>

            <TextInput value={plateNumber} onChangeText={setPlateNumber} placeholder="Plate number *" placeholderTextColor={t.textMuted}
              style={[st.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
            <TextInput value={callSign} onChangeText={setCallSign} placeholder="Call sign" placeholderTextColor={t.textMuted}
              style={[st.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary, marginTop: 10 }]} />

            <View style={[st.tierRow]}>
              {VEHICLE_TIERS.map(tier => (
                <TouchableOpacity key={tier} onPress={() => setVehicleTier(tier)}
                  style={[st.tierChip, { borderColor: vehicleTier === tier ? t.accent : t.cardBorder, backgroundColor: vehicleTier === tier ? t.accentBg : 'transparent' }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: vehicleTier === tier ? t.accent : t.textMuted }}>{tier}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={st.tierRow}>
              {CAPABILITIES.map(c => {
                const active = caps.includes(c)
                return (
                  <TouchableOpacity key={c} onPress={() => toggleCap(c)}
                    style={[st.capChip, { borderColor: active ? t.accentBorder : t.cardBorder, backgroundColor: active ? t.accentBg : t.inputBg }]}>
                    <Text style={{ fontSize: 12, color: active ? t.accent : t.textSecondary }}>{c}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TextInput value={address} onChangeText={setAddress} placeholder="Home base address" placeholderTextColor={t.textMuted}
                style={[st.input, { flex: 1, backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
              <TouchableOpacity onPress={geocode} disabled={geocoding} style={[st.findBtn, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}>
                {geocoding ? <ActivityIndicator size="small" color={t.textSecondary} /> : <Text style={{ fontSize: 13, color: t.textSecondary, fontWeight: '600' }}>Find</Text>}
              </TouchableOpacity>
            </View>
            {lat != null && lng != null && (
              <Text style={[st.hint, { color: t.textMuted, marginTop: 8 }]}>Location found: {lat.toFixed(4)}, {lng.toFixed(4)}</Text>
            )}

            <Button label="Add ambulance" onPress={submit} loading={busy} style={{ marginTop: 16 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const st = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 12, lineHeight: 18, marginBottom: 14 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingVertical: 12, marginBottom: 16 },
  addBtnText: { fontSize: 13, fontWeight: '700' },
  empty: { padding: 40, borderRadius: 16, borderWidth: 1, alignItems: 'center' },
  emptyText: { fontSize: 13 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 },
  unitTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 12 },
  unitName: { fontSize: 14, fontWeight: '700' },
  unitMeta: { fontSize: 12, marginTop: 2 },
  unitCaps: { fontSize: 11, marginTop: 4 },
  dutyBtn: { borderWidth: 1, borderRadius: 10, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  dutyBtnText: { fontSize: 12, fontWeight: '700' },
  dispatchBanner: { borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 10 },
  dispatchText: { fontSize: 11.5, lineHeight: 16 },
  shiftsBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 12 },
  shiftsBtnText: { fontSize: 12.5, fontWeight: '600', flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalCard: { borderRadius: 20, borderWidth: 1, padding: 20, maxHeight: '85%' },
  modalHeadRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  tierChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  capChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  findBtn: { paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
})
