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
import { DayHours, getSpecialties, SpecialtyRow } from '@queue/shared/lib/api'
import { statusBadgeColors } from '@queue/shared/lib/statusColors'

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
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (key === 'today') return { from: fmt(now), to: fmt(now) }
  if (key === 'week') {
    const start = new Date(now); start.setDate(now.getDate() - now.getDay())
    return { from: fmt(start), to: fmt(now) }
  }
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  return { from: fmt(start), to: fmt(now) }
}

interface Props { navigation: any; route: { params: { clinicId: string } } }

export function HospitalClinicDetailScreen({ navigation, route }: Props) {
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
      <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={t.accent} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        {navigation.canGoBack?.() ? (
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityLabel="Go back" hitSlop={8}>
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
                {doc.is_active_here && (
                  <Text style={{ fontSize: 10, fontWeight: '700', color: t.accent, marginTop: 2 }}>Active here</Text>
                )}
              </View>
              {!doc.is_active_here && (
                <TouchableOpacity onPress={() => setDoctorActive(doc.id)} disabled={saving} style={{ marginRight: 14 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent }}>Set Active</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => unassignDoctor(doc.id)} disabled={saving}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#FF5C5C' }}>Unassign</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            onPress={() => { setAssignTab('assign'); setShowAssign(true); loadUnassigned() }}
            style={[s.smallOutlineBtn, { borderColor: t.accent, marginTop: 10 }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent }}>+ Add Doctor</Text>
          </TouchableOpacity>
        </Section>

        <Section theme={t} title={`Staff (${staff.length})`}>
          <Text style={[s.label, { color: t.textMuted, marginBottom: 8 }]}>SUB-ADMIN · CLINIC MANAGEMENT ACCESS</Text>
          {(() => {
            const subAdmin = staff.find(m => m.role === 'clinic_admin')
            return subAdmin ? (
              <StaffRow theme={t} member={subAdmin} roleLabel="Sub-Admin" onManage={() => setManagingStaff(subAdmin)} />
            ) : (
              <Text style={{ fontSize: 12, color: t.textMuted, paddingVertical: 8 }}>No sub-admin assigned to this clinic yet.</Text>
            )
          })()}

          <Text style={[s.label, { color: t.textMuted, marginTop: 16, marginBottom: 8 }]}>FRONT DESK OFFICERS · QUEUE & CHECK-IN</Text>
          {(() => {
            const deskOfficers = staff.filter(m => m.role === 'front_desk' || m.role === 'desk_officer')
            return deskOfficers.length === 0 ? (
              <Text style={{ fontSize: 12, color: t.textMuted, paddingVertical: 8 }}>No front desk officers yet.</Text>
            ) : deskOfficers.map(m => (
              <StaffRow key={m.id} theme={t} member={m} roleLabel="Desk" onManage={() => setManagingStaff(m)} />
            ))
          })()}

          <TouchableOpacity onPress={() => setShowAddStaff(true)} style={[s.smallOutlineBtn, { borderColor: t.accent, marginTop: 10 }]}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent }}>+ Add Staff Member</Text>
          </TouchableOpacity>
        </Section>

        <Section theme={t} title="Appointments">
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {(['today', 'week', 'month'] as const).map(k => (
              <TouchableOpacity key={k} onPress={() => setRangeKey(k)}
                style={[s.chip, { borderColor: rangeKey === k ? t.accent : t.cardBorder, backgroundColor: rangeKey === k ? `${t.accent}18` : 'transparent' }]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: rangeKey === k ? t.accent : t.textMuted }}>
                  {k === 'today' ? 'Today' : k === 'week' ? 'This week' : 'This month'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {(() => {
            const pending = appts.filter(a => a.approval_status === 'pending_approval')
            return pending.length > 0 ? (
              <View style={[s.pendingBanner, { backgroundColor: t.statusBusy.bg, borderColor: t.statusBusy.border }]}>
                <Ionicons name="hourglass-outline" size={14} color={t.statusBusy.text} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: t.statusBusy.text, flex: 1 }}>
                  {pending.length} booking{pending.length !== 1 ? 's' : ''} awaiting review
                </Text>
              </View>
            ) : null
          })()}

          {appts.length === 0 ? (
            <Text style={{ fontSize: 12, color: t.textMuted, paddingVertical: 8 }}>No appointments for this period.</Text>
          ) : (
            appts.map(a => {
              const sc = statusBadgeColors(t)[a.status as keyof ReturnType<typeof statusBadgeColors>] ?? t.statusNeutral
              return (
                <View key={a.id} style={s.apptRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: t.textPrimary }}>{a.patient_name}</Text>
                    <Text style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>
                      {a.appointment_date} · {a.start_time} · Dr. {a.doctor_name}
                    </Text>
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: sc.bg, borderColor: sc.border }]}>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: sc.text }}>{a.status.replace(/_/g, ' ')}</Text>
                  </View>
                </View>
              )
            })
          )}
        </Section>

        <Section theme={t} title="Analytics">
          <View style={s.statGrid}>
            <StatTile theme={t} label="Total" value={String(stats.total)} />
            <StatTile theme={t} label="Completed" value={String(stats.completed)} />
            <StatTile theme={t} label="Cancelled" value={String(stats.cancelled)} />
            <StatTile theme={t} label="Pending" value={String(stats.pending)} />
          </View>
          {(stats.avgWaitMinutes != null || stats.avgConsultMinutes != null) && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10, marginBottom: 4 }}>
              {stats.avgWaitMinutes != null && (
                <Text style={{ fontSize: 11, color: t.textMuted, flex: 1 }}>Avg wait: <Text style={{ fontWeight: '700', color: t.textPrimary }}>{stats.avgWaitMinutes}m</Text></Text>
              )}
              {stats.avgConsultMinutes != null && (
                <Text style={{ fontSize: 11, color: t.textMuted, flex: 1 }}>Avg consult: <Text style={{ fontWeight: '700', color: t.textPrimary }}>{stats.avgConsultMinutes}m</Text></Text>
              )}
            </View>
          )}

          {(() => {
            const specCounts: Record<string, number> = {}
            appts.forEach(a => { const n = a.specialty_name ?? 'General'; specCounts[n] = (specCounts[n] ?? 0) + 1 })
            const specBreakdown = Object.entries(specCounts).sort((x, y) => y[1] - x[1]).slice(0, 5)
              .map(([name, count]) => ({ name, count, pct: appts.length > 0 ? Math.round(count / appts.length * 100) : 0 }))
            return specBreakdown.length > 0 ? (
              <View style={{ marginTop: 16 }}>
                <Text style={[s.label, { color: t.textMuted, marginBottom: 10 }]}>TOP SPECIALTIES</Text>
                {specBreakdown.map((sp, i) => (
                  <View key={sp.name} style={{ marginBottom: i < specBreakdown.length - 1 ? 12 : 0 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: t.textPrimary }}>{sp.name}</Text>
                      <Text style={{ fontSize: 11, color: t.textMuted }}>{sp.count} · {sp.pct}%</Text>
                    </View>
                    <View style={{ height: 6, backgroundColor: t.inputBg, borderRadius: 99, overflow: 'hidden' }}>
                      <View style={{ height: '100%', width: `${sp.pct}%`, backgroundColor: t.accent, borderRadius: 99 }} />
                    </View>
                  </View>
                ))}
              </View>
            ) : null
          })()}

          {(() => {
            const virtual = appts.filter(a => a.type === 'virtual').length
            const inPerson = appts.length - virtual
            if (appts.length === 0) return null
            const virtPct = Math.round(virtual / appts.length * 100)
            return (
              <View style={{ marginTop: 16 }}>
                <Text style={[s.label, { color: t.textMuted, marginBottom: 10 }]}>VISIT TYPE</Text>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, color: t.textPrimary }}>In-person</Text>
                  <Text style={{ fontSize: 11, color: t.textMuted }}>{inPerson} · {100 - virtPct}%</Text>
                </View>
                <View style={{ height: 6, backgroundColor: t.inputBg, borderRadius: 99, overflow: 'hidden', marginBottom: 10 }}>
                  <View style={{ height: '100%', width: `${100 - virtPct}%`, backgroundColor: t.accent, borderRadius: 99 }} />
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 12, color: t.textPrimary }}>Virtual</Text>
                  <Text style={{ fontSize: 11, color: t.textMuted }}>{virtual} · {virtPct}%</Text>
                </View>
                <View style={{ height: 6, backgroundColor: t.inputBg, borderRadius: 99, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${virtPct}%`, backgroundColor: t.statusVirtual.text, borderRadius: 99 }} />
                </View>
              </View>
            )
          })()}
        </Section>
      </ScrollView>

      {showAssign && (
        <View style={s.overlay}>
          <View style={[s.modal, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <Text style={[s.sectionTitle, { color: t.textPrimary, marginBottom: 0 }]}>Add Doctor</Text>
              <TouchableOpacity onPress={() => setShowAssign(false)} accessibilityLabel="Close" hitSlop={8}><Ionicons name="close" size={22} color={t.textMuted} /></TouchableOpacity>
            </View>
            <Text style={{ fontSize: 12, color: t.textMuted, marginBottom: 14 }}>
              Assign a doctor already at this hospital, or link a new one by their Doctor ID.
            </Text>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {(['assign', 'new'] as const).map(tb => (
                <TouchableOpacity key={tb} onPress={() => setAssignTab(tb)}
                  style={[s.tab, { borderColor: assignTab === tb ? t.accent : t.cardBorder, backgroundColor: assignTab === tb ? `${t.accent}18` : 'transparent' }]}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: assignTab === tb ? t.accent : t.textMuted }}>
                    {tb === 'assign' ? 'Assign Existing' : 'Link by ID'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {assignTab === 'assign' ? (
              <ScrollView style={{ maxHeight: 320 }}>
                {unassignedDoctors.length === 0 ? (
                  <Text style={{ fontSize: 12, color: t.textMuted, paddingVertical: 8, lineHeight: 18 }}>
                    No unassigned doctors at this hospital.{'\n'}Use "Link by ID" to add one who isn't linked yet.
                  </Text>
                ) : unassignedDoctors.map(d => (
                  <TouchableOpacity key={d.id} onPress={() => assignDoctor(d.id)} disabled={saving}
                    style={[s.doctorRow, { borderColor: t.cardBorder, borderWidth: 1, borderRadius: 10, marginBottom: 6, paddingHorizontal: 10 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: t.textPrimary }}>{[d.title, d.full_name].filter(Boolean).join(' ')}</Text>
                      {d.specialty_name && <Text style={{ fontSize: 11, color: t.textMuted }}>{d.specialty_name}</Text>}
                    </View>
                    <Ionicons name="add-circle-outline" size={20} color={t.accent} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <LinkDoctorByIdForm
                theme={t} clinicId={clinicId}
                onLinked={() => { setShowAssign(false); load() }}
              />
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
          onSaveProfile={(name, email) => updateStaffProfile(managingStaff.id, name, email)}
          onResetPassword={pw => resetStaffPassword(managingStaff.id, pw)}
        />
      )}
    </SafeAreaView>
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
      {error ? <Text style={{ fontSize: 12, color: '#FF5C5C', marginTop: 8 }}>{error}</Text> : null}
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
      {error ? <Text style={{ fontSize: 12, color: '#FF5C5C' }}>{error}</Text> : null}
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

        {error ? <Text style={{ fontSize: 12, color: '#FF5C5C', marginBottom: 8 }}>{error}</Text> : null}
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
            {error ? <Text style={{ fontSize: 12, color: '#FF5C5C', marginBottom: 8 }}>{error}</Text> : null}
            {success ? <Text style={{ fontSize: 12, color: t.accent, marginBottom: 8 }}>{success}</Text> : null}
            <TouchableOpacity onPress={saveProfile} disabled={saving}
              style={[s.saveBtn, { backgroundColor: saving ? `${t.accent}88` : t.accent }]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Save Profile</Text>}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Field theme={t} label="New password (min 8 characters)" value={password} onChange={setPassword} />
            {error ? <Text style={{ fontSize: 12, color: '#FF5C5C', marginBottom: 8 }}>{error}</Text> : null}
            {success ? <Text style={{ fontSize: 12, color: t.accent, marginBottom: 8 }}>{success}</Text> : null}
            <TouchableOpacity onPress={savePassword} disabled={saving}
              style={[s.saveBtn, { backgroundColor: saving ? `${t.accent}88` : t.accent }]}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>Update Password</Text>}
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity onPress={onRemove} style={{ marginTop: 16, alignItems: 'center' }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: '#FF5C5C' }}>Remove from clinic</Text>
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
