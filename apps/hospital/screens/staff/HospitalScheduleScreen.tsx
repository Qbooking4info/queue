import { useState, useCallback, useMemo } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Switch,
  KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { Alert }    from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { fmtLocalDate } from '@queue/shared/lib/format'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DOCTOR_COLORS = ['#5B9EFF', '#00E87A', '#A78BFA', '#EF9F27', '#FF8C42', '#F07070']

interface ScheduleSlot { id: string; date: string; time: string; doc: string; patient: string; type: string; status: string; urgency: string }
interface DoctorLite { id: string; full_name: string }
interface ClinicLite { id: string; name: string }

function mondayOf(d: Date): Date {
  const day = d.getDay()
  const m = new Date(d)
  m.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  m.setHours(0, 0, 0, 0)
  return m
}

interface Props { navigation: any }

export function HospitalScheduleScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()))
  const [selectedDayIdx, setSelectedDayIdx] = useState(new Date().getDay() === 0 ? 6 : new Date().getDay() - 1)
  const [doctors, setDoctors] = useState<DoctorLite[]>([])
  const [clinics, setClinics] = useState<ClinicLite[]>([])
  const [clinicModel, setClinicModel] = useState<string | null>(null)
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const [clinicId, setClinicId] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<Record<string, ScheduleSlot[]>>({})
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [showSetSchedule, setShowSetSchedule] = useState(false)

  const hospitalId = staffProfile?.hospitalId

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const jwt = session?.access_token
    if (!jwt) throw new Error('Not authenticated')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }
  }

  const loadFilters = useCallback(async () => {
    if (!hospitalId) return
    const [{ data: hosp }, { data: roster }] = await Promise.all([
      supabase.from('hospitals').select('clinic_model').eq('id', hospitalId).single(),
      supabase.rpc('get_hospital_staff_roster', { p_hospital_id: hospitalId }),
    ])
    setClinicModel((hosp as any)?.clinic_model ?? null)
    setDoctors((roster?.doctors ?? []).map((d: any) => ({ id: d.id, full_name: d.full_name })))
    if ((hosp as any)?.clinic_model === 'multi') {
      try {
        const headers = await authHeaders()
        const res = await fetch(`${API_URL}/api/clinics?hospitalId=${hospitalId}`, { headers })
        if (res.ok) setClinics((await res.json()).map((c: any) => ({ id: c.id, name: c.name })))
      } catch { /* filter stays empty, not fatal */ }
    }
  }, [hospitalId])

  const loadSchedule = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await authHeaders()
      const params = new URLSearchParams({ weekStart: fmtLocalDate(weekStart) })
      if (doctorId) params.set('doctorId', doctorId)
      if (clinicId) params.set('clinicId', clinicId)
      const res = await fetch(`${API_URL}/api/schedule?${params}`, { headers })
      const body = await res.json()
      setSchedule(res.ok ? (body.schedule ?? {}) : {})
    } catch {
      setSchedule({})
    } finally {
      setLoading(false)
    }
  }, [weekStart, doctorId, clinicId])

  useFocusEffect(useCallback(() => { loadFilters() }, [loadFilters]))
  useFocusEffect(useCallback(() => { loadSchedule() }, [loadSchedule]))

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + i)
    return { date: d, iso: fmtLocalDate(d) }
  }), [weekStart])

  const doctorColor = useMemo(() => {
    const map = new Map<string, string>()
    return (name: string) => {
      if (!map.has(name)) map.set(name, DOCTOR_COLORS[map.size % DOCTOR_COLORS.length])
      return map.get(name)!
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule])

  const selectedIso = weekDays[selectedDayIdx]?.iso
  const daySlots = (schedule[selectedIso] ?? []).slice().sort((a, b) => a.time.localeCompare(b.time))

  function shiftWeek(delta: number) {
    const d = new Date(weekStart); d.setDate(weekStart.getDate() + delta * 7)
    setWeekStart(d)
  }

  return (
    <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {navigation.canGoBack?.() ? (
            <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" hitSlop={8}>
              <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
            </TouchableOpacity>
          ) : null}
          <Text style={[s.title, { color: t.textPrimary }]}>Schedule</Text>
        </View>
        <TouchableOpacity onPress={() => setShowSetSchedule(true)} style={[s.addBtn, { backgroundColor: t.accent }]}>
          <Ionicons name="calendar-outline" size={14} color="#fff" />
          <Text style={s.addBtnText}>Set Schedule</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 10 }}>
        <TouchableOpacity onPress={() => shiftWeek(-1)} accessibilityLabel="Previous week" hitSlop={8}><Ionicons name="chevron-back" size={20} color={t.textPrimary} /></TouchableOpacity>
        <Text style={{ fontSize: 13, fontWeight: '700', color: t.textPrimary }}>Week of {fmtLocalDate(weekStart)}</Text>
        <TouchableOpacity onPress={() => shiftWeek(1)} accessibilityLabel="Next week" hitSlop={8}><Ionicons name="chevron-forward" size={20} color={t.textPrimary} /></TouchableOpacity>
      </View>

      {/* Filters */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginBottom: 10 }}>
        <Chip theme={t} label="All doctors" active={!doctorId} onPress={() => setDoctorId(null)} />
        {doctors.map(d => (
          <Chip key={d.id} theme={t} label={d.full_name} active={doctorId === d.id} onPress={() => setDoctorId(d.id)} />
        ))}
      </ScrollView>
      {clinicModel === 'multi' && clinics.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginBottom: 12 }}>
          <Chip theme={t} label="All clinics" active={!clinicId} onPress={() => setClinicId(null)} />
          {clinics.map(c => (
            <Chip key={c.id} theme={t} label={c.name} active={clinicId === c.id} onPress={() => setClinicId(c.id)} />
          ))}
        </ScrollView>
      )}

      {/* Day tabs */}
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, marginBottom: 10 }}>
        {weekDays.map((wd, i) => {
          const count = (schedule[wd.iso] ?? []).length
          const active = i === selectedDayIdx
          return (
            <TouchableOpacity key={wd.iso} onPress={() => setSelectedDayIdx(i)}
              style={[s.dayTab, { backgroundColor: active ? `${t.accent}18` : 'transparent', borderColor: active ? t.accent : 'transparent' }]}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: active ? t.accent : t.textMuted }}>{DAY_NAMES[i]}</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: active ? t.accent : t.textPrimary, marginTop: 2 }}>{wd.date.getDate()}</Text>
              {count > 0 && <View style={[s.countDot, { backgroundColor: active ? t.accent : t.textMuted }]}><Text style={s.countDotText}>{count}</Text></View>}
            </TouchableOpacity>
          )
        })}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {daySlots.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={48} color={t.textMuted} style={{ opacity: 0.3, marginBottom: 12 }} />
              <Text style={[s.emptyTitle, { color: t.textPrimary }]}>No appointments this day</Text>
            </View>
          ) : daySlots.map(slot => {
            const expanded = expandedId === slot.id
            const color = doctorColor(slot.doc)
            return (
              <TouchableOpacity key={slot.id} onPress={() => setExpandedId(expanded ? null : slot.id)}
                style={[s.slotRow, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <View style={[s.timeCol, { borderLeftColor: color }]}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: t.textPrimary }}>{slot.time}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: t.textPrimary }}>{slot.patient}</Text>
                  <Text style={{ fontSize: 11, color: t.textMuted, marginTop: 1 }}>{slot.doc}</Text>
                  {expanded && (
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                      <View style={[s.badge, { backgroundColor: `${t.accent}14` }]}><Text style={[s.badgeText, { color: t.accent }]}>{slot.type}</Text></View>
                      <View style={[s.badge, { backgroundColor: 'rgba(122,144,137,0.14)' }]}><Text style={[s.badgeText, { color: t.textMuted }]}>{slot.status}</Text></View>
                      {slot.urgency === 'emergency' && (
                        <View style={[s.badge, { backgroundColor: 'rgba(255,92,92,0.14)' }]}><Text style={[s.badgeText, { color: '#FF5C5C' }]}>EMERGENCY</Text></View>
                      )}
                    </View>
                  )}
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={t.textMuted} />
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {showSetSchedule && (
        <SetScheduleModal
          theme={t} doctors={doctors}
          onClose={() => setShowSetSchedule(false)}
          onDone={() => { setShowSetSchedule(false); loadSchedule() }}
        />
      )}
    </SafeAreaView>
  )
}

function Chip({ theme: t, label, active, onPress }: { theme: any; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress}
      style={[s.filterChip, { borderColor: active ? t.accent : t.cardBorder, backgroundColor: active ? `${t.accent}18` : t.cardBg }]}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: active ? t.accent : t.textMuted }} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  )
}

const WEEKDAY_OPTIONS = [
  { key: 1, label: 'Mon' }, { key: 2, label: 'Tue' }, { key: 3, label: 'Wed' }, { key: 4, label: 'Thu' },
  { key: 5, label: 'Fri' }, { key: 6, label: 'Sat' }, { key: 0, label: 'Sun' },
]
const DURATIONS = [10, 15, 20, 30, 45, 60]
const DAYS_AHEAD_PRESETS = [7, 14, 30, 60, 90]

function SetScheduleModal({ theme: t, doctors, onClose, onDone }: {
  theme: any; doctors: DoctorLite[]; onClose: () => void; onDone: () => void
}) {
  const [doctorId, setDoctorId] = useState<string | null>(doctors[0]?.id ?? null)
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('17:00')
  const [slotDuration, setSlotDuration] = useState(30)
  const [daysAhead, setDaysAhead] = useState(30)
  const [acceptsVirtual, setAcceptsVirtual] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{ inserted: number; skippedForHours: number } | null>(null)

  function toggleDay(day: number) {
    setWorkingDays(ds => ds.includes(day) ? ds.filter(d => d !== day) : [...ds, day])
  }

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const jwt = session?.access_token
    if (!jwt) throw new Error('Not authenticated')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }
  }

  async function handleGenerate() {
    if (!doctorId) { setError('Choose a doctor.'); return }
    if (!workingDays.length) { setError('Choose at least one working day.'); return }
    setLoading(true); setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/doctors/schedule`, {
        method: 'POST', headers,
        body: JSON.stringify({ doctor_id: doctorId, working_days: workingDays, start_time: startTime, end_time: endTime, slot_duration: slotDuration, days_ahead: daysAhead, accepts_virtual: acceptsVirtual }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Failed to generate schedule')
      haptics.success()
      setResult({ inserted: body.inserted, skippedForHours: body.skippedForHours })
    } catch (e) {
      haptics.error()
      setError(e instanceof Error ? e.message : 'Failed to generate schedule')
    } finally {
      setLoading(false)
    }
  }

  async function handleClear() {
    if (!doctorId) return
    setLoading(true); setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/doctors/schedule/clear`, { method: 'POST', headers, body: JSON.stringify({ doctor_id: doctorId }) })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Failed to clear schedule')
      haptics.success()
      Alert.alert(`Cleared ${body.deleted ?? 0} unbooked upcoming slot(s).`)
    } catch (e) {
      haptics.error()
      setError(e instanceof Error ? e.message : 'Failed to clear schedule')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={s.overlay}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.modal, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 560 }}>
            {result ? (
              <>
                <Ionicons name="checkmark-circle" size={48} color="#00C265" style={{ alignSelf: 'center', marginBottom: 12 }} />
                <Text style={[s.modalTitle, { color: t.textPrimary, textAlign: 'center' }]}>Schedule generated</Text>
                <Text style={{ fontSize: 13, color: t.textMuted, textAlign: 'center', marginTop: 6, marginBottom: 20 }}>
                  {result.inserted} slot(s) created{result.skippedForHours > 0 ? `, ${result.skippedForHours} day(s) skipped (outside operating hours)` : ''}.
                </Text>
                <TouchableOpacity onPress={onDone} style={[s.smallBtn, { backgroundColor: t.accent, paddingVertical: 14 }]}>
                  <Text style={[s.smallBtnText, { color: '#fff', fontSize: 15 }]}>Done</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <Text style={[s.modalTitle, { color: t.textPrimary }]}>Set Schedule</Text>
                  <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={8}><Ionicons name="close" size={22} color={t.textMuted} /></TouchableOpacity>
                </View>

                <Text style={[s.modalLabel, { color: t.textMuted }]}>DOCTOR</Text>
                <ScrollView style={{ maxHeight: 110, marginBottom: 12 }} showsVerticalScrollIndicator={false}>
                  {doctors.map(d => (
                    <TouchableOpacity key={d.id} onPress={() => setDoctorId(d.id)}
                      style={[s.specialtyRow, { borderColor: doctorId === d.id ? t.accent : t.cardBorder, backgroundColor: doctorId === d.id ? `${t.accent}18` : 'transparent' }]}>
                      <Text style={{ fontSize: 12, color: doctorId === d.id ? t.accent : t.textPrimary }}>{d.full_name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={[s.modalLabel, { color: t.textMuted }]}>WORKING DAYS</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {WEEKDAY_OPTIONS.map(w => (
                    <TouchableOpacity key={w.key} onPress={() => toggleDay(w.key)}
                      style={[s.tagChip, { borderColor: workingDays.includes(w.key) ? t.accent : t.cardBorder, backgroundColor: workingDays.includes(w.key) ? `${t.accent}18` : 'transparent' }]}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: workingDays.includes(w.key) ? t.accent : t.textMuted }}>{w.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.modalLabel, { color: t.textMuted }]}>START</Text>
                    <View style={[s.modalInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                      <TextInput value={startTime} onChangeText={setStartTime} placeholder="08:00" placeholderTextColor={t.textMuted} maxLength={5} style={{ color: t.textPrimary, fontSize: 13, textAlign: 'center' }} />
                    </View>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.modalLabel, { color: t.textMuted }]}>END</Text>
                    <View style={[s.modalInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                      <TextInput value={endTime} onChangeText={setEndTime} placeholder="17:00" placeholderTextColor={t.textMuted} maxLength={5} style={{ color: t.textPrimary, fontSize: 13, textAlign: 'center' }} />
                    </View>
                  </View>
                </View>

                <Text style={[s.modalLabel, { color: t.textMuted }]}>SLOT LENGTH</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {DURATIONS.map(d => (
                    <TouchableOpacity key={d} onPress={() => setSlotDuration(d)}
                      style={[s.tagChip, { borderColor: slotDuration === d ? t.accent : t.cardBorder, backgroundColor: slotDuration === d ? `${t.accent}18` : 'transparent' }]}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: slotDuration === d ? t.accent : t.textMuted }}>{d}m</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[s.modalLabel, { color: t.textMuted }]}>GENERATE FOR</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                  {DAYS_AHEAD_PRESETS.map(d => (
                    <TouchableOpacity key={d} onPress={() => setDaysAhead(d)}
                      style={[s.tagChip, { borderColor: daysAhead === d ? t.accent : t.cardBorder, backgroundColor: daysAhead === d ? `${t.accent}18` : 'transparent' }]}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: daysAhead === d ? t.accent : t.textMuted }}>{d} days</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: t.textPrimary }}>Accept virtual consults</Text>
                  <Switch value={acceptsVirtual} onValueChange={setAcceptsVirtual} trackColor={{ true: t.accent }} />
                </View>

                {error ? <Text style={{ fontSize: 12, color: '#FF5C5C', marginBottom: 8 }}>{error}</Text> : null}

                <TouchableOpacity onPress={handleGenerate} disabled={loading}
                  style={[s.smallBtn, { backgroundColor: loading ? `${t.accent}88` : t.accent, paddingVertical: 14 }]}>
                  {loading ? <ActivityIndicator color="#fff" /> : <Text style={[s.smallBtnText, { color: '#fff', fontSize: 15 }]}>Generate Schedule</Text>}
                </TouchableOpacity>

                <TouchableOpacity onPress={handleClear} disabled={loading || !doctorId} style={{ marginTop: 12, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FF5C5C' }}>Clear upcoming unbooked slots</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const s = StyleSheet.create({
  safe:       { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title:      { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  filterChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1, maxWidth: 160 },
  dayTab:     { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginHorizontal: 2 },
  countDot:   { marginTop: 3, minWidth: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  countDotText: { fontSize: 9, fontWeight: '800', color: '#fff' },
  slotRow:    { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8, gap: 10 },
  timeCol:    { borderLeftWidth: 3, paddingLeft: 8 },
  badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  badgeText:  { fontSize: 9, fontWeight: '700' },
  empty:      { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '800', textAlign: 'center' },
  overlay:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  modalLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  modalInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  specialtyRow: { borderRadius: 10, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 6 },
  tagChip:    { borderRadius: 99, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  smallBtn:   { borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', borderColor: 'transparent' },
  smallBtnText: { fontSize: 12, fontWeight: '700' },
})
