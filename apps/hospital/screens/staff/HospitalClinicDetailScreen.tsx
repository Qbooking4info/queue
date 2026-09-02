import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, TextInput, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Alert }    from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { DayHours } from '@queue/shared/lib/api'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface ClinicDetail {
  id: string; hospital_id: string; name: string; description: string | null
  is_active: boolean; is_emergency: boolean
  daily_booking_limit: number | null; min_age: number | null; max_age: number | null
  gender_restriction: 'male' | 'female' | null
}
interface ClinicDoctor { id: string; full_name: string; specialty_name: string | null; is_active: boolean }

interface Props { navigation: any; route: { params: { clinicId: string } } }

export function HospitalClinicDetailScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { clinicId } = route.params

  const [clinic,   setClinic]   = useState<ClinicDetail | null>(null)
  const [doctors,  setDoctors]  = useState<ClinicDoctor[]>([])
  const [hours,    setHours]    = useState<DayHours[]>([])
  const [allHospitalDoctors, setAllHospitalDoctors] = useState<{ id: string; full_name: string }[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [showAssign, setShowAssign] = useState(false)

  // Edit-form fields, seeded from `clinic` once loaded
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [dailyLimit,  setDailyLimit]  = useState('')
  const [minAge,      setMinAge]      = useState('')
  const [maxAge,       setMaxAge]      = useState('')
  const [genderRestriction, setGenderRestriction] = useState<'male' | 'female' | null>(null)

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const jwt = session?.access_token
    if (!jwt) throw new Error('Not authenticated')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }
  }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const headers = await authHeaders()
      const detailRes = await fetch(`${API_URL}/api/clinics/${clinicId}`, { headers })
      const body = await detailRes.json()
      if (detailRes.ok) {
        setClinic(body.clinic)
        setDoctors(body.doctors ?? [])
        setHours(body.clinicHours?.hours ?? [])
        setName(body.clinic?.name ?? '')
        setDescription(body.clinic?.description ?? '')
        setDailyLimit(body.clinic?.daily_booking_limit != null ? String(body.clinic.daily_booking_limit) : '')
        setMinAge(body.clinic?.min_age != null ? String(body.clinic.min_age) : '')
        setMaxAge(body.clinic?.max_age != null ? String(body.clinic.max_age) : '')
        setGenderRestriction(body.clinic?.gender_restriction ?? null)
      }
    } finally {
      setLoading(false)
    }
  }, [clinicId])

  // The hospital's full doctor roster, to compute who is assignable to this
  // clinic (linked to the hospital, not yet assigned here). Reuses the same
  // RPC StaffManagementScreen already relies on for this hospital's doctors.
  const loadRoster = useCallback(async (hospitalId: string) => {
    const { data } = await supabase.rpc('get_hospital_staff_roster', { p_hospital_id: hospitalId })
    setAllHospitalDoctors((data?.doctors ?? []).map((d: any) => ({ id: d.id, full_name: d.full_name })))
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function handleSaveDetails() {
    setSaving(true)
    try {
      const headers = await authHeaders()
      const min = minAge.trim() ? parseInt(minAge, 10) : null
      const max = maxAge.trim() ? parseInt(maxAge, 10) : null
      const limit = dailyLimit.trim() ? parseInt(dailyLimit, 10) : null
      const res = await fetch(`${API_URL}/api/clinics/${clinicId}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({
          action: 'update', name: name.trim(), description: description.trim() || null,
          daily_booking_limit: Number.isNaN(limit as number) ? null : limit,
          min_age: Number.isNaN(min as number) ? null : min,
          max_age: Number.isNaN(max as number) ? null : max,
          gender_restriction: genderRestriction,
        }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to save')
      haptics.success()
      await load()
    } catch (e) {
      haptics.error()
      Alert.alert(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive() {
    if (!clinic) return
    setSaving(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/clinics/${clinicId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ action: 'toggle_active', is_active: !clinic.is_active }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to update')
      haptics.success()
      await load()
    } catch (e) {
      haptics.error(); Alert.alert(e instanceof Error ? e.message : 'Failed to update')
    } finally { setSaving(false) }
  }

  async function toggleEmergency() {
    if (!clinic) return
    setSaving(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/clinics/${clinicId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ action: clinic.is_emergency ? 'clear_emergency' : 'set_emergency' }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to update')
      haptics.success()
      await load()
    } catch (e) {
      haptics.error(); Alert.alert(e instanceof Error ? e.message : 'Failed to update')
    } finally { setSaving(false) }
  }

  function updateHourField(day: number, field: 'open' | 'close', value: string) {
    setHours(hs => hs.map(h => h.day === day ? { ...h, [field]: value } : h))
  }
  function toggleClosed(day: number) {
    setHours(hs => hs.map(h => h.day === day ? { ...h, closed: !h.closed } : h))
  }

  async function saveHours() {
    setSaving(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/clinics/${clinicId}`, {
        method: 'PATCH', headers, body: JSON.stringify({ action: 'update_hours', hours }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to save hours')
      haptics.success()
    } catch (e) {
      haptics.error(); Alert.alert(e instanceof Error ? e.message : 'Failed to save hours')
    } finally { setSaving(false) }
  }

  async function unassignDoctor(doctorId: string) {
    setSaving(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/clinics/${clinicId}/doctors/${doctorId}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to unassign')
      haptics.success()
      await load()
    } catch (e) {
      haptics.error(); Alert.alert(e instanceof Error ? e.message : 'Failed to unassign')
    } finally { setSaving(false) }
  }

  async function assignDoctor(doctorId: string) {
    setSaving(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/clinics/${clinicId}/doctors`, {
        method: 'POST', headers, body: JSON.stringify({ mode: 'assign', doctorId }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to assign')
      haptics.success()
      setShowAssign(false)
      await load()
    } catch (e) {
      haptics.error(); Alert.alert(e instanceof Error ? e.message : 'Failed to assign')
    } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={t.accent} />
      </SafeAreaView>
    )
  }

  const assignable = allHospitalDoctors.filter(d => !doctors.some(cd => cd.id === d.id))

  return (
    <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        {navigation.canGoBack?.() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
          </TouchableOpacity>
        ) : null}
        <Text style={[s.title, { color: t.textPrimary }]} numberOfLines={1}>{clinic?.name ?? 'Clinic'}</Text>
        {saving ? <ActivityIndicator color={t.accent} size="small" /> : <View style={{ width: 22 }} />}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <Section theme={t} title="Details">
          <Field theme={t} label="Name" value={name} onChange={setName} />
          <Field theme={t} label="Description" value={description} onChange={setDescription} multiline />
          <Field theme={t} label="Daily booking limit" value={dailyLimit} onChange={setDailyLimit} keyboardType="number-pad" placeholder="Unlimited" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Field theme={t} label="Min age" value={minAge} onChange={setMinAge} keyboardType="number-pad" placeholder="None" />
            </View>
            <View style={{ flex: 1 }}>
              <Field theme={t} label="Max age" value={maxAge} onChange={setMaxAge} keyboardType="number-pad" placeholder="None" />
            </View>
          </View>
          <Text style={[s.label, { color: t.textMuted }]}>GENDER RESTRICTION</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {([null, 'male', 'female'] as const).map(g => (
              <TouchableOpacity key={g ?? 'none'} onPress={() => setGenderRestriction(g)}
                style={[s.chip, { borderColor: genderRestriction === g ? t.accent : t.cardBorder, backgroundColor: genderRestriction === g ? `${t.accent}18` : 'transparent' }]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: genderRestriction === g ? t.accent : t.textMuted }}>{g ? (g === 'male' ? 'Male only' : 'Female only') : 'None'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={handleSaveDetails} disabled={saving}
            style={[s.saveBtn, { backgroundColor: saving ? `${t.accent}88` : t.accent }]}>
            <Text style={s.saveBtnText}>Save Details</Text>
          </TouchableOpacity>
        </Section>

        <Section theme={t} title="Status">
          <ToggleRow theme={t} label="Active" sub="Inactive clinics don't accept new bookings" value={!!clinic?.is_active} onToggle={toggleActive} />
          <ToggleRow theme={t} label="Emergency Department" sub="Only one clinic per hospital can hold this" value={!!clinic?.is_emergency} onToggle={toggleEmergency} last />
        </Section>

        <Section theme={t} title="Operating Hours">
          {hours.map(h => (
            <View key={h.day} style={s.hourRow}>
              <Text style={[s.dayLabel, { color: t.textPrimary }]}>{DAY_NAMES[h.day]}</Text>
              {h.closed ? (
                <Text style={{ flex: 1, fontSize: 12, color: t.textMuted, textAlign: 'center' }}>Closed</Text>
              ) : (
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                  <TextInput value={h.open} onChangeText={v => updateHourField(h.day, 'open', v)}
                    style={[s.timeInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                    placeholder="08:00" placeholderTextColor={t.textMuted} maxLength={5} />
                  <Text style={{ color: t.textMuted, fontSize: 12 }}>–</Text>
                  <TextInput value={h.close} onChangeText={v => updateHourField(h.day, 'close', v)}
                    style={[s.timeInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]}
                    placeholder="18:00" placeholderTextColor={t.textMuted} maxLength={5} />
                </View>
              )}
              <Switch value={!h.closed} onValueChange={() => toggleClosed(h.day)} trackColor={{ true: t.accent }} />
            </View>
          ))}
          <TouchableOpacity onPress={saveHours} disabled={saving}
            style={[s.saveBtn, { backgroundColor: saving ? `${t.accent}88` : t.accent, marginTop: 12 }]}>
            <Text style={s.saveBtnText}>Save Hours</Text>
          </TouchableOpacity>
        </Section>

        <Section theme={t} title={`Doctors in this clinic (${doctors.length})`}>
          {doctors.length === 0 ? (
            <Text style={{ fontSize: 12, color: t.textMuted, paddingVertical: 8 }}>No doctors assigned yet.</Text>
          ) : doctors.map(doc => (
            <View key={doc.id} style={s.doctorRow}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.textPrimary }}>{doc.full_name}</Text>
                {doc.specialty_name && <Text style={{ fontSize: 11, color: t.textMuted }}>{doc.specialty_name}</Text>}
              </View>
              <TouchableOpacity onPress={() => unassignDoctor(doc.id)} disabled={saving}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#FF5C5C' }}>Unassign</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            onPress={() => { setShowAssign(true); if (clinic) loadRoster(clinic.hospital_id) }}
            style={[s.smallOutlineBtn, { borderColor: t.accent, marginTop: 10 }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent }}>+ Assign a doctor</Text>
          </TouchableOpacity>
        </Section>
      </ScrollView>

      {showAssign && (
        <View style={s.overlay}>
          <View style={[s.modal, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <Text style={[s.sectionTitle, { color: t.textPrimary }]}>Assign a doctor</Text>
              <TouchableOpacity onPress={() => setShowAssign(false)}><Ionicons name="close" size={22} color={t.textMuted} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {assignable.length === 0 ? (
                <Text style={{ fontSize: 12, color: t.textMuted, paddingVertical: 8 }}>
                  Every doctor linked to this hospital is already assigned here.
                </Text>
              ) : assignable.map(d => (
                <TouchableOpacity key={d.id} onPress={() => assignDoctor(d.id)}
                  style={[s.doctorRow, { borderColor: t.cardBorder, borderWidth: 1, borderRadius: 10, marginBottom: 6, paddingHorizontal: 10 }]}>
                  <Text style={{ fontSize: 13, color: t.textPrimary, flex: 1 }}>{d.full_name}</Text>
                  <Ionicons name="add-circle-outline" size={20} color={t.accent} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      )}
    </SafeAreaView>
  )
}

function Section({ theme: t, title, children }: { theme: any; title: string; children: React.ReactNode }) {
  return (
    <View style={[s.section, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
      <Text style={[s.sectionTitle, { color: t.textPrimary }]}>{title}</Text>
      {children}
    </View>
  )
}

function Field({ theme: t, label, value, onChange, multiline, keyboardType, placeholder }: {
  theme: any; label: string; value: string; onChange: (v: string) => void
  multiline?: boolean; keyboardType?: 'default' | 'number-pad'; placeholder?: string
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={[s.label, { color: t.textMuted }]}>{label.toUpperCase()}</Text>
      <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
        <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.textMuted}
          multiline={multiline} keyboardType={keyboardType} style={{ color: t.textPrimary, fontSize: 13 }} />
      </View>
    </View>
  )
}

function ToggleRow({ theme: t, label, sub, value, onToggle, last }: {
  theme: any; label: string; sub: string; value: boolean; onToggle: () => void; last?: boolean
}) {
  return (
    <View style={[s.toggleRow, { borderBottomWidth: last ? 0 : 1, borderBottomColor: t.cardBorder }]}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: t.textPrimary }}>{label}</Text>
        <Text style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onToggle} trackColor={{ true: t.accent }} />
    </View>
  )
}

const s = StyleSheet.create({
  safe:       { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title:      { fontSize: 18, fontWeight: '800', letterSpacing: -0.3, flex: 1 },
  section:    { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 14, fontWeight: '800', marginBottom: 12 },
  label:      { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  input:      { borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  chip:       { borderRadius: 99, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  saveBtn:    { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  saveBtnText:{ fontSize: 13, fontWeight: '800', color: '#fff' },
  toggleRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  hourRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  dayLabel:   { width: 36, fontSize: 12, fontWeight: '700' },
  timeInput:  { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, width: 56, textAlign: 'center' },
  doctorRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  smallOutlineBtn: { borderRadius: 10, borderWidth: 1, paddingVertical: 10, alignItems: 'center' },
  overlay:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 24, paddingBottom: 40 },
})
