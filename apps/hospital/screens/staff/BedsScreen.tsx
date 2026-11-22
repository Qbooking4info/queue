import { useCallback, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Notice, Btn, BottomBar,
  Stat, StatStrip, Mono, CardLabel, Field, Chip, Empty, IconBtn, type PillTone,
} from '@queue/shared/components/q'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

const LIVE = new Set(['matched', 'en_route_to_patient', 'on_scene', 'transporting', 'arrived_at_destination'])

type BedStatus = 'enough' | 'limited' | 'very_limited' | 'none'

/**
 * What each status tells a patient choosing an emergency room, and a crew
 * choosing where to take someone. The wording is deliberately the same as the
 * patient app shows, so staff can see exactly what they are publishing.
 */
const OPTIONS: { key: BedStatus; label: string; means: string; tone: PillTone }[] = [
  { key: 'enough', label: 'Enough', means: 'Patients see "Beds: enough" and are not warned', tone: 'green' },
  { key: 'limited', label: 'Limited', means: 'Patients see "Beds: limited"', tone: 'amber' },
  { key: 'very_limited', label: 'Very limited', means: 'Patients must tick a warning before booking here', tone: 'amber' },
  { key: 'none', label: 'None', means: 'Patients must tick a warning, and crews are steered elsewhere', tone: 'red' },
]

interface Inbound { id: string; status: string; eta_seconds: number | null; triage_level: number | null }

type BedState = 'free' | 'occupied' | 'cleaning' | 'out_of_service'

interface Bed {
  id: string
  label: string
  ward: string | null
  bed_type: string
  status: BedState
  status_changed_at: string
  status_note: string | null
}

const BED_STATE: Record<BedState, { label: string; tone: PillTone; icon: string }> = {
  free:           { label: 'Free',     tone: 'green',   icon: 'checkmark-circle-outline' },
  occupied:       { label: 'Occupied', tone: 'neutral', icon: 'person-outline' },
  cleaning:       { label: 'Cleaning', tone: 'amber',   icon: 'sparkles-outline' },
  out_of_service: { label: 'Out',      tone: 'red',     icon: 'close-circle-outline' },
}

const BED_TYPES = ['general', 'icu', 'maternity', 'paediatric', 'isolation', 'emergency']

/** Minutes since a timestamp. */
function minsSince(iso: string | null): number | null {
  if (!iso) return null
  const ms = Date.now() - Date.parse(iso)
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60_000)) : null
}

function human(mins: number | null): string | null {
  if (mins == null) return null
  if (mins < 60) return `${mins} min`
  return `${Math.floor(mins / 60)} h`
}

/**
 * Ward & triage capacity.
 *
 * Two modes, and which one you get depends on whether the hospital has
 * entered its beds (hospital_beds, 20261121000004):
 *
 *   no beds  -- the one published word, set by hand. Exactly what this screen
 *               did before, and still the only option for a hospital that has
 *               not listed its beds.
 *   beds     -- the real board. The published word is then DERIVED from the
 *               beds by trigger, so the picker goes read-only: letting staff
 *               type a word that contradicts their own bed list is how a crew
 *               ends up at a full hospital.
 */
export function BedsScreen({ navigation }: { navigation: any }) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const hospitalId = staffProfile?.hospitalId

  const [status, setStatus] = useState<BedStatus | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [inbound, setInbound] = useState<Inbound[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<BedStatus | null>(null)

  const [beds, setBeds] = useState<Bed[]>([])
  const [bedBusy, setBedBusy] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newWard, setNewWard] = useState('')
  const [newType, setNewType] = useState('general')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    // No hospital on the session means there is nothing to load and never
    // will be -- returning without clearing `loading` left the screen on a
    // spinner for ever rather than saying so.
    if (!hospitalId) { setLoading(false); return }
    const [{ data }, { data: bedRows }] = await Promise.all([
      supabase.from('hospitals')
        .select('bed_space_status, bed_space_updated_at').eq('id', hospitalId).maybeSingle(),
      supabase.from('hospital_beds')
        .select('id, label, ward, bed_type, status, status_changed_at, status_note')
        .eq('hospital_id', hospitalId)
        .order('ward', { ascending: true, nullsFirst: true })
        .order('label', { ascending: true }),
    ])
    if (data) {
      const s = (data as any).bed_space_status
      setStatus(OPTIONS.some(o => o.key === s) ? s : null)
      setUpdatedAt((data as any).bed_space_updated_at ?? null)
    }
    setBeds((bedRows as Bed[] | null) ?? [])
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        const res = await fetch(`${API_URL}/api/ambulances`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
        if (res.ok) {
          const body = await res.json()
          setInbound(((body.requests ?? []) as any[])
            .filter(r => r.is_inbound && LIVE.has(r.status))
            .map(r => ({ id: r.id, status: r.status, eta_seconds: r.eta_seconds ?? null, triage_level: r.triage_level ?? null })))
        }
      }
    } catch { /* the capacity control still works without the ambulance list */ }
    setLoading(false)
  }, [hospitalId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function publish(next: BedStatus) {
    if (!hospitalId) return
    setSaving(next)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${API_URL}/api/hospitals/${hospitalId}/bed-space`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ status: next }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        Alert.alert('Could not update', body?.error ?? 'Please try again in a moment.')
        return
      }
      haptics.success()
      setStatus(next)
      setUpdatedAt(body.bed_space_updated_at ?? new Date().toISOString())
    } catch (e) {
      Alert.alert('Could not update', e instanceof Error ? e.message : 'Please try again.')
    } finally {
      setSaving(null)
    }
  }

  /** Move one bed. The trigger re-derives the published word from the result. */
  async function setBedStatus(bed: Bed, next: BedState) {
    setBedBusy(bed.id)
    const { error } = await supabase
      .from('hospital_beds')
      .update({ status: next } as any)
      .eq('id', bed.id)
    setBedBusy(null)
    if (error) { haptics.error(); Alert.alert('Could not move that bed', error.message); return }
    haptics.success()
    load()
  }

  function askBedStatus(bed: Bed) {
    haptics.tap()
    Alert.alert(
      `${bed.label}${bed.ward ? ` · ${bed.ward}` : ''}`,
      'What is this bed doing?',
      [
        { text: 'Free', onPress: () => setBedStatus(bed, 'free') },
        { text: 'Occupied', onPress: () => setBedStatus(bed, 'occupied') },
        { text: 'Cleaning', onPress: () => setBedStatus(bed, 'cleaning') },
        { text: 'Out of service', onPress: () => setBedStatus(bed, 'out_of_service') },
        { text: 'Remove this bed', style: 'destructive', onPress: () => removeBed(bed) },
        { text: 'Cancel', style: 'cancel' },
      ],
    )
  }

  async function removeBed(bed: Bed) {
    const { error } = await supabase.from('hospital_beds').delete().eq('id', bed.id)
    if (error) { haptics.error(); Alert.alert('Could not remove it', error.message); return }
    haptics.success()
    load()
  }

  async function addBed() {
    if (!hospitalId || !newLabel.trim()) return
    setAdding(true)
    const { error } = await supabase.from('hospital_beds').insert({
      hospital_id: hospitalId,
      label: newLabel.trim(),
      ward: newWard.trim() || null,
      bed_type: newType,
    } as any)
    setAdding(false)
    if (error) {
      haptics.error()
      Alert.alert('Could not add it',
        error.code === '23505' ? `There is already a bed called ${newLabel.trim()}.` : error.message)
      return
    }
    haptics.success()
    setNewLabel(''); setShowAdd(false)
    load()
  }

  const current = OPTIONS.find(o => o.key === status)
  const staleMins = updatedAt
    ? Math.max(0, Math.round((Date.now() - Date.parse(updatedAt)) / 60_000))
    : null
  // Bed space goes out of date in minutes, not hours. Past half an hour it is
  // a guess, and the screen should say so rather than show it as current.
  const stale = staleMins != null && staleMins > 30

  const tracked = beds.length > 0
  const free = beds.filter(b => b.status === 'free').length
  const occupied = beds.filter(b => b.status === 'occupied').length
  const cleaning = beds.filter(b => b.status === 'cleaning').length
  const outOfService = beds.filter(b => b.status === 'out_of_service').length
  // A bed left mid-turnaround is the one a ward loses track of.
  const stuckCleaning = beds.filter(b => b.status === 'cleaning' && (minsSince(b.status_changed_at) ?? 0) > 60)

  const wards = [...new Set(beds.map(b => b.ward ?? 'Unassigned'))]

  return (
    <Screen>
      <AppBar title="Ward & triage capacity"
        sub={tracked ? `${beds.length} bed${beds.length === 1 ? '' : 's'}` : 'What you publish to patients and crews'}
        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
        right={tracked ? <IconBtn name="add" label="Add a bed" onPress={() => setShowAdd(v => !v)} /> : undefined} />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      ) : !hospitalId ? (
        <Card style={{ marginTop: 12 }}>
          <Empty icon="business-outline" title="No hospital on this account"
            body="Bed space belongs to a hospital. Sign in with a hospital staff account to set it." />
        </Card>
      ) : (
        <Body>
          {tracked ? (
            <>
              <Card>
                <StatStrip>
                  <Stat label="Free" value={free}
                    tone={free === 0 ? 'red' : undefined}
                    note="ready for a patient" />
                  <Stat label="Occupied" value={occupied} note="in use" />
                  <Stat label="Cleaning" value={cleaning}
                    tone={stuckCleaning.length > 0 ? 'amber' : undefined}
                    note={stuckCleaning.length ? `${stuckCleaning.length} over an hour` : 'turning around'} />
                  <Stat label="Out" value={outOfService} note="unusable" last />
                </StatStrip>
              </Card>

              {/* The published word is derived from the beds now, so it is
                  reported rather than chosen. */}
              <Notice tone={current?.tone === 'red' ? 'red' : current?.tone === 'amber' ? 'amber' : 'teal'}
                icon="megaphone-outline">
                Patients and crews are being told <Text style={{ fontWeight: '700' }}>{current?.label?.toLowerCase() ?? 'unknown'}</Text>
                {' '}— worked out from these beds, not typed. {current?.means ?? ''}
              </Notice>

              {stuckCleaning.length > 0 && (
                <Notice tone="amber" icon="time-outline">
                  {stuckCleaning.length === 1
                    ? `${stuckCleaning[0].label} has been cleaning for ${human(minsSince(stuckCleaning[0].status_changed_at))}.`
                    : `${stuckCleaning.length} beds have been cleaning for over an hour.`}
                  {' '}A bed stuck in cleaning is a bed nobody can be sent to.
                </Notice>
              )}

              {showAdd && (
                <Card>
                  <View style={{ padding: 14, gap: 12 }}>
                    <CardLabel>Add a bed</CardLabel>
                    <Field label="Label" value={newLabel} onChangeText={setNewLabel}
                      placeholder="e.g. A-12" autoCapitalize="characters" />
                    <Field label="Ward (optional)" value={newWard} onChangeText={setNewWard}
                      placeholder="e.g. Male medical" />
                    <View style={{ gap: 8 }}>
                      <CardLabel>Type</CardLabel>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {BED_TYPES.map(bt => (
                          <Chip key={bt} label={bt} on={newType === bt}
                            onPress={() => { haptics.tap(); setNewType(bt) }} />
                        ))}
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Btn grow label="Cancel" variant="secondary" onPress={() => setShowAdd(false)} />
                      <Btn grow label="Add bed" loading={adding} disabled={!newLabel.trim()} onPress={addBed} />
                    </View>
                  </View>
                </Card>
              )}

              {wards.map(ward => {
                const inWard = beds.filter(b => (b.ward ?? 'Unassigned') === ward)
                const freeHere = inWard.filter(b => b.status === 'free').length
                return (
                  <View key={ward}>
                    <SectionHead title={`${ward} · ${freeHere} of ${inWard.length} free`} />
                    <Card>
                      {inWard.map((bed, i) => {
                        const meta = BED_STATE[bed.status]
                        const since = human(minsSince(bed.status_changed_at))
                        return (
                          <View key={bed.id}>
                            {i > 0 && <Hair />}
                            <Row
                              compact
                              icon={meta.icon as any}
                              iconTone={meta.tone}
                              title={bed.label}
                              sub={[bed.bed_type, since ? `${meta.label.toLowerCase()} ${since}` : null]
                                .filter(Boolean).join(' · ')}
                              pill={meta.label}
                              pillTone={meta.tone}
                              right={bedBusy === bed.id ? <ActivityIndicator size="small" color={t.q.primary} /> : undefined}
                              onPress={() => askBedStatus(bed)} />
                          </View>
                        )
                      })}
                    </Card>
                  </View>
                )
              })}
            </>
          ) : (
            <>
              {stale && (
                <Notice tone="amber" icon="time-outline">
                  This was last confirmed {human(staleMins)} ago. Crews are deciding where to take patients
                  on it — confirm it or change it.
                </Notice>
              )}

              <SectionHead title="What you are publishing" />
              <Card>
                {OPTIONS.map((o, i) => (
                  <View key={o.key}>
                    {i > 0 && <Hair />}
                    <Row
                      title={o.label}
                      sub={o.means}
                      tint={status === o.key}
                      pill={status === o.key ? 'Live' : undefined}
                      pillTone={o.tone}
                      right={saving === o.key ? <ActivityIndicator size="small" color={t.q.primary} /> : undefined}
                      onPress={() => publish(o.key)} />
                  </View>
                ))}
              </Card>

              <SectionHead title="Track it bed by bed" />
              <Card>
                <Empty
                  icon="bed-outline"
                  title="No beds listed yet"
                  body="List your beds and this becomes a real board — free, occupied, cleaning, out of service — and the word above is worked out from them instead of typed from memory."
                  action="Add the first bed"
                  onAction={() => setShowAdd(true)} />
              </Card>

              {showAdd && (
                <Card>
                  <View style={{ padding: 14, gap: 12 }}>
                    <CardLabel>Add a bed</CardLabel>
                    <Field label="Label" value={newLabel} onChangeText={setNewLabel}
                      placeholder="e.g. A-12" autoCapitalize="characters" />
                    <Field label="Ward (optional)" value={newWard} onChangeText={setNewWard}
                      placeholder="e.g. Male medical" />
                    <View style={{ flexDirection: 'row', gap: 10 }}>
                      <Btn grow label="Cancel" variant="secondary" onPress={() => setShowAdd(false)} />
                      <Btn grow label="Add bed" loading={adding} disabled={!newLabel.trim()} onPress={addBed} />
                    </View>
                  </View>
                </Card>
              )}
            </>
          )}

          {inbound.length > 0 && (
            <>
              <SectionHead title="Coming to you" action="Ambulance desk"
                onAction={() => navigation.navigate('AmbulanceRequests')} />
              <Card>
                {inbound.map((r, i) => (
                  <View key={r.id}>
                    {i > 0 && <Hair />}
                    <Row
                      icon="medical" iconTone="red"
                      title={r.triage_level != null ? `P${r.triage_level} patient` : 'Patient inbound'}
                      sub={r.status.replace(/_/g, ' ')}
                      right={r.eta_seconds != null
                        ? <Mono size={13} weight="700" color={t.q.red}>{Math.round(r.eta_seconds / 60)} min</Mono>
                        : undefined}
                      chevron
                      onPress={() => navigation.navigate('AmbulanceRequests')}
                    />
                  </View>
                ))}
              </Card>
            </>
          )}
        </Body>
      )}

      <BottomBar meta={
        <>
          <Mono size={12} color={current?.tone === 'red' ? t.q.red : t.q.ink60} weight="700">
            {current?.label ?? 'Not set'}
          </Mono>
          {tracked ? (
            <>
              <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
              <Mono size={12}>{free} free of {beds.length}</Mono>
            </>
          ) : staleMins != null && (
            <>
              <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
              <Mono size={12}>{staleMins < 60 ? `${staleMins} min ago` : `${Math.floor(staleMins / 60)} h ago`}</Mono>
            </>
          )}
        </>
      }>
        {tracked ? (
          <Btn grow label="Add a bed" icon="add" onPress={() => setShowAdd(true)} />
        ) : (
          <Btn
            grow
            label={status ? 'Confirm it is still right' : 'Set bed space'}
            icon="checkmark-circle-outline"
            loading={!!saving}
            disabled={!status}
            onPress={() => status && publish(status)}
          />
        )}
      </BottomBar>
    </Screen>
  )
}
