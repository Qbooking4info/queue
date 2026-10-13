import { useCallback, useMemo, useState } from 'react'
import { View, ScrollView, TouchableOpacity, Modal, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { Text, TextInput } from '@queue/shared/components/ui/Typography'
import { Header, Card, SegmentedControl, PrimaryButton, EmptyState, HeaderIconButton } from '@queue/shared/components/ui/v3'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'

interface Shift { id: string; user_id: string; role_label: string; starts_at: string; ends_at: string; notes: string | null }
interface Person { id: string; full_name: string; role: string }

const ROLE_LABELS = ['Front desk', 'Nurse', 'Doctor', 'Ambulance crew', 'Admin', 'Cleaner', 'Security']
const PRESETS = [
  { key: 'morning',   label: 'Morning · 08–16',   start: 8,  hours: 8 },
  { key: 'afternoon', label: 'Afternoon · 16–00', start: 16, hours: 8 },
  { key: 'night',     label: 'Night · 00–08',     start: 0,  hours: 8 },
  { key: 'day',       label: 'Day · 08–20',       start: 8,  hours: 12 },
]
const ROLE_FROM_STAFF: Record<string, string> = { front_desk: 'Front desk', ambulance_crew: 'Ambulance crew', admin: 'Admin', owner: 'Admin', clinic_admin: 'Admin' }

const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })

// Hospital staff rota (handoff: staff shift management). Admins/owners plan shifts;
// everyone at the hospital can see the week and filter to their own shifts.
export function StaffShiftsScreen({ navigation }: { navigation: any }) {
  const { theme: t } = useTheme()
  const { staffProfile, user } = useAuth() as any
  const hospitalId: string | undefined = staffProfile?.hospitalId
  const canManage = staffProfile?.role === 'hospital_admin'
  const [week, setWeek] = useState(() => startOfWeek(new Date()))
  const [view, setView] = useState<'all' | 'mine'>(canManage ? 'all' : 'mine')
  const [shifts, setShifts] = useState<Shift[] | null>(null)
  const [people, setPeople] = useState<Person[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    if (!hospitalId) return
    const [{ data: s, error }, { data: roster }] = await Promise.all([
      supabase.from('staff_shifts').select('id, user_id, role_label, starts_at, ends_at, notes')
        .eq('hospital_id', hospitalId).gte('starts_at', week.toISOString()).lt('starts_at', addDays(week, 7).toISOString()).order('starts_at'),
      supabase.rpc('get_hospital_staff_roster', { p_hospital_id: hospitalId }),
    ])
    if (error) Alert.alert('Shifts', error.message)
    setShifts((s as Shift[]) ?? [])
    setPeople(((roster as any)?.staff ?? []).map((p: any) => ({ id: p.id, full_name: p.full_name, role: p.role })))
    setRefreshing(false)
  }, [hospitalId, week])
  useFocusEffect(useCallback(() => { load() }, [load]))

  const nameOf = (id: string) => people.find(p => p.id === id)?.full_name ?? 'Staff member'
  const visible = (shifts ?? []).filter(s => view === 'all' || s.user_id === user?.id)
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(week, i)), [week])
  const todayKey = dayKey(new Date())

  async function remove(s: Shift) {
    Alert.alert('Remove shift?', `${nameOf(s.user_id)} · ${hm(s.starts_at)}–${hm(s.ends_at)}`, [
      { text: 'Keep', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('staff_shifts').delete().eq('id', s.id)
        if (error) { haptics.error(); Alert.alert('Shifts', error.message) } else { haptics.success(); load() }
      } },
    ])
  }

  const weekLabel = `${week.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })} – ${addDays(week, 6).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}`

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: t.canvasBg }}>
      <Header title="Staff shifts" subtitle={weekLabel} onBack={() => navigation.goBack()}
        right={canManage ? <HeaderIconButton icon="add" label="Add shift" onPress={() => setAdding(true)} /> : undefined}>
        <SegmentedControl<'all' | 'mine'> onDark value={view} onChange={setView}
          options={[{ value: 'all', label: 'Everyone' }, { value: 'mine', label: 'My shifts' }]} />
      </Header>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 10 }}>
        <TouchableOpacity onPress={() => { haptics.tap(); setWeek(w => addDays(w, -7)) }} accessibilityRole="button" accessibilityLabel="Previous week"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-back" size={22} color={t.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { haptics.tap(); setWeek(startOfWeek(new Date())) }} accessibilityRole="button">
          <Text style={{ fontSize: 14, fontWeight: '700', color: t.accent }}>This week</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { haptics.tap(); setWeek(w => addDays(w, 7)) }} accessibilityRole="button" accessibilityLabel="Next week"
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chevron-forward" size={22} color={t.textPrimary} />
        </TouchableOpacity>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}>
        {!shifts ? <SkeletonCard /> : visible.length === 0 ? (
          <EmptyState icon="time-outline" title={view === 'mine' ? 'No shifts for you this week' : 'No shifts planned this week'}
            body={canManage ? 'Tap + to plan who works when.' : 'Your admin plans the rota here.'}
            action={canManage ? 'Add a shift' : undefined} onAction={canManage ? () => setAdding(true) : undefined} />
        ) : days.map(d => {
          const list = visible.filter(s => dayKey(new Date(s.starts_at)) === dayKey(d))
          if (!list.length) return null
          const isToday = dayKey(d) === todayKey
          return (
            <View key={dayKey(d)} style={{ gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: isToday ? t.accent : t.textPrimary }}>
                {d.toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'short' })}{isToday ? ' · Today' : ''}
              </Text>
              <Card style={{ paddingVertical: 0 }}>
                {list.map((s, i) => {
                  const now = Date.now(), live = new Date(s.starts_at).getTime() <= now && new Date(s.ends_at).getTime() > now
                  return (
                    <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8,
                      borderBottomWidth: i === list.length - 1 ? 0 : 1, borderBottomColor: t.cardBorder }}>
                      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: live ? t.statusSuccess.text : t.accent, marginVertical: 6 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: t.textPrimary }}>{nameOf(s.user_id)}{s.user_id === user?.id ? ' (you)' : ''}</Text>
                        <Text style={{ fontSize: 13, color: t.textMuted }}>{s.role_label} · {hm(s.starts_at)}–{hm(s.ends_at)}{live ? ' · On now' : ''}</Text>
                        {!!s.notes && <Text style={{ fontSize: 12, color: t.textSecondary, marginTop: 2 }} numberOfLines={2}>{s.notes}</Text>}
                      </View>
                      {canManage && (
                        <TouchableOpacity onPress={() => remove(s)} accessibilityRole="button" accessibilityLabel="Remove shift"
                          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="trash-outline" size={18} color={t.danger} />
                        </TouchableOpacity>
                      )}
                    </View>
                  )
                })}
              </Card>
            </View>
          )
        })}
      </ScrollView>
      {canManage && hospitalId && (
        <AddShiftSheet visible={adding} onClose={() => setAdding(false)} people={people} days={days} hospitalId={hospitalId}
          creatorId={user?.id} onSaved={() => { setAdding(false); load() }} />
      )}
    </SafeAreaView>
  )
}

function AddShiftSheet({ visible, onClose, people, days, hospitalId, creatorId, onSaved }: {
  visible: boolean; onClose: () => void; people: Person[]; days: Date[]; hospitalId: string; creatorId?: string; onSaved: () => void
}) {
  const { theme: t } = useTheme()
  const [personId, setPersonId] = useState<string | null>(null)
  const [role, setRole] = useState('Front desk')
  const [day, setDay] = useState(0)
  const [preset, setPreset] = useState('morning')
  const [customStart, setCustomStart] = useState('09')
  const [customHours, setCustomHours] = useState('8')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  const chip = (on: boolean) => ({ minHeight: 40, paddingHorizontal: 12, borderRadius: 99, justifyContent: 'center' as const, borderWidth: 1,
    borderColor: on ? t.accent : t.cardBorder, backgroundColor: on ? t.accentBg : t.cardBg })
  const chipText = (on: boolean) => ({ fontSize: 13, fontWeight: '600' as const, color: on ? t.accent : t.textSecondary })

  async function save() {
    if (!personId) { haptics.error(); Alert.alert('Add shift', 'Choose who is working.'); return }
    const p = PRESETS.find(x => x.key === preset)
    const startH = p ? p.start : Math.min(23, Math.max(0, Number(customStart) || 0))
    const hours = p ? p.hours : Math.min(24, Math.max(1, Number(customHours) || 8))
    const start = new Date(days[day]); start.setHours(startH, 0, 0, 0)
    const end = new Date(start.getTime() + hours * 3600_000)
    setBusy(true)
    const { error } = await supabase.from('staff_shifts').insert({
      hospital_id: hospitalId, user_id: personId, role_label: role, starts_at: start.toISOString(), ends_at: end.toISOString(),
      notes: notes.trim() || null, created_by: creatorId ?? null,
    })
    setBusy(false)
    if (error) { haptics.error(); Alert.alert('Add shift', error.message); return }
    haptics.success(); setNotes(''); onSaved()
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: t.canvasBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
            <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: t.textPrimary }}>Add shift</Text>
            <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close" size={22} color={t.textPrimary} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 14, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
            <Text style={{ fontSize: 13, fontWeight: '700', color: t.textMuted }}>WHO</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {people.length === 0 && <Text style={{ color: t.textMuted }}>No staff yet. Invite them from Staff & doctors.</Text>}
              {people.map(p => (
                <TouchableOpacity key={p.id} onPress={() => { haptics.tap(); setPersonId(p.id); if (ROLE_FROM_STAFF[p.role]) setRole(ROLE_FROM_STAFF[p.role]) }}
                  accessibilityRole="radio" accessibilityState={{ checked: personId === p.id }} style={chip(personId === p.id)}>
                  <Text style={chipText(personId === p.id)}>{p.full_name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: t.textMuted }}>ROLE ON THIS SHIFT</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {ROLE_LABELS.map(r => (
                <TouchableOpacity key={r} onPress={() => { haptics.tap(); setRole(r) }} accessibilityRole="radio" accessibilityState={{ checked: role === r }} style={chip(role === r)}>
                  <Text style={chipText(role === r)}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: t.textMuted }}>DAY</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {days.map((d, i) => (
                <TouchableOpacity key={i} onPress={() => { haptics.tap(); setDay(i) }} accessibilityRole="radio" accessibilityState={{ checked: day === i }} style={chip(day === i)}>
                  <Text style={chipText(day === i)}>{d.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric' })}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={{ fontSize: 13, fontWeight: '700', color: t.textMuted }}>HOURS</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[...PRESETS.map(p => ({ key: p.key, label: p.label })), { key: 'custom', label: 'Custom' }].map(p => (
                <TouchableOpacity key={p.key} onPress={() => { haptics.tap(); setPreset(p.key) }} accessibilityRole="radio" accessibilityState={{ checked: preset === p.key }} style={chip(preset === p.key)}>
                  <Text style={chipText(preset === p.key)}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {preset === 'custom' && (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {[{ label: 'Starts (hour 0–23)', v: customStart, set: setCustomStart }, { label: 'Length (hours)', v: customHours, set: setCustomHours }].map(f => (
                  <View key={f.label} style={{ flex: 1, gap: 6 }}>
                    <Text style={{ fontSize: 12, color: t.textMuted }}>{f.label}</Text>
                    <TextInput value={f.v} onChangeText={v => f.set(v.replace(/[^0-9]/g, '').slice(0, 2))} keyboardType="number-pad" accessibilityLabel={f.label}
                      style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.inputBg, paddingHorizontal: 14, fontSize: 15, color: t.textPrimary }} />
                  </View>
                ))}
              </View>
            )}
            <TextInput value={notes} onChangeText={setNotes} placeholder="Notes (optional) — ward, cover for…" placeholderTextColor={t.textMuted} maxLength={300}
              accessibilityLabel="Notes" style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.inputBg, paddingHorizontal: 14, fontSize: 15, color: t.textPrimary }} />
            <PrimaryButton label="Save shift" icon="checkmark" loading={busy} onPress={save} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
