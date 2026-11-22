import { useState, useCallback } from 'react'
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Switch, KeyboardAvoidingView } from 'react-native'
import { Text, TextInput } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Seg, Chip, Notice, Btn,
  BottomBar, Stat, StatStrip, Empty, IconBtn, Initials, Mono, MONO,
  Field as KField,
} from '@queue/shared/components/q'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Alert }    from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { DayHours, getSpecialties, SpecialtyRow } from '@queue/shared/lib/api'
import { statusBadgeColors } from '@queue/shared/lib/statusColors'
import { fmtLocalDate } from '@queue/shared/lib/format'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

interface ClinicDetail {
  id: string; hospital_id: string; name: string; description: string | null
  is_active: boolean; is_emergency: boolean
  daily_booking_limit: number | null; min_age: number | null; max_age: number | null
  gender_restriction: 'male' | 'female' | null
}
interface ClinicDoctor { id: string; full_name: string; specialty_name: string | null; is_active: boolean; is_active_here: boolean }
interface UnassignedDoctor { id: string; full_name: string; title: string | null; specialty_name: string | null }
interface ClinicStaffMember { id: string; user_id: string; full_name: string; email: string; role: string; is_active: boolean; created_at: string }
interface ClinicAppt {
  id: string; booking_ref: string; appointment_date: string; start_time: string; status: string
  type: string; approval_status: string; patient_name: string; doctor_name: string; specialty_name: string | null
}
interface ClinicStats { total: number; completed: number; cancelled: number; pending: number; avgWaitMinutes: number | null; avgConsultMinutes: number | null }

type RangeKey = 'today' | 'week' | 'month'

function rangeBounds(key: RangeKey): { from: string; to: string } {
  const now = new Date()
  const fmt = fmtLocalDate  // local calendar date; the UTC slice is a day behind from 00:00-01:00 WAT
  if (key === 'today') return { from: fmt(now), to: fmt(now) }
  if (key === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - now.getDay())
    return { from: fmt(start), to: fmt(now) }
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: fmt(start), to: fmt(now) }
}

interface Props { navigation: any; route: { params: { clinicId: string } } }

type DetailTab = 'details' | 'people' | 'hours' | 'stats'

export function HospitalClinicDetailScreen({ navigation, route }: Props) {
  const [detailTab, setDetailTab] = useState<DetailTab>('details')
  const { theme: t } = useTheme()
  const { clinicId } = route.params

  const [clinic,   setClinic]   = useState<ClinicDetail | null>(null)
  const [doctors,  setDoctors]  = useState<ClinicDoctor[]>([])
  const [hours,    setHours]    = useState<DayHours[]>([])
  const [unassignedDoctors, setUnassignedDoctors] = useState<UnassignedDoctor[]>([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [showAssign, setShowAssign] = useState(false)
  const [assignTab, setAssignTab] = useState<'assign' | 'new'>('assign')

  // Staff / appointments / analytics -- all three come back from the same
  // GET /api/clinics/[clinicId]?from=&to= call `load()` already makes (it
  // bundles clinic/doctors/staff/appointments/stats/hours in one response),
  // just never read past `clinic`/`doctors`/`clinicHours` before this.
  const [staff,   setStaff]   = useState<ClinicStaffMember[]>([])
  const [appts,   setAppts]   = useState<ClinicAppt[]>([])
  const [stats,   setStats]   = useState<ClinicStats>({ total: 0, completed: 0, cancelled: 0, pending: 0, avgWaitMinutes: null, avgConsultMinutes: null })
  const [rangeKey, setRangeKey] = useState<RangeKey>('today')
  const [showAddStaff, setShowAddStaff] = useState(false)
  const [managingStaff, setManagingStaff] = useState<ClinicStaffMember | null>(null)

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
      const { from, to } = rangeBounds(rangeKey)
      const detailRes = await fetch(`${API_URL}/api/clinics/${clinicId}?from=${from}&to=${to}`, { headers })
      const body = await detailRes.json()
      if (detailRes.ok) {
        setClinic(body.clinic)
        setDoctors(body.doctors ?? [])
        setHours(body.clinicHours?.hours ?? [])
        setStaff(body.staff ?? [])
        setAppts(body.appointments ?? [])
        setStats(body.stats ?? { total: 0, completed: 0, cancelled: 0, pending: 0, avgWaitMinutes: null, avgConsultMinutes: null })
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
  }, [clinicId, rangeKey])

  // Doctors linked to this hospital but not yet assigned to THIS clinic --
  // matches web's clinic-detail "Assign Existing" tab (GET
  // /api/doctors/unassigned?clinicId=, which now excludes only doctors
  // already a doctor_clinics member of this clinic). A doctor can be
  // assigned to several clinics at once, so one already active elsewhere
  // still shows up here -- that's the point of multi-clinic assignment.
  const loadUnassigned = useCallback(async () => {
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/doctors/unassigned?clinicId=${clinicId}`, { headers })
      const body = await res.json()
      setUnassignedDoctors(res.ok ? (body.doctors ?? []) : [])
    } catch {
      setUnassignedDoctors([])
    }
  }, [clinicId])

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

  // Admin/staff-driven "Set Active" -- makes this clinic the doctor's
  // currently active one among however many clinics they're assigned to.
  // The doctor's own equivalent lives in the doctors app (DoctorHospitalsScreen).
  async function setDoctorActive(doctorId: string) {
    setSaving(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/clinics/${clinicId}/doctors/${doctorId}`, { method: 'PATCH', headers })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to set active')
      haptics.success()
      await load()
    } catch (e) {
      haptics.error(); Alert.alert(e instanceof Error ? e.message : 'Failed to set active')
    } finally { setSaving(false) }
  }

  async function removeStaff(member: ClinicStaffMember) {
    Alert.alert(`Remove ${member.full_name}?`, 'This deactivates their login and revokes their session immediately.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        setSaving(true)
        try {
          const headers = await authHeaders()
          const res = await fetch(`${API_URL}/api/clinic-staff`, { method: 'DELETE', headers, body: JSON.stringify({ staffId: member.id }) })
          if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to remove')
          haptics.success()
          setStaff(list => list.filter(s => s.id !== member.id))
          setManagingStaff(null)
        } catch (e) {
          haptics.error(); Alert.alert(e instanceof Error ? e.message : 'Failed to remove')
        } finally { setSaving(false) }
      } },
    ])
  }

  async function updateStaffProfile(memberId: string, fullName: string, email: string) {
    const headers = await authHeaders()
    const res = await fetch(`${API_URL}/api/clinic-staff`, {
      method: 'PATCH', headers, body: JSON.stringify({ staffId: memberId, full_name: fullName, email }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(body?.error ?? 'Failed to save')
    setStaff(list => list.map(s => s.id === memberId ? { ...s, full_name: fullName, email } : s))
  }

  async function resetStaffPassword(memberId: string, newPassword: string) {
    const headers = await authHeaders()
    const res = await fetch(`${API_URL}/api/clinic-staff/reset-password`, {
      method: 'POST', headers, body: JSON.stringify({ staffId: memberId, newPassword }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) throw new Error(body?.error ?? 'Failed to reset password')
  }

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      </Screen>
    )
  }

  // The handoff splits this into four tabs. It was one scroll holding a form,
  // a rota, two staff lists, an appointment list and three charts -- long
  // enough that the save button for the details form sat a screen and a half
  // above the analytics nobody scrolled to.
  const subAdmin = staff.find(m => m.role === 'clinic_admin')
  const deskOfficers = staff.filter(m => m.role === 'front_desk' || m.role === 'desk_officer')
  const pendingCount = appts.filter(a => a.approval_status === 'pending_approval').length

  return (
    <Screen>
      <AppBar
        title={clinic?.name ?? 'Clinic'}
        sub={clinic?.is_emergency ? 'Emergency department' : clinic?.is_active ? 'Active' : 'Inactive'}
        onBack={() => navigation.goBack()}
        right={saving ? (
          <View style={{ width: 44, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator size="small" color={t.q.primary} />
          </View>
        ) : undefined}
      />

      <Seg<DetailTab>
        value={detailTab} onChange={setDetailTab}
        options={[
          { key: 'details', label: 'Details' },
          { key: 'people', label: 'People' },
          { key: 'hours', label: 'Hours' },
          { key: 'stats', label: 'Stats' },
        ]}
      />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Body keyboardShouldPersistTaps="handled">

          {/* ── Details ──────────────────────────────────────────── */}
          {detailTab === 'details' && (
            <>
              <View style={{ paddingHorizontal: 16, gap: 14, paddingTop: 6 }}>
                <KField label="Name" value={name} onChangeText={setName} placeholder="Clinic name" />
                <KField label="Description" value={description} onChangeText={setDescription}
                  multiline numberOfLines={3} placeholder="What this clinic treats"
                  style={{ minHeight: 76, textAlignVertical: 'top' }} />
                <KField label="Daily booking limit" hint="Leave blank for no limit"
                  value={dailyLimit} onChangeText={setDailyLimit}
                  keyboardType="number-pad" placeholder="Unlimited" />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <KField label="Min age" value={minAge} onChangeText={setMinAge}
                      keyboardType="number-pad" placeholder="None" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <KField label="Max age" value={maxAge} onChangeText={setMaxAge}
                      keyboardType="number-pad" placeholder="None" />
                  </View>
                </View>
              </View>

              <SectionHead title="Who it is for" />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
                {([null, 'male', 'female'] as const).map(g => (
                  <Chip
                    key={g ?? 'none'}
                    label={g ? (g === 'male' ? 'Men only' : 'Women only') : 'Anyone'}
                    on={genderRestriction === g}
                    onPress={() => setGenderRestriction(g)}
                  />
                ))}
              </View>

              <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
                <Btn label="Save details" loading={saving} onPress={handleSaveDetails} />
              </View>

              <SectionHead title="Status" />
              <Card>
                <KToggleRow
                  label="Active"
                  sub="An inactive clinic takes no new bookings"
                  value={!!clinic?.is_active}
                  onToggle={toggleActive}
                  theme={t}
                />
                <KToggleRow
                  label="Emergency department"
                  sub="Only one clinic per hospital can hold this"
                  value={!!clinic?.is_emergency}
                  onToggle={toggleEmergency}
                  theme={t}
                  last
                />
              </Card>
            </>
          )}

          {/* ── People ───────────────────────────────────────────── */}
          {detailTab === 'people' && (
            <>
              <SectionHead title={`Doctors · ${doctors.length}`} />
              {doctors.length === 0 ? (
                <Card>
                  <Empty
                    icon="medical-outline"
                    title="No doctors here yet"
                    body="Assign a doctor already at this hospital, or link a new one by their doctor ID."
                    action="Add a doctor"
                    onAction={() => { setAssignTab('assign'); setShowAssign(true); loadUnassigned() }}
                  />
                </Card>
              ) : (
                <Card>
                  {doctors.map((doc, i) => (
                    <View key={doc.id}>
                      {i > 0 && <Hair />}
                      <Row
                        leading={<Initials name={doc.full_name} size={40} tint="#7C2D12" />}
                        title={doc.full_name}
                        sub={doc.specialty_name}
                        pill={doc.is_active_here ? 'Active here' : undefined}
                        pillTone="green"
                      />
                      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 12 }}>
                        {!doc.is_active_here && (
                          <Btn label="Set active" variant="secondary" small disabled={saving}
                            onPress={() => setDoctorActive(doc.id)} />
                        )}
                        <Btn label="Unassign" variant="ghost" small disabled={saving}
                          onPress={() => unassignDoctor(doc.id)} />
                      </View>
                    </View>
                  ))}
                </Card>
              )}

              <SectionHead title="Sub-admin · clinic management" />
              <Card>
                {subAdmin ? (
                  <Row
                    leading={<Initials name={subAdmin.full_name} size={40} />}
                    title={subAdmin.full_name}
                    sub={subAdmin.email}
                    right={<Btn label="Manage" variant="secondary" small onPress={() => setManagingStaff(subAdmin)} />}
                  />
                ) : (
                  <Row
                    icon="person-add-outline" iconTone="neutral"
                    title="No sub-admin yet"
                    sub="A sub-admin manages this clinic's doctors, staff and hours"
                    right={<Btn label="Add" variant="secondary" small onPress={() => setShowAddStaff(true)} />}
                  />
                )}
              </Card>

              <SectionHead title="Front desk · queue & check-in" />
              <Card>
                {deskOfficers.length === 0 ? (
                  <Row
                    icon="person-add-outline" iconTone="neutral"
                    title="No front desk officers yet"
                    sub="They check patients in and run the queue"
                    right={<Btn label="Add" variant="secondary" small onPress={() => setShowAddStaff(true)} />}
                  />
                ) : deskOfficers.map((m, i) => (
                  <View key={m.id}>
                    {i > 0 && <Hair />}
                    <Row
                      leading={<Initials name={m.full_name} size={40} />}
                      title={m.full_name}
                      sub={m.email}
                      right={<Btn label="Manage" variant="secondary" small onPress={() => setManagingStaff(m)} />}
                    />
                  </View>
                ))}
              </Card>
            </>
          )}

          {/* ── Hours ────────────────────────────────────────────── */}
          {detailTab === 'hours' && (
            <>
              <SectionHead title="When this clinic is open" />
              <Card>
                {hours.map((h, i) => (
                  <View key={h.day}>
                    {i > 0 && <Hair />}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, minHeight: 56, paddingVertical: 8 }}>
                      <Text style={{ flex: 1, fontSize: 14, fontWeight: '600', color: t.q.ink }}>
                        {DAY_NAMES[h.day]}
                      </Text>
                      {h.closed ? (
                        <Text style={{ fontSize: 13, color: t.q.ink60 }}>Closed</Text>
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <TextInput
                            value={h.open}
                            onChangeText={v => updateHourField(h.day, 'open', v)}
                            placeholder="08:00" placeholderTextColor={t.q.ink60} maxLength={5}
                            accessibilityLabel={`${DAY_NAMES[h.day]} opens`}
                            style={{
                              width: 64, minHeight: 40, borderRadius: 10, borderWidth: 1,
                              borderColor: t.q.line, backgroundColor: t.q.field, paddingHorizontal: 8,
                              textAlign: 'center', fontFamily: MONO, fontSize: 13, color: t.q.ink,
                            }}
                          />
                          <Text style={{ color: t.q.ink60 }}>–</Text>
                          <TextInput
                            value={h.close}
                            onChangeText={v => updateHourField(h.day, 'close', v)}
                            placeholder="18:00" placeholderTextColor={t.q.ink60} maxLength={5}
                            accessibilityLabel={`${DAY_NAMES[h.day]} closes`}
                            style={{
                              width: 64, minHeight: 40, borderRadius: 10, borderWidth: 1,
                              borderColor: t.q.line, backgroundColor: t.q.field, paddingHorizontal: 8,
                              textAlign: 'center', fontFamily: MONO, fontSize: 13, color: t.q.ink,
                            }}
                          />
                        </View>
                      )}
                      <Switch
                        value={!h.closed}
                        onValueChange={() => toggleClosed(h.day)}
                        accessibilityLabel={`${DAY_NAMES[h.day]} open`}
                        trackColor={{ true: t.q.primary, false: t.q.line }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  </View>
                ))}
              </Card>
              <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
                <Btn label="Save hours" loading={saving} onPress={saveHours} />
              </View>
            </>
          )}

          {/* ── Stats ────────────────────────────────────────────── */}
          {detailTab === 'stats' && (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 10 }}>
                {(['today', 'week', 'month'] as const).map(k => (
                  <Chip
                    key={k}
                    label={k === 'today' ? 'Today' : k === 'week' ? 'This week' : 'This month'}
                    on={rangeKey === k}
                    onPress={() => setRangeKey(k)}
                  />
                ))}
              </View>

              <StatStrip>
                <Stat label="Booked" value={stats.total} note={`${stats.completed} seen`} />
                <Stat label="Cancelled" value={stats.cancelled}
                  tone={stats.cancelled > 0 ? 'amber' : undefined} note="in this period" />
                <Stat label="Avg wait" value={stats.avgWaitMinutes ?? '—'}
                  unit={stats.avgWaitMinutes != null ? 'min' : undefined}
                  note={stats.avgConsultMinutes != null ? `${stats.avgConsultMinutes} min consult` : 'not timed'}
                  last />
              </StatStrip>

              {pendingCount > 0 && (
                <Notice tone="amber" icon="hourglass-outline">
                  {pendingCount} booking{pendingCount === 1 ? '' : 's'} awaiting review in this clinic.
                </Notice>
              )}

              {appts.length > 0 && (() => {
                const virtual = appts.filter(a => a.type === 'virtual').length
                const inPerson = appts.length - virtual
                const virtPct = Math.round((virtual / appts.length) * 100)
                return (
                  <>
                    <SectionHead title="Visit type" />
                    <Card pad style={{ gap: 12 }}>
                      <View style={{ flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                        <View style={{ width: `${100 - virtPct}%`, backgroundColor: t.q.primary }} />
                        <View style={{ flex: 1, backgroundColor: t.q.amberFill }} />
                      </View>
                      {[
                        { label: 'In person', count: inPerson, pct: 100 - virtPct, color: t.q.primary },
                        { label: 'Video', count: virtual, pct: virtPct, color: t.q.amberFill },
                      ].map(r => (
                        <View key={r.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <View style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: r.color }} />
                          <Text style={{ flex: 1, fontSize: 13, color: t.q.ink }}>{r.label}</Text>
                          <Mono size={13} weight="700">{r.count}</Mono>
                          <Mono size={12} color={t.q.ink60}>{r.pct}%</Mono>
                        </View>
                      ))}
                    </Card>
                  </>
                )
              })()}

              {(() => {
                const specCounts: Record<string, number> = {}
                appts.forEach(a => { const n = a.specialty_name ?? 'General'; specCounts[n] = (specCounts[n] ?? 0) + 1 })
                const rows = Object.entries(specCounts).sort((x, y) => y[1] - x[1]).slice(0, 5)
                  .map(([nm, count]) => ({ name: nm, count, pct: appts.length > 0 ? Math.round((count / appts.length) * 100) : 0 }))
                return rows.length > 0 ? (
                  <>
                    <SectionHead title="Top specialties" />
                    <Card pad style={{ gap: 10 }}>
                      {rows.map(sp => (
                        <View key={sp.name} style={{ gap: 4 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Text numberOfLines={1} style={{ flex: 1, fontSize: 13, color: t.q.ink }}>{sp.name}</Text>
                            <Mono size={13} weight="700">{sp.count}</Mono>
                            <Mono size={12} color={t.q.ink60}>{sp.pct}%</Mono>
                          </View>
                          <View style={{ height: 6, borderRadius: 3, backgroundColor: t.q.muted, overflow: 'hidden' }}>
                            <View style={{ width: `${sp.pct}%`, height: '100%', backgroundColor: t.q.primary }} />
                          </View>
                        </View>
                      ))}
                    </Card>
                  </>
                ) : null
              })()}

              <SectionHead title="Appointments" />
              {appts.length === 0 ? (
                <Card>
                  <Empty icon="calendar-outline" title="Nothing in this period"
                    body="Bookings into this clinic show up here." />
                </Card>
              ) : (
                <Card>
                  {appts.map((a, i) => (
                    <View key={a.id}>
                      {i > 0 && <Hair />}
                      <Row
                        title={a.patient_name}
                        sub={`${a.appointment_date} · ${a.start_time} · ${a.doctor_name}`}
                        pill={a.status.replace(/_/g, ' ')}
                        pillTone={
                          a.status === 'completed' ? 'green'
                          : a.status === 'checked_in' || a.status === 'in_progress' ? 'teal'
                          : a.status === 'cancelled' || a.status === 'no_show' ? 'neutral'
                          : 'amber'
                        }
                      />
                    </View>
                  ))}
                </Card>
              )}
            </>
          )}
        </Body>
      </KeyboardAvoidingView>

      {detailTab === 'people' && (
        <BottomBar>
          <Btn label="Add staff" variant="secondary" icon="person-add-outline"
            onPress={() => setShowAddStaff(true)} />
          <Btn grow label="Add doctor" icon="medical-outline"
            onPress={() => { setAssignTab('assign'); setShowAssign(true); loadUnassigned() }} />
        </BottomBar>
      )}

      {showAssign && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
        }}>
          <View style={{
            backgroundColor: t.q.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingTop: 16, paddingBottom: 28, maxHeight: '85%',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: t.q.ink }}>Add a doctor</Text>
              <IconBtn name="close" label="Close" onPress={() => setShowAssign(false)} />
            </View>
            <View style={{ paddingHorizontal: 20, paddingBottom: 6 }}>
              <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink60 }}>
                Assign a doctor already at this hospital, or link a new one by their doctor ID.
              </Text>
            </View>

            <Seg<'assign' | 'new'>
              value={assignTab} onChange={setAssignTab}
              options={[{ key: 'assign', label: 'Already here' }, { key: 'new', label: 'Link by ID' }]}
            />

            {assignTab === 'assign' ? (
              <ScrollView style={{ maxHeight: 360 }}>
                {unassignedDoctors.length === 0 ? (
                  <Card>
                    <Empty
                      icon="medical-outline"
                      title="No unassigned doctors"
                      body="Every doctor at this hospital is already in a clinic. Use Link by ID to add one who is not linked yet."
                    />
                  </Card>
                ) : (
                  <Card>
                    {unassignedDoctors.map((d, i) => (
                      <View key={d.id}>
                        {i > 0 && <Hair />}
                        <Row
                          leading={<Initials name={d.full_name} size={40} tint="#7C2D12" />}
                          title={[d.title, d.full_name].filter(Boolean).join(' ')}
                          sub={d.specialty_name}
                          right={<Ionicons name="add-circle-outline" size={20} color={t.q.primary} />}
                          onPress={saving ? undefined : () => assignDoctor(d.id)}
                        />
                      </View>
                    ))}
                  </Card>
                )}
              </ScrollView>
            ) : (
              <ScrollView style={{ maxHeight: 360 }}>
                <LinkDoctorByIdForm
                  theme={t} clinicId={clinicId}
                  onLinked={() => { setShowAssign(false); load() }}
                />
              </ScrollView>
            )}
          </View>
        </View>
      )}

      {showAddStaff && (
        <AddStaffModal
          theme={t} clinicId={clinicId} hospitalId={clinic?.hospital_id ?? ''}
          existingSubAdmin={staff.some(m => m.role === 'clinic_admin')}
          onClose={() => setShowAddStaff(false)}
          onDone={() => { setShowAddStaff(false); load() }}
        />
      )}

      {managingStaff && (
        <ManageStaffModal
          theme={t} member={managingStaff}
          onClose={() => setManagingStaff(null)}
          onRemove={() => removeStaff(managingStaff)}
          onSaveProfile={(nm, em) => updateStaffProfile(managingStaff.id, nm, em)}
          onResetPassword={pw => resetStaffPassword(managingStaff.id, pw)}
        />
      )}
    </Screen>
  )
}

// The "Link by ID" tab of the Add Doctor modal -- the piece that was entirely
// missing before: "Assign Existing" only ever offered doctors already linked
// to the hospital, so a hospital with no doctors linked yet (or none free)
// had no way at all to add a doctor to a specific clinic. Mirrors web's
// LinkDoctorForm (clinics/[clinicId]/page.tsx's AssignDoctorModal) and the
// hospital-wide version already on StaffManagementScreen's Doctors tab --
// this one just fixes clinicId to the clinic being viewed instead of leaving
// it unscoped.
function LinkDoctorByIdForm({ theme: t, clinicId, onLinked }: { theme: any; clinicId: string; onLinked: () => void }) {
  const [step,        setStep]        = useState<'code' | 'confirm'>('code')
  const [code,        setCode]        = useState('')
  const [fullName,    setFullName]    = useState('')
  const [alreadyLinked, setAlreadyLinked] = useState(false)
  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([])
  const [specialtyId, setSpecialtyId] = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const jwt = session?.access_token
    if (!jwt) throw new Error('Not authenticated')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }
  }

  async function handleLookUp() {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) { setError('Doctor ID is required.'); return }
    setLoading(true); setError('')
    try {
      const headers = await authHeaders()
      const [lookupRes, specialtyList] = await Promise.all([
        fetch(`${API_URL}/api/doctors/link?code=${encodeURIComponent(trimmed)}`, { headers }),
        specialties.length > 0 ? Promise.resolve(specialties) : getSpecialties(),
      ])
      const body = await lookupRes.json()
      if (!lookupRes.ok) throw new Error(body?.error ?? 'No doctor account found with that ID')
      setSpecialties(specialtyList)
      setFullName(body.fullName)
      setAlreadyLinked(!!body.alreadyLinked)
      setSpecialtyId(body.suggestedSpecialtyId ?? null)
      setStep('confirm')
    } catch (e) {
      haptics.error()
      setError(e instanceof Error ? e.message : 'Look up failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleConfirm() {
    setLoading(true); setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/doctors/link`, {
        method: 'POST', headers,
        body: JSON.stringify({ doctorCode: code.trim().toUpperCase(), clinicId, specialtyId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Link failed')
      haptics.success()
      onLinked()
    } catch (e) {
      haptics.error()
      setError(e instanceof Error ? e.message : 'Link failed')
    } finally {
      setLoading(false)
    }
  }

  return step === 'code' ? (
    <>
      <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, marginBottom: 4 }]}>
        <TextInput value={code} onChangeText={v => setCode(v.toUpperCase())}
          placeholder="e.g. K7M3QX" placeholderTextColor={t.textMuted}
          style={{ color: t.textPrimary, fontSize: 20, fontWeight: '800', letterSpacing: 4, textAlign: 'center' }}
          autoCapitalize="characters" maxLength={6} />
      </View>
      {error ? <Text style={{ fontSize: 12, color: t.danger, marginTop: 8 }}>{error}</Text> : null}
      <TouchableOpacity onPress={handleLookUp} disabled={loading}
        style={[s.saveBtn, { backgroundColor: loading ? `${t.accent}88` : t.accent, marginTop: 14 }]}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Look Up</Text>}
      </TouchableOpacity>
    </>
  ) : (
    <>
      <Text style={{ fontSize: 13, color: t.textPrimary, marginBottom: 4 }}>
        Found <Text style={{ fontWeight: '800' }}>{fullName}</Text>. Their profile transfers automatically —
        just choose the specialty they'll practise here.
      </Text>
      {alreadyLinked ? (
        <Text style={{ fontSize: 12, color: '#EF9F27', marginBottom: 10 }}>This doctor is already linked to your hospital.</Text>
      ) : null}
      <Text style={[s.label, { color: t.textMuted, marginTop: 10 }]}>SPECIALTY</Text>
      <ScrollView style={{ maxHeight: 160, marginBottom: 4 }} showsVerticalScrollIndicator={false}>
        {specialties.map(sp => (
          <TouchableOpacity key={sp.id} onPress={() => setSpecialtyId(sp.id)}
            style={[s.doctorRow, { borderColor: specialtyId === sp.id ? t.accent : t.cardBorder, borderWidth: 1, borderRadius: 10, marginBottom: 6, paddingHorizontal: 10, backgroundColor: specialtyId === sp.id ? `${t.accent}18` : 'transparent' }]}>
            <Text style={{ fontSize: 13, color: specialtyId === sp.id ? t.accent : t.textPrimary, fontWeight: specialtyId === sp.id ? '700' : '400' }}>{sp.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {error ? <Text style={{ fontSize: 12, color: t.danger }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
        <TouchableOpacity onPress={() => { setStep('code'); setError('') }}
          style={[s.saveBtn, { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: t.cardBorder }]}>
          <Text style={[s.saveBtnText, { color: t.textPrimary }]}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleConfirm} disabled={loading}
          style={[s.saveBtn, { flex: 1, backgroundColor: loading ? `${t.accent}88` : t.accent }]}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Confirm & Link</Text>}
        </TouchableOpacity>
      </View>
    </>
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

function KToggleRow({ theme: t, label, sub, value, onToggle, last }: {
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

function StaffRow({ theme: t, member, roleLabel, onManage }: {
  theme: any; member: ClinicStaffMember; roleLabel: string; onManage: () => void
}) {
  return (
    <View style={s.doctorRow}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13, fontWeight: '700', color: t.textPrimary }}>{member.full_name}</Text>
        <Text style={{ fontSize: 11, color: t.textMuted }} numberOfLines={1}>{member.email}</Text>
      </View>
      <View style={[s.chip, { borderColor: t.cardBorder, marginRight: 10 }]}>
        <Text style={{ fontSize: 10, fontWeight: '700', color: t.textMuted }}>{roleLabel}</Text>
      </View>
      <TouchableOpacity onPress={onManage}>
        <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent }}>Manage</Text>
      </TouchableOpacity>
    </View>
  )
}

function StatTile({ theme: t, label, value }: { theme: any; label: string; value: string }) {
  return (
    <View style={[s.statTile, { backgroundColor: t.inputBg, borderColor: t.cardBorder }]}>
      <Text style={{ fontSize: 10, fontWeight: '700', color: t.textMuted, letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      <Text style={{ fontSize: 20, fontWeight: '800', color: t.textPrimary, marginTop: 4 }}>{value}</Text>
    </View>
  )
}

// Random temp password shown once, selectable so the admin can long-press-copy
// it without a Clipboard library -- expo-clipboard isn't a dependency of this
// app (only apps/client has it), and adding one now is a native-module change
// needing its own prebuild, not something to pull in for one field.
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let p = 'Queue@'
  for (let i = 0; i < 6; i++) p += chars[Math.floor(Math.random() * chars.length)]
  return p + '!'
}

function AddStaffModal({ theme: t, clinicId, hospitalId, existingSubAdmin, onClose, onDone }: {
  theme: any; clinicId: string; hospitalId: string; existingSubAdmin: boolean
  onClose: () => void; onDone: () => void
}) {
  const [role, setRole] = useState<'front_desk' | 'clinic_admin'>('front_desk')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password] = useState(generateTempPassword)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState(false)

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` }
  }

  async function handleCreate() {
    if (!name.trim() || !email.trim()) { setError('Name and email are required'); return }
    setLoading(true); setError('')
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/clinic-staff`, {
        method: 'POST', headers,
        body: JSON.stringify({ clinicId, hospitalId, staffName: name, staffEmail: email, tempPassword: password, role }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(body?.error ?? 'Failed to create account')
      haptics.success()
      setCreated(true)
    } catch (e) {
      haptics.error()
      setError(e instanceof Error ? e.message : 'Failed to create account')
    } finally {
      setLoading(false)
    }
  }

  const ROLES: { key: 'front_desk' | 'clinic_admin'; label: string; desc: string; disabled: boolean }[] = [
    { key: 'front_desk',  label: 'Front Desk Officer', desc: 'Manages check-ins & queue',     disabled: false },
    { key: 'clinic_admin', label: 'Sub-Admin',         desc: 'Full clinic management access', disabled: existingSubAdmin },
  ]

  if (created) {
    return (
      <View style={s.overlay}>
        <View style={[s.modal, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[s.sectionTitle, { color: t.textPrimary }]}>Account created</Text>
          <Text style={{ fontSize: 12, color: t.textMuted, marginBottom: 14, lineHeight: 18 }}>
            Share these credentials with {name} -- this password won't be shown again. Long-press to select and copy.
          </Text>
          <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, marginBottom: 10 }]}>
            <Text style={{ fontSize: 11, color: t.textMuted }}>EMAIL</Text>
            <Text selectable style={{ fontSize: 14, color: t.textPrimary, fontWeight: '600', marginTop: 2 }}>{email}</Text>
          </View>
          <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, marginBottom: 16 }]}>
            <Text style={{ fontSize: 11, color: t.textMuted }}>TEMPORARY PASSWORD</Text>
            <Text selectable style={{ fontSize: 16, color: t.textPrimary, fontWeight: '700', letterSpacing: 1, marginTop: 2 }}>{password}</Text>
          </View>
          <TouchableOpacity onPress={onDone} style={[s.saveBtn, { backgroundColor: t.accent }]}>
            <Text style={s.saveBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={s.overlay}>
      <View style={[s.modal, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <Text style={[s.sectionTitle, { color: t.textPrimary, marginBottom: 0 }]}>Add Staff Member</Text>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={8}><Ionicons name="close" size={22} color={t.textMuted} /></TouchableOpacity>
        </View>
        <Text style={{ fontSize: 12, color: t.textMuted, marginBottom: 14 }}>Create a login account for this clinic&apos;s staff.</Text>

        <View style={{ gap: 8, marginBottom: 14 }}>
          {ROLES.map(r => (
            <TouchableOpacity key={r.key} onPress={() => !r.disabled && setRole(r.key)} disabled={r.disabled}
              style={[s.roleOption, { borderColor: role === r.key ? t.accent : t.cardBorder, backgroundColor: role === r.key ? `${t.accent}18` : 'transparent', opacity: r.disabled ? 0.4 : 1 }]}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: role === r.key ? t.accent : t.textPrimary }}>{r.label}</Text>
              <Text style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{r.disabled ? 'This clinic already has a sub-admin' : r.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Field theme={t} label="Full name" value={name} onChange={setName} />
        <Field theme={t} label="Email" value={email} onChange={setEmail} />

        {error ? <Text style={{ fontSize: 12, color: t.danger, marginBottom: 8 }}>{error}</Text> : null}
        <TouchableOpacity onPress={handleCreate} disabled={loading}
          style={[s.saveBtn, { backgroundColor: loading ? `${t.accent}88` : t.accent, marginTop: 6 }]}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Create Account</Text>}
        </TouchableOpacity>
      </View>
    </View>
  )
}

function ManageStaffModal({ theme: t, member, onClose, onRemove, onSaveProfile, onResetPassword }: {
  theme: any; member: ClinicStaffMember; onClose: () => void; onRemove: () => void
  onSaveProfile: (name: string, email: string) => Promise<void>
  onResetPassword: (password: string) => Promise<void>
}) {
  const [tab, setTab] = useState<'edit' | 'password'>('edit')
  const [name, setName] = useState(member.full_name)
  const [email, setEmail] = useState(member.email)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function saveProfile() {
    setSaving(true); setError(''); setSuccess('')
    try {
      await onSaveProfile(name, email)
      setSuccess('Profile updated')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally { setSaving(false) }
  }

  async function savePassword() {
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      await onResetPassword(password)
      setSuccess('Password updated')
      setPassword('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset password')
    } finally { setSaving(false) }
  }

  const roleLabel = member.role === 'clinic_admin' ? 'Sub-Admin' : 'Front Desk'

  return (
    <View style={s.overlay}>
      <View style={[s.modal, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <View>
            <Text style={[s.sectionTitle, { color: t.textPrimary, marginBottom: 4 }]}>{member.full_name}</Text>
            <View style={[s.chip, { borderColor: t.accent, alignSelf: 'flex-start' }]}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: t.accent }}>{roleLabel}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={8}><Ionicons name="close" size={22} color={t.textMuted} /></TouchableOpacity>
        </View>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {(['edit', 'password'] as const).map(tb => (
            <TouchableOpacity key={tb} onPress={() => { setTab(tb); setError(''); setSuccess('') }}
              style={[s.tab, { borderColor: tab === tb ? t.accent : t.cardBorder, backgroundColor: tab === tb ? `${t.accent}18` : 'transparent' }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: tab === tb ? t.accent : t.textMuted }}>
                {tb === 'edit' ? 'Edit Profile' : 'Reset Password'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {tab === 'edit' ? (
          <>
            <Field theme={t} label="Full name" value={name} onChange={setName} />
            <Field theme={t} label="Email" value={email} onChange={setEmail} />
            {error ? <Text style={{ fontSize: 12, color: t.danger, marginBottom: 8 }}>{error}</Text> : null}
            {success ? <Text style={{ fontSize: 12, color: t.accent, marginBottom: 8 }}>{success}</Text> : null}
            <TouchableOpacity onPress={saveProfile} disabled={saving}
              style={[s.saveBtn, { backgroundColor: saving ? `${t.accent}88` : t.accent }]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save Profile</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Field theme={t} label="New password (min 8 characters)" value={password} onChange={setPassword} />
            {error ? <Text style={{ fontSize: 12, color: t.danger, marginBottom: 8 }}>{error}</Text> : null}
            {success ? <Text style={{ fontSize: 12, color: t.accent, marginBottom: 8 }}>{success}</Text> : null}
            <TouchableOpacity onPress={savePassword} disabled={saving}
              style={[s.saveBtn, { backgroundColor: saving ? `${t.accent}88` : t.accent }]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Update Password</Text>}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={onRemove} style={{ marginTop: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: t.danger }}>Remove from clinic</Text>
        </TouchableOpacity>
      </View>
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
  tab:        { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
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
  roleOption: { borderRadius: 12, borderWidth: 1, padding: 12 },
  statGrid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statTile:   { flexBasis: '47%', flexGrow: 1, borderRadius: 12, borderWidth: 1, padding: 12 },
  pendingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 12 },
  apptRow:    { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
})
