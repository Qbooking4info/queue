import { useCallback, useEffect, useState } from 'react'
import {
  View, ActivityIndicator, RefreshControl, Switch, Image, Pressable,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { pickAndUploadAmbulancePhoto } from '@queue/shared/lib/avatar'
import { haptics } from '@queue/shared/lib/haptics'
import { authedRequest } from '@queue/shared/lib/ambulance-api'
import {
  getFleet, addUnit, removeUnit, toggleUnitDuty,
  getCrewOptions, addCrewMember, assignCrew, unassignCrew,
  type FleetProvider, type FleetUnit, type CrewOption,
} from '@queue/shared/lib/ambulance-admin-api'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Chip, Field,
  Btn, IconBtn, Empty, Mono, Notice, type PillTone,
} from '@queue/shared/components/q'

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

  // Add-unit form -- address only, no device GPS required: geocoding an address
  // is more practical for a desk-bound operator adding a unit that isn't
  // wherever this phone happens to be.
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
  const [photoBusy, setPhotoBusy] = useState<string | null>(null)
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
    if (!coords) { setError("Look up the unit's home base address first"); return }
    setAddingUnit(true); setError('')
    try {
      await addUnit({ plateNumber: plateNumber.trim(), callSign: callSign.trim() || undefined, vehicleTier, capabilities: caps, lat: coords.lat, lng: coords.lng })
      setPlateNumber(''); setCallSign(''); setCaps([]); setAddress(''); setCoords(null); setShowAddUnit(false)
      haptics.success()
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
      haptics.success()
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

  // The vehicle's own photo. Camera first: an operator standing next to the
  // ambulance is the common case, and a library pick is one tap further.
  async function handlePhoto(unit: FleetUnit) {
    Alert.alert(unit.call_sign ?? unit.plate_number, 'Add a photo of this vehicle', [
      { text: 'Take photo', onPress: () => doPhoto(unit, 'camera') },
      { text: 'Choose from photos', onPress: () => doPhoto(unit, 'library') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  async function doPhoto(unit: FleetUnit, source: 'camera' | 'library') {
    setPhotoBusy(unit.id)
    try {
      const url = await pickAndUploadAmbulancePhoto(unit.id, source)
      if (url) { haptics.success(); await load() }
    } catch (e) {
      haptics.error()
      Alert.alert('Vehicle photo', e instanceof Error ? e.message : 'Could not save the photo.')
    } finally { setPhotoBusy(null) }
  }

  if (loading) {
    return (
      <Screen>
        <AppBar large title="Your fleet" />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      </Screen>
    )
  }

  const crewCount = crewOptions.length

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppBar large title="Your fleet"
          sub={`${units.length} unit${units.length === 1 ? '' : 's'} · ${crewCount} crew`} />

        <Body refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={t.q.primary} colors={[t.q.primary]}
            onRefresh={() => { setRefreshing(true); load() }} />
        }>
          {!!error && <Notice tone="red" icon="alert-circle">{error}</Notice>}

          {/* Shown once, and only here: the server generates the password and
              never shows it again. */}
          {!!newCreds && (
            <Card>
              <View style={{ padding: 14, gap: 8 }}>
                <CardLabel>Crew account created — save this now</CardLabel>
                <Mono size={14} weight="600">{newCreds.email}</Mono>
                <Mono size={14} weight="600">{newCreds.password}</Mono>
                <Text style={{ fontSize: 12, lineHeight: 17, color: t.q.ink60 }}>
                  The password is not stored anywhere you can read it again. Send it to them now.
                </Text>
                <Btn label="Dismiss" variant="secondary" small onPress={() => setNewCreds(null)} />
              </View>
            </Card>
          )}

          {!provider ? (
            <Card>
              <Empty icon="alert-circle-outline" title="No provider on this account"
                body="Try signing out and back in, or contact support." />
            </Card>
          ) : (
            <>
              {units.length === 0 ? (
                <Card>
                  <Empty icon="car-outline" title="No ambulances yet"
                    body="Add your first one below. A unit shows up on the fleet map at its home base straight away."
                    action="Add an ambulance" onAction={() => setShowAddUnit(true)} />
                </Card>
              ) : units.map(u => {
                const shift = coveringShift(u)
                // Toggling a unit on duty attaches whoever toggled it to the shift
                // as bookkeeping (set_unit_duty's own identity) so the shift has an
                // owner from the instant it exists. That is not a crew assignment
                // and has no crew_member_id -- shown here it would just be an
                // unlabelled, un-removable "Crew" chip next to real assignments.
                const realCrew = shift ? shift.ambulance_shift_crew.filter(m => m.crew_member_id) : []
                const tone: PillTone = !u.on_duty ? 'neutral'
                  : u.visible_to_dispatch ? 'green' : 'amber'
                const label = !u.on_duty ? 'Off duty'
                  : u.visible_to_dispatch ? 'Ready' : 'No signal'
                return (
                  <Card key={u.id} style={{ marginTop: 12 }}>
                    <Row
                      leading={
                        <Pressable
                          onPress={() => handlePhoto(u)}
                          disabled={photoBusy === u.id}
                          accessibilityRole="button"
                          accessibilityLabel={`${u.photo_url ? 'Change' : 'Add'} photo of ${u.call_sign ?? u.plate_number}`}
                          style={{
                            width: 52, height: 40, borderRadius: 10, overflow: 'hidden',
                            alignItems: 'center', justifyContent: 'center',
                            backgroundColor: t.q.sel, borderWidth: 1, borderColor: t.q.line,
                          }}>
                          {u.photo_url ? (
                            <Image source={{ uri: u.photo_url }} style={{ width: '100%', height: '100%' }}
                              resizeMode="cover" accessibilityIgnoresInvertColors />
                          ) : (
                            <Ionicons name="camera-outline" size={18} color={t.q.primary} />
                          )}
                          {photoBusy === u.id && (
                            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
                              <ActivityIndicator color="#FFFFFF" size="small" />
                            </View>
                          )}
                        </Pressable>
                      }
                      title={u.call_sign ?? u.plate_number}
                      sub={[
                        u.plate_number,
                        u.vehicle_tier,
                        realCrew.length
                          ? realCrew.map(m => {
                              const cm = Array.isArray(m.ambulance_crew) ? m.ambulance_crew[0] : m.ambulance_crew
                              return cm ? crewName(cm.users) : 'Crew'
                            }).join(', ')
                          : 'no one assigned yet',
                      ].filter(Boolean).join(' · ')}
                      pill={label}
                      pillTone={tone}
                      right={<IconBtn name="trash-outline" label={`Remove ${u.call_sign ?? u.plate_number}`}
                        color={t.q.red} onPress={() => handleRemoveUnit(u)} />} />

                    <Hair />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 56 }}>
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.q.ink }}>On duty</Text>
                        <Text style={{ fontSize: 12.5, lineHeight: 17, color: t.q.ink60 }}>
                          {!u.on_duty
                            ? 'This unit receives no offers.'
                            : u.visible_to_dispatch
                              ? 'Visible to dispatch, can receive jobs.'
                              : u.seconds_since_ping == null
                                ? 'On duty, but it has never reported a position — dispatch cannot send it a job.'
                                : `On duty, but its last position is ${u.seconds_since_ping}s old — dispatch cannot send it a job.`}
                        </Text>
                      </View>
                      {dutyBusy === u.id
                        ? <ActivityIndicator color={t.q.primary} />
                        : <Switch
                            value={u.on_duty}
                            onValueChange={() => { haptics.tap(); handleToggleDuty(u) }}
                            accessibilityLabel={`${u.call_sign ?? u.plate_number} on duty`}
                            trackColor={{ false: t.q.line, true: t.q.primary }}
                            thumbColor="#FFFFFF" />}
                    </View>

                    {!!shift && (
                      <>
                        <Hair />
                        <View style={{ padding: 14, gap: 10 }}>
                          <CardLabel>Crew on this shift</CardLabel>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {realCrew.length === 0 && (
                              <Text style={{ fontSize: 13, color: t.q.ink60 }}>No one assigned yet.</Text>
                            )}
                            {realCrew.map(m => {
                              const cm = Array.isArray(m.ambulance_crew) ? m.ambulance_crew[0] : m.ambulance_crew
                              return (
                                <View key={m.id} style={{
                                  flexDirection: 'row', alignItems: 'center', gap: 6,
                                  paddingLeft: 12, paddingRight: 6, minHeight: 36, borderRadius: 999,
                                  backgroundColor: t.q.sel, borderWidth: 1, borderColor: t.q.primary,
                                }}>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: t.q.primary }}>
                                    {cm ? crewName(cm.users) : 'Crew'}
                                  </Text>
                                  {!!m.crew_member_id && (
                                    <Pressable
                                      onPress={() => handleUnassign(u, m.crew_member_id!)}
                                      accessibilityRole="button"
                                      accessibilityLabel={`Remove ${cm ? crewName(cm.users) : 'crew'} from this shift`}
                                      hitSlop={8}
                                      style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
                                      <Ionicons name="close" size={14} color={t.q.red} />
                                    </Pressable>
                                  )}
                                </View>
                              )
                            })}
                          </View>
                          {crewOptions.length > 0 && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                              {crewOptions.map(opt => (
                                <Chip key={opt.id} label={`+ ${crewName(opt.users)}`}
                                  onPress={assignBusy === u.id ? undefined : () => { haptics.tap(); handleAssign(u, opt) }} />
                              ))}
                            </View>
                          )}
                        </View>
                      </>
                    )}
                  </Card>
                )
              })}

              <SectionHead title="Add an ambulance"
                action={showAddUnit ? 'Close' : 'Open'}
                onAction={() => setShowAddUnit(v => !v)} />
              {showAddUnit && (
                <Card>
                  <View style={{ padding: 14, gap: 14 }}>
                    <Field label="Plate number" value={plateNumber} onChangeText={setPlateNumber}
                      placeholder="e.g. KJA 412 XB" autoCapitalize="characters" />
                    <Field label="Call sign (optional)" value={callSign} onChangeText={setCallSign}
                      placeholder="e.g. LAG-04" autoCapitalize="characters" />
                    <View style={{ gap: 8 }}>
                      <CardLabel>Care tier</CardLabel>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {VEHICLE_TIERS.map(tier => (
                          <Chip key={tier} label={tier} on={vehicleTier === tier}
                            onPress={() => { haptics.tap(); setVehicleTier(tier) }} />
                        ))}
                      </View>
                    </View>
                    <View style={{ gap: 8 }}>
                      <CardLabel>What it carries</CardLabel>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {CAPABILITIES.map(c => (
                          <Chip key={c} label={c} on={caps.includes(c)}
                            onPress={() => { haptics.tap(); setCaps(cs => cs.includes(c) ? cs.filter(x => x !== c) : [...cs, c]) }} />
                        ))}
                      </View>
                    </View>
                    <Field label="Home base address" value={address}
                      onChangeText={v => { setAddress(v); setCoords(null) }}
                      placeholder="Where this unit is based"
                      hint={coords
                        ? `Found: ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`
                        : 'Look the address up so the unit can be plotted on the map.'} />
                    <Btn label="Look up address" variant="secondary" icon="search-outline"
                      loading={geocoding} disabled={!address.trim()} onPress={handleGeocode} />
                    <Btn label="Add ambulance" loading={addingUnit}
                      disabled={!plateNumber.trim() || !coords} onPress={handleAddUnit} />
                  </View>
                </Card>
              )}

              <SectionHead title="Add a crew member"
                action={showAddCrew ? 'Close' : 'Open'}
                onAction={() => setShowAddCrew(v => !v)} />
              {showAddCrew && (
                <Card>
                  <View style={{ padding: 14, gap: 14 }}>
                    <Field label="Full name" value={crewName_} onChangeText={setCrewName_}
                      placeholder="e.g. Chinedu Umeh" autoCapitalize="words" />
                    <View style={{ gap: 8 }}>
                      <CardLabel>Role</CardLabel>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {CREW_ROLES.map(r => (
                          <Chip key={r} label={r} on={crewRole === r}
                            onPress={() => { haptics.tap(); setCrewRole(r) }} />
                        ))}
                      </View>
                    </View>
                    <View style={{ gap: 8 }}>
                      <CardLabel>Care tier</CardLabel>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {VEHICLE_TIERS.map(tier => (
                          <Chip key={tier} label={tier} on={crewTier === tier}
                            onPress={() => { haptics.tap(); setCrewTier(tier) }} />
                        ))}
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, lineHeight: 17, color: t.q.ink60 }}>
                      Queue creates the sign-in for them and shows the password once. Crew do not register
                      themselves.
                    </Text>
                    <Btn label="Create crew account" loading={addingCrew}
                      disabled={!crewName_.trim()} onPress={handleAddCrew} />
                  </View>
                </Card>
              )}
            </>
          )}
        </Body>
      </Screen>
    </KeyboardAvoidingView>
  )
}
