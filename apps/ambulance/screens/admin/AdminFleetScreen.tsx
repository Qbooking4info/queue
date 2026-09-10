import { useCallback, useEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Button } from '@queue/shared/components/ui/Button'
import { authedRequest } from '@queue/shared/lib/ambulance-api'
import {
  getFleet, addUnit, removeUnit, toggleUnitDuty,
  getCrewOptions, addCrewMember, assignCrew, unassignCrew,
  type FleetProvider, type FleetUnit, type CrewOption,
} from '@queue/shared/lib/ambulance-admin-api'

const VEHICLE_TIERS = ['PTS', 'BLS', 'ALS', 'CCT']
const CAPABILITIES = ['oxygen', 'ventilator', 'incubator', 'bariatric', 'wheelchair']
const CREW_ROLES = ['driver', 'emt', 'paramedic', 'nurse', 'doctor', 'dispatcher']

function crewName(m: CrewOption['users']): string {
  const u = Array.isArray(m) ? m[0] : m
  return u?.full_name ?? 'Unnamed crew'
}

function coveringShift(unit: FleetUnit) {
  const now = Date.now()
  return unit.ambulance_shifts.find(sh => Date.parse(sh.starts_at) <= now && Date.parse(sh.ends_at) > now) ?? null
}

/** Address -> {lat,lng} via the same /api/geocode route the web dashboard uses. */
async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  const data = await authedRequest(`/api/geocode?q=${encodeURIComponent(address)}`, 'GET') as { lat: string; lon: string } | null
  return data ? { lat: parseFloat(data.lat), lng: parseFloat(data.lon) } : null
}

export function AdminFleetScreen() {
  const { theme: t } = useTheme()

  const [provider, setProvider] = useState<FleetProvider | null>(null)
  const [units, setUnits] = useState<FleetUnit[]>([])
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  // Add-unit form -- address only, no device GPS required. "for testing
  // sake, i can register and add ambulance with address only": geocoding an
  // address is also just more practical for a desk-bound operator adding a
  // unit that isn't wherever this phone/browser happens to be.
  const [showAddUnit, setShowAddUnit] = useState(false)
  const [plateNumber, setPlateNumber] = useState('')
  const [callSign, setCallSign] = useState('')
  const [vehicleTier, setVehicleTier] = useState('BLS')
  const [caps, setCaps] = useState<string[]>([])
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null)
  const [geocoding, setGeocoding] = useState(false)
  const [addingUnit, setAddingUnit] = useState(false)

  // Add-crew form
  const [showAddCrew, setShowAddCrew] = useState(false)
  const [crewName_, setCrewName_] = useState('')
  const [crewRole, setCrewRole] = useState('driver')
  const [crewTier, setCrewTier] = useState('BLS')
  const [addingCrew, setAddingCrew] = useState(false)
  const [newCreds, setNewCreds] = useState<{ email: string; password: string } | null>(null)

  const [dutyBusy, setDutyBusy] = useState<string | null>(null)
  const [assignBusy, setAssignBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [fleet, crew] = await Promise.all([getFleet(), getCrewOptions()])
      setProvider(fleet.provider)
      setUnits(fleet.ambulances)
      setCrewOptions(crew.crew)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your fleet')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleGeocode() {
    if (!address.trim()) return
    setGeocoding(true); setError('')
    try {
      const pos = await geocode(address.trim())
      if (!pos) { setError('Address not found — try a more specific query'); return }
      setCoords(pos)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not look up that address')
    } finally {
      setGeocoding(false)
    }
  }

  async function handleAddUnit() {
    if (!plateNumber.trim()) { setError('Plate number is required'); return }
    if (!coords) { setError('Look up the unit\'s home base address first'); return }
    setAddingUnit(true); setError('')
    try {
      await addUnit({ plateNumber: plateNumber.trim(), callSign: callSign.trim() || undefined, vehicleTier, capabilities: caps, lat: coords.lat, lng: coords.lng })
      setPlateNumber(''); setCallSign(''); setCaps([]); setAddress(''); setCoords(null); setShowAddUnit(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add unit')
    } finally {
      setAddingUnit(false)
    }
  }

  function handleRemoveUnit(unit: FleetUnit) {
    Alert.alert('Remove ambulance?', `${unit.call_sign ?? unit.plate_number} will be permanently removed. This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        try { await removeUnit(unit.id); await load() }
        catch (err) { setError(err instanceof Error ? err.message : 'Failed to remove unit') }
      } },
    ])
  }

  async function handleToggleDuty(unit: FleetUnit) {
    setDutyBusy(unit.id); setError('')
    try {
      await toggleUnitDuty(unit.id, !unit.on_duty)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change duty status')
    } finally {
      setDutyBusy(null)
    }
  }

  async function handleAddCrew() {
    if (!crewName_.trim()) { setError('Enter a name'); return }
    setAddingCrew(true); setError(''); setNewCreds(null)
    try {
      const creds = await addCrewMember({ fullName: crewName_.trim(), crewRole, crewTier })
      setNewCreds(creds)
      setCrewName_(''); setShowAddCrew(false)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add crew member')
    } finally {
      setAddingCrew(false)
    }
  }

  async function handleAssign(unit: FleetUnit, option: CrewOption) {
    const shift = coveringShift(unit)
    if (!shift) return
    setAssignBusy(unit.id)
    try {
      await assignCrew(shift.id, option.id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign crew')
    } finally {
      setAssignBusy(null)
    }
  }

  async function handleUnassign(unit: FleetUnit, crewMemberId: string) {
    const shift = coveringShift(unit)
    if (!shift) return
    try {
      await unassignCrew(shift.id, crewMemberId)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove crew')
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={t.accent} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
      >
        <Text style={[s.title, { color: t.textPrimary }]}>Your Fleet</Text>

        {error ? (
          <View style={[s.errorBanner, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }]}>
            <Text style={{ color: t.danger, fontSize: 12 }}>{error}</Text>
          </View>
        ) : null}

        {newCreds && (
          <View style={[s.credsBox, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
            <Text style={{ color: t.accent, fontWeight: '800', fontSize: 13, marginBottom: 6 }}>Crew account created — save these now</Text>
            <Text style={{ color: t.textPrimary, fontSize: 13 }} selectable>Email: {newCreds.email}</Text>
            <Text style={{ color: t.textPrimary, fontSize: 13 }} selectable>Password: {newCreds.password}</Text>
            <TouchableOpacity onPress={() => setNewCreds(null)} style={{ marginTop: 8 }}>
              <Text style={{ color: t.textMuted, fontSize: 12 }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {!provider ? (
          <View style={[s.emptyBox, { borderColor: t.cardBorder }]}>
            <Text style={[s.emptyText, { color: t.textMuted }]}>
              No provider found on this account. Try signing out and back in, or contact support.
            </Text>
          </View>
        ) : (
          <>
            <TouchableOpacity onPress={() => setShowAddUnit(v => !v)} style={[s.addToggle, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
              <Ionicons name={showAddUnit ? 'remove' : 'add'} size={16} color={t.accent} />
              <Text style={{ color: t.accent, fontWeight: '700', fontSize: 13 }}>Add an ambulance</Text>
            </TouchableOpacity>

            {showAddUnit && (
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder, marginBottom: 16 }]}>
                <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                  <TextInput value={plateNumber} onChangeText={setPlateNumber} placeholder="Plate number" placeholderTextColor={t.textMuted}
                    style={{ color: t.textPrimary, fontSize: 14, flex: 1 }} />
                </View>
                <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                  <TextInput value={callSign} onChangeText={setCallSign} placeholder="Call sign (optional)" placeholderTextColor={t.textMuted}
                    style={{ color: t.textPrimary, fontSize: 14, flex: 1 }} />
                </View>
                <View style={s.chipRow}>
                  {VEHICLE_TIERS.map(tier => (
                    <TouchableOpacity key={tier} onPress={() => setVehicleTier(tier)}
                      style={[s.chip, { borderColor: vehicleTier === tier ? t.accentBorder : t.cardBorder, backgroundColor: vehicleTier === tier ? t.accentBgMid : 'transparent' }]}>
                      <Text style={{ color: vehicleTier === tier ? t.accent : t.textSecondary, fontSize: 12, fontWeight: '700' }}>{tier}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={s.chipRow}>
                  {CAPABILITIES.map(c => {
                    const on = caps.includes(c)
                    return (
                      <TouchableOpacity key={c} onPress={() => setCaps(cs => on ? cs.filter(x => x !== c) : [...cs, c])}
                        style={[s.chip, { borderColor: on ? t.accentBorder : t.cardBorder, backgroundColor: on ? t.accentBgMid : 'transparent' }]}>
                        <Text style={{ color: on ? t.accent : t.textSecondary, fontSize: 12 }}>{c}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
                <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                  <TextInput value={address} onChangeText={t2 => { setAddress(t2); setCoords(null) }} placeholder="Home base address" placeholderTextColor={t.textMuted}
                    style={{ color: t.textPrimary, fontSize: 14, flex: 1 }} />
                  <TouchableOpacity onPress={handleGeocode} disabled={geocoding || !address.trim()}>
                    {geocoding ? <ActivityIndicator size="small" color={t.textMuted} /> : <Text style={{ color: t.accent, fontSize: 13, fontWeight: '700' }}>Find</Text>}
                  </TouchableOpacity>
                </View>
                {coords && (
                  <View style={[s.foundRow]}>
                    <Ionicons name="checkmark-circle" size={14} color={t.accent} />
                    <Text style={{ color: t.accent, fontSize: 12 }}>Location found: {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}</Text>
                  </View>
                )}
                <Button label="Add ambulance" onPress={handleAddUnit} loading={addingUnit} style={{ marginTop: 10 }} />
              </View>
            )}

            {units.length === 0 ? (
              <View style={[s.emptyBox, { borderColor: t.cardBorder }]}>
                <Text style={[s.emptyText, { color: t.textMuted }]}>No ambulances yet — add your first one above.</Text>
              </View>
            ) : (
              units.map(u => {
                const shift = coveringShift(u)
                return (
                  <View key={u.id} style={[s.card, { backgroundColor: t.cardBg, borderColor: u.on_duty ? t.accentBorder : t.cardBorder }]}>
                    <View style={s.unitHeadRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.unitTitle, { color: t.textPrimary }]}>{u.call_sign ?? u.plate_number}</Text>
                        <Text style={[s.unitSub, { color: t.textMuted }]}>{u.plate_number} · {u.vehicle_tier} · {u.status}</Text>
                      </View>
                      <TouchableOpacity onPress={() => handleToggleDuty(u)} disabled={dutyBusy === u.id}
                        style={[s.dutyBtn, { borderColor: u.on_duty ? '#FF5C5C55' : '#00C26555', backgroundColor: u.on_duty ? '#FF5C5C14' : '#00C26514' }]}>
                        {dutyBusy === u.id ? <ActivityIndicator size="small" color={t.textMuted} /> :
                          <Text style={{ fontSize: 12, fontWeight: '800', color: u.on_duty ? t.danger : t.accentDark }}>{u.on_duty ? 'Go off duty' : 'Go on duty'}</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => handleRemoveUnit(u)} style={{ padding: 6 }}>
                        <Ionicons name="trash-outline" size={16} color={t.danger} />
                      </TouchableOpacity>
                    </View>

                    {u.on_duty && (
                      <View style={[s.dispatchNote, { backgroundColor: u.visible_to_dispatch ? '#00A85410' : '#B4530910', borderColor: u.visible_to_dispatch ? '#00A85444' : '#B4530944' }]}>
                        <Text style={{ color: u.visible_to_dispatch ? '#00A854' : '#B45309', fontSize: 11.5 }}>
                          {u.visible_to_dispatch
                            ? 'Visible to dispatch — can receive jobs.'
                            : u.seconds_since_ping == null
                              ? 'On duty but not dispatchable — no position reported yet.'
                              : `On duty but not dispatchable — position is ${u.seconds_since_ping}s old.`}
                        </Text>
                      </View>
                    )}

                    {shift && (() => {
                      // Toggling a unit on duty attaches whoever toggled it to the
                      // shift as bookkeeping (set_unit_duty's own identity, e.g. this
                      // admin's provider_admin_id) so the shift has an owner from the
                      // instant it exists. That is not a crew assignment and has no
                      // crew_member_id -- shown here it would just be an unlabelled,
                      // un-removable "Crew" chip next to real assignments.
                      const realCrew = shift.ambulance_shift_crew.filter(m => m.crew_member_id)
                      return (
                      <View style={{ marginTop: 10 }}>
                        <Text style={[s.sectionLabel, { color: t.textMuted }]}>CREW ON THIS SHIFT</Text>
                        <View style={s.chipRow}>
                          {realCrew.length === 0 && (
                            <Text style={{ color: t.textMuted, fontSize: 12 }}>No one assigned yet</Text>
                          )}
                          {realCrew.map(m => {
                            const cm = Array.isArray(m.ambulance_crew) ? m.ambulance_crew[0] : m.ambulance_crew
                            return (
                              <View key={m.id} style={[s.crewChip, { borderColor: t.cardBorder, backgroundColor: t.canvasBg }]}>
                                <Text style={{ color: t.textPrimary, fontSize: 12 }}>{cm ? crewName(cm.users) : 'Crew'}</Text>
                                {m.crew_member_id && (
                                  <TouchableOpacity onPress={() => handleUnassign(u, m.crew_member_id!)}>
                                    <Ionicons name="close" size={13} color={t.danger} />
                                  </TouchableOpacity>
                                )}
                              </View>
                            )
                          })}
                        </View>
                        {crewOptions.length > 0 && (
                          <View style={[s.chipRow, { marginTop: 6 }]}>
                            {crewOptions.map(opt => (
                              <TouchableOpacity key={opt.id} disabled={assignBusy === u.id} onPress={() => handleAssign(u, opt)}
                                style={[s.chip, { borderColor: t.cardBorder }]}>
                                <Text style={{ color: t.textSecondary, fontSize: 12 }}>+ {crewName(opt.users)}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                      )
                    })()}
                  </View>
                )
              })
            )}

            <TouchableOpacity onPress={() => setShowAddCrew(v => !v)} style={[s.addToggle, { backgroundColor: t.cardBg, borderColor: t.cardBorder, marginTop: 8 }]}>
              <Ionicons name={showAddCrew ? 'remove' : 'person-add-outline'} size={16} color={t.textPrimary} />
              <Text style={{ color: t.textPrimary, fontWeight: '700', fontSize: 13 }}>Add a crew member</Text>
            </TouchableOpacity>

            {showAddCrew && (
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                  <TextInput value={crewName_} onChangeText={setCrewName_} placeholder="Full name" placeholderTextColor={t.textMuted}
                    style={{ color: t.textPrimary, fontSize: 14, flex: 1 }} />
                </View>
                <Text style={[s.sectionLabel, { color: t.textMuted }]}>ROLE</Text>
                <View style={s.chipRow}>
                  {CREW_ROLES.map(r => (
                    <TouchableOpacity key={r} onPress={() => setCrewRole(r)}
                      style={[s.chip, { borderColor: crewRole === r ? t.accentBorder : t.cardBorder, backgroundColor: crewRole === r ? t.accentBgMid : 'transparent' }]}>
                      <Text style={{ color: crewRole === r ? t.accent : t.textSecondary, fontSize: 12 }}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 8 }]}>CARE TIER</Text>
                <View style={s.chipRow}>
                  {VEHICLE_TIERS.map(tier => (
                    <TouchableOpacity key={tier} onPress={() => setCrewTier(tier)}
                      style={[s.chip, { borderColor: crewTier === tier ? t.accentBorder : t.cardBorder, backgroundColor: crewTier === tier ? t.accentBgMid : 'transparent' }]}>
                      <Text style={{ color: crewTier === tier ? t.accent : t.textSecondary, fontSize: 12, fontWeight: '700' }}>{tier}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Button label="Add crew member" onPress={handleAddCrew} loading={addingCrew} style={{ marginTop: 12 }} />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:  { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginBottom: 16 },
  errorBanner: { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 12 },
  credsBox:    { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 16 },
  card:  { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 12 },
  input: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10, gap: 8 },
  addToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 13, marginBottom: 12, justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  foundRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  unitHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unitTitle: { fontSize: 15, fontWeight: '700' },
  unitSub:   { fontSize: 12, marginTop: 2 },
  dutyBtn:   { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  dispatchNote: { borderRadius: 10, borderWidth: 1, padding: 9, marginTop: 10 },
  sectionLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  crewChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  emptyBox: { borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center' },
})
