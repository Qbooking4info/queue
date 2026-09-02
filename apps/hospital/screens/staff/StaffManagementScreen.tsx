import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, TextInput,
  KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { getSpecialties, SpecialtyRow } from '@queue/shared/lib/api'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

interface StaffMember {
  id: string
  full_name: string
  email: string
  role: string
  clinic_name: string | null
  avatar_url: string | null
}

interface Doctor {
  id: string
  full_name: string
  title: string | null
  specialty_name: string | null
  availability_status: string
  email: string | null
}

const ROLE_LABEL: Record<string, string> = {
  admin: 'Hospital Admin', owner: 'Owner',
  front_desk: 'Front Desk', desk_officer: 'Front Desk',
  clinic_admin: 'Clinic Admin',
}

const AVAIL_META: Record<string, { label: string; color: string }> = {
  on_duty:  { label: 'On duty',  color: '#00C265' },
  on_break: { label: 'On break', color: '#EF9F27' },
  off_duty: { label: 'Off duty', color: '#7A9089' },
}

interface Props { navigation: any }

export function StaffManagementScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const [staff,      setStaff]      = useState<StaffMember[]>([])
  const [doctors,    setDoctors]    = useState<Doctor[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [tab,        setTab]        = useState<'staff' | 'doctors'>('staff')
  const [showInvite, setShowInvite] = useState(false)
  const [showLinkDoctor, setShowLinkDoctor] = useState(false)

  const hospitalId = staffProfile?.hospitalId

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) return
    if (!silent) setLoading(true)

    // Direct .from('hospital_admins')/.from('clinic_admins') reads used to be blocked
    // silently by RLS for anyone but the caller's own row (clinic_admins' SELECT policy
    // only allows reading your own row). get_hospital_staff_roster does its own staff
    // membership check and returns the full roster instead.
    const { data, error } = await supabase.rpc('get_hospital_staff_roster', { p_hospital_id: hospitalId })

    if (error) {
      setStaff([])
      setDoctors([])
      setLoading(false)
      setRefreshing(false)
      return
    }

    setStaff((data?.staff ?? []).map((r: any) => ({
      id: r.id, full_name: r.full_name, email: r.email, role: r.role,
      clinic_name: r.clinic_name, avatar_url: r.avatar_url,
    })))

    setDoctors((data?.doctors ?? []).map((d: any) => ({
      id: d.id, full_name: d.full_name, title: d.title,
      specialty_name: d.specialty_name,
      availability_status: d.availability_status ?? 'off_duty',
      email: d.email,
    })))

    setLoading(false)
    setRefreshing(false)
  }, [hospitalId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  function initials(name: string) {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  }

  return (
    <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        {/* Staff is pushed as its own stack screen above the tab bar (not a tab
            itself), so without this there is no way back to the dashboard at all --
            no native header, no tab bar, nothing but the browser's own back button,
            which doesn't sync with this in-memory navigation stack on web. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {navigation.canGoBack?.() ? (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
              <Ionicons name="arrow-back" size={22} color={t.textPrimary} />
            </TouchableOpacity>
          ) : null}
          <Text style={[s.title, { color: t.textPrimary }]}>Staff</Text>
        </View>
        {tab === 'staff' ? (
          <TouchableOpacity onPress={() => setShowInvite(true)} style={[s.inviteBtn, { backgroundColor: t.accent }]}>
            <Ionicons name="person-add-outline" size={14} color="#fff" />
            <Text style={s.inviteBtnText}>Invite</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={() => setShowLinkDoctor(true)} style={[s.inviteBtn, { backgroundColor: t.accent }]}>
            <Ionicons name="link-outline" size={14} color="#fff" />
            <Text style={s.inviteBtnText}>Link</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tabs */}
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
        {(['staff', 'doctors'] as const).map(tb => (
          <TouchableOpacity key={tb} onPress={() => setTab(tb)}
            style={[s.tab, { borderColor: tab === tb ? t.accent : t.cardBorder, backgroundColor: tab === tb ? `${t.accent}18` : t.cardBg }]}>
            <Text style={[s.tabText, { color: tab === tb ? t.accent : t.textMuted }]}>
              {tb === 'staff' ? `Admin/Front Desk (${staff.length})` : `Doctors (${doctors.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          {tab === 'staff' && (
            staff.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="people-outline" size={48} color={t.textMuted} style={{ opacity: 0.3, marginBottom: 12 }} />
                <Text style={[s.emptyTitle, { color: t.textPrimary }]}>No staff yet</Text>
                <Text style={[s.emptySub, { color: t.textMuted }]}>Invite your team to get started.</Text>
              </View>
            ) : staff.map(member => (
              <View key={member.id} style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <View style={[s.avatar, { backgroundColor: `${t.accent}20`, borderColor: `${t.accent}40` }]}>
                  <Text style={[s.avatarText, { color: t.accent }]}>{initials(member.full_name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.memberName, { color: t.textPrimary }]}>{member.full_name}</Text>
                  <Text style={[s.memberEmail, { color: t.textMuted }]}>{member.email}</Text>
                  {member.clinic_name && <Text style={[s.memberMeta, { color: t.textMuted }]}>{member.clinic_name}</Text>}
                </View>
                <View style={[s.roleBadge, { backgroundColor: `${t.accent}18`, borderColor: `${t.accent}30` }]}>
                  <Text style={[s.roleText, { color: t.accent }]}>{ROLE_LABEL[member.role] ?? member.role}</Text>
                </View>
              </View>
            ))
          )}

          {tab === 'doctors' && (
            doctors.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="medical-outline" size={48} color={t.textMuted} style={{ opacity: 0.3, marginBottom: 12 }} />
                <Text style={[s.emptyTitle, { color: t.textPrimary }]}>No doctors yet</Text>
                <Text style={[s.emptySub, { color: t.textMuted }]}>Tap Link above and enter a doctor's ID to add them.</Text>
              </View>
            ) : doctors.map(doc => {
              const avail = AVAIL_META[doc.availability_status] ?? AVAIL_META.off_duty
              return (
                <View key={doc.id} style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                  <View style={[s.avatar, { backgroundColor: `rgba(91,158,255,0.12)`, borderColor: `rgba(91,158,255,0.3)` }]}>
                    <Text style={[s.avatarText, { color: '#5B9EFF' }]}>{initials(doc.full_name)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.memberName, { color: t.textPrimary }]}>{[doc.title, doc.full_name].filter(Boolean).join(' ')}</Text>
                    {doc.specialty_name && <Text style={[s.memberMeta, { color: t.textMuted }]}>{doc.specialty_name}</Text>}
                    {doc.email && <Text style={[s.memberEmail, { color: t.textMuted }]}>{doc.email}</Text>}
                  </View>
                  <View style={[s.availBadge, { backgroundColor: `${avail.color}18` }]}>
                    <View style={[s.availDot, { backgroundColor: avail.color }]} />
                    <Text style={[s.availText, { color: avail.color }]}>{avail.label}</Text>
                  </View>
                </View>
              )
            })
          )}
        </ScrollView>
      )}

      {/* Invite modal */}
      {showInvite && <InviteModal hospitalId={hospitalId ?? ''} theme={t} onClose={() => setShowInvite(false)} onDone={() => { setShowInvite(false); load(true) }} />}

      {/* Link doctor modal */}
      {showLinkDoctor && <LinkDoctorModal theme={t} onClose={() => setShowLinkDoctor(false)} onDone={() => { setShowLinkDoctor(false); load(true) }} />}
    </SafeAreaView>
  )
}

function InviteModal({ hospitalId, theme: t, onClose, onDone }: { hospitalId: string; theme: any; onClose: () => void; onDone: () => void }) {
  const [email,    setEmail]    = useState('')
  const [role,     setRole]     = useState<'front_desk' | 'clinic_admin' | 'hospital_admin'>('front_desk')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)

  const ROLES = [
    { key: 'front_desk' as const,     label: 'Front Desk' },
    { key: 'clinic_admin' as const,   label: 'Clinic Admin' },
    { key: 'hospital_admin' as const, label: 'Hospital Admin' },
  ]

  async function handleInvite() {
    if (!email.trim()) { setError('Email is required.'); return }
    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not authenticated')
      const res = await fetch(`${API_URL}/api/clinic-staff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ email: email.trim().toLowerCase(), role, hospitalId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Invite failed')
      haptics.success()
      setDone(true)
    } catch (e) {
      haptics.error()
      setError(e instanceof Error ? e.message : 'Invite failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={[s.overlay]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.modal, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          {done ? (
            <>
              <Ionicons name="checkmark-circle" size={48} color="#00C265" style={{ alignSelf: 'center', marginBottom: 12 }} />
              <Text style={[s.modalTitle, { color: t.textPrimary, textAlign: 'center' }]}>Invite sent!</Text>
              <Text style={[s.modalSub, { color: t.textMuted, textAlign: 'center', marginBottom: 20 }]}>
                {email} will receive an invitation email.
              </Text>
              <TouchableOpacity onPress={onDone} style={[s.modalBtn, { backgroundColor: t.accent }]}>
                <Text style={s.modalBtnText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={[s.modalTitle, { color: t.textPrimary }]}>Invite staff member</Text>
                <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={t.textMuted} /></TouchableOpacity>
              </View>

              <Text style={[s.modalLabel, { color: t.textMuted }]}>EMAIL</Text>
              <View style={[s.modalInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                <TextInput value={email} onChangeText={setEmail}
                  placeholder="staff@hospital.com" placeholderTextColor={t.textMuted}
                  style={{ color: t.textPrimary, fontSize: 14 }}
                  keyboardType="email-address" autoCapitalize="none" autoFocus />
              </View>

              <Text style={[s.modalLabel, { color: t.textMuted, marginTop: 14 }]}>ROLE</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                {ROLES.map(r => (
                  <TouchableOpacity key={r.key} onPress={() => setRole(r.key)}
                    style={[s.roleChip, { borderColor: role === r.key ? t.accent : t.cardBorder, backgroundColor: role === r.key ? `${t.accent}18` : 'transparent' }]}>
                    <Text style={[s.roleChipText, { color: role === r.key ? t.accent : t.textMuted }]}>{r.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {error ? <Text style={[s.errorText, { color: '#FF5C5C' }]}>{error}</Text> : null}

              <TouchableOpacity onPress={handleInvite} disabled={loading}
                style={[s.modalBtn, { backgroundColor: loading ? `${t.accent}88` : t.accent }]}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnText}>Send Invite</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

// Doctor-linking, the mobile equivalent of web's "+ Add Doctor by ID"
// (web/src/components/dashboard/LinkDoctorModal.tsx). Every doctor is a real,
// self-registered account (see apps/doctor's DoctorRegisterScreen) -- this is
// the ONLY way to add one to a hospital, matching web exactly: no manual
// name+specialty form, just a 2-step ID lookup then confirm.
function LinkDoctorModal({ theme: t, onClose, onDone }: { theme: any; onClose: () => void; onDone: () => void }) {
  const [step,        setStep]        = useState<'code' | 'confirm'>('code')
  const [code,        setCode]        = useState('')
  const [fullName,    setFullName]    = useState('')
  const [alreadyLinked, setAlreadyLinked] = useState(false)
  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([])
  const [specialtyId, setSpecialtyId] = useState<string | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState('')
  const [done,        setDone]        = useState(false)

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
        method: 'POST',
        headers,
        body: JSON.stringify({ doctorCode: code.trim().toUpperCase(), specialtyId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Link failed')
      haptics.success()
      setDone(true)
    } catch (e) {
      haptics.error()
      setError(e instanceof Error ? e.message : 'Link failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={s.overlay}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.modal, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          {done ? (
            <>
              <Ionicons name="checkmark-circle" size={48} color="#00C265" style={{ alignSelf: 'center', marginBottom: 12 }} />
              <Text style={[s.modalTitle, { color: t.textPrimary, textAlign: 'center' }]}>Doctor linked!</Text>
              <Text style={[s.modalSub, { color: t.textMuted, textAlign: 'center', marginBottom: 20 }]}>
                {fullName} now appears in your hospital's doctor list.
              </Text>
              <TouchableOpacity onPress={onDone} style={[s.modalBtn, { backgroundColor: t.accent }]}>
                <Text style={s.modalBtnText}>Done</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={[s.modalTitle, { color: t.textPrimary }]}>Link Existing Doctor</Text>
                <TouchableOpacity onPress={onClose}><Ionicons name="close" size={22} color={t.textMuted} /></TouchableOpacity>
              </View>

              {step === 'code' ? (
                <>
                  <Text style={[s.modalLabel, { color: t.textMuted }]}>DOCTOR ID</Text>
                  <View style={[s.modalInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                    <TextInput value={code} onChangeText={v => setCode(v.toUpperCase())}
                      placeholder="e.g. K7M3QX" placeholderTextColor={t.textMuted}
                      style={{ color: t.textPrimary, fontSize: 20, fontWeight: '800', letterSpacing: 4, textAlign: 'center' }}
                      autoCapitalize="characters" maxLength={6} autoFocus />
                  </View>

                  {error ? <Text style={[s.errorText, { color: '#FF5C5C', marginTop: 10 }]}>{error}</Text> : null}

                  <TouchableOpacity onPress={handleLookUp} disabled={loading}
                    style={[s.modalBtn, { backgroundColor: loading ? `${t.accent}88` : t.accent, marginTop: 14 }]}>
                    {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnText}>Look Up</Text>}
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={{ fontSize: 13, color: t.textPrimary, marginBottom: 4 }}>
                    Found <Text style={{ fontWeight: '800' }}>{fullName}</Text>. Their profile (bio, qualifications,
                    experience, photo) transfers automatically — just choose the specialty they'll practise here.
                  </Text>
                  {alreadyLinked ? (
                    <Text style={{ fontSize: 12, color: '#EF9F27', marginBottom: 10 }}>
                      This doctor is already linked to your hospital.
                    </Text>
                  ) : null}

                  <Text style={[s.modalLabel, { color: t.textMuted, marginTop: 14 }]}>SPECIALTY</Text>
                  <ScrollView style={{ maxHeight: 180, marginBottom: 4 }} showsVerticalScrollIndicator={false}>
                    {specialties.map(sp => (
                      <TouchableOpacity key={sp.id} onPress={() => setSpecialtyId(sp.id)}
                        style={[s.specialtyRow, { borderColor: specialtyId === sp.id ? t.accent : t.cardBorder, backgroundColor: specialtyId === sp.id ? `${t.accent}18` : 'transparent' }]}>
                        <Text style={{ fontSize: 13, color: specialtyId === sp.id ? t.accent : t.textPrimary, fontWeight: specialtyId === sp.id ? '700' : '400' }}>{sp.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>

                  {error ? <Text style={[s.errorText, { color: '#FF5C5C' }]}>{error}</Text> : null}

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                    <TouchableOpacity onPress={() => { setStep('code'); setError('') }}
                      style={[s.modalBtn, { flex: 1, backgroundColor: 'transparent', borderWidth: 1, borderColor: t.cardBorder }]}>
                      <Text style={[s.modalBtnText, { color: t.textPrimary }]}>Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleConfirm} disabled={loading}
                      style={[s.modalBtn, { flex: 1, backgroundColor: loading ? `${t.accent}88` : t.accent }]}>
                      {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnText}>Confirm & Link</Text>}
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const s = StyleSheet.create({
  safe:       { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title:      { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  inviteBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  inviteBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  tab:        { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  tabText:    { fontSize: 11, fontWeight: '700' },
  card:       { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  avatar:     { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800' },
  memberName: { fontSize: 14, fontWeight: '700' },
  memberEmail: { fontSize: 11, marginTop: 2 },
  memberMeta: { fontSize: 11, marginTop: 1 },
  roleBadge:  { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 99, borderWidth: 1 },
  roleText:   { fontSize: 10, fontWeight: '700' },
  availBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 99 },
  availDot:   { width: 6, height: 6, borderRadius: 3 },
  availText:  { fontSize: 10, fontWeight: '700' },
  empty:      { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptySub:   { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  // Modal
  overlay:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  modalSub:   { fontSize: 13, lineHeight: 20 },
  modalLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  modalInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4 },
  roleChip:   { flex: 1, borderRadius: 10, borderWidth: 1, paddingVertical: 8, alignItems: 'center' },
  roleChipText: { fontSize: 11, fontWeight: '700' },
  specialtyRow: { borderRadius: 10, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6 },
  modalBtn:   { borderRadius: 12, padding: 14, alignItems: 'center' },
  modalBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  errorText:  { fontSize: 12, marginBottom: 8 },
})
