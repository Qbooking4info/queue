import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput,
  KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { Alert }    from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

interface ClinicWithAdmin {
  id: string
  name: string
  description: string | null
  is_active: boolean | null
  is_emergency: boolean
  service_tags: string[]
  subAdmin: { id: string; full_name: string; email: string } | null
  doctorCount: number
}

interface Props { navigation: any }

export function HospitalClinicsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const [clinics,    setClinics]    = useState<ClinicWithAdmin[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [busyId,     setBusyId]     = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const hospitalId = staffProfile?.hospitalId

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const jwt = session?.access_token
    if (!jwt) throw new Error('Not authenticated')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }
  }

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) return
    if (!silent) setLoading(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/clinics?hospitalId=${hospitalId}`, { headers })
      const body = await res.json()
      setClinics(res.ok ? body : [])
    } catch {
      setClinics([])
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [hospitalId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function toggleActive(clinic: ClinicWithAdmin) {
    setBusyId(clinic.id)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/clinics/${clinic.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ action: 'toggle_active', is_active: !clinic.is_active }),
      })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to update')
      haptics.success()
      await load(true)
    } catch (e) {
      haptics.error()
      Alert.alert(e instanceof Error ? e.message : 'Failed to update')
    } finally {
      setBusyId(null)
    }
  }

  async function handleDelete(clinicId: string) {
    setConfirmDeleteId(null)
    setBusyId(clinicId)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/clinics/${clinicId}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to delete')
      haptics.success()
      await load(true)
    } catch (e) {
      haptics.error()
      Alert.alert(e instanceof Error ? e.message : 'Failed to delete')
    } finally {
      setBusyId(null)
    }
  }

  function initials(name: string) {
    return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
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
          <Text style={[s.title, { color: t.textPrimary }]}>Clinics</Text>
        </View>
        <TouchableOpacity onPress={() => setShowCreate(true)} style={[s.addBtn, { backgroundColor: t.accent }]}>
          <Ionicons name="add" size={16} color="#fff" />
          <Text style={s.addBtnText}>New Clinic</Text>
        </TouchableOpacity>
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
          {clinics.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="business-outline" size={48} color={t.textMuted} style={{ opacity: 0.3, marginBottom: 12 }} />
              <Text style={[s.emptyTitle, { color: t.textPrimary }]}>No clinics set up yet</Text>
              <TouchableOpacity onPress={() => setShowCreate(true)} style={[s.emptyBtn, { borderColor: t.accent }]}>
                <Text style={[s.emptyBtnText, { color: t.accent }]}>+ Create First Clinic</Text>
              </TouchableOpacity>
            </View>
          ) : clinics.map(clinic => (
            <View key={clinic.id} style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <TouchableOpacity
                onPress={() => navigation.navigate('HospitalClinicDetail', { clinicId: clinic.id })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                <View style={[s.avatar, { backgroundColor: `${t.accent}20`, borderColor: `${t.accent}40` }]}>
                  <Text style={[s.avatarText, { color: t.accent }]}>{initials(clinic.name)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.clinicName, { color: t.textPrimary }]}>{clinic.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                    <View style={[s.badge, { backgroundColor: clinic.is_active ? 'rgba(0,194,101,0.14)' : 'rgba(122,144,137,0.14)' }]}>
                      <Text style={[s.badgeText, { color: clinic.is_active ? '#00C265' : t.textMuted }]}>{clinic.is_active ? 'Active' : 'Inactive'}</Text>
                    </View>
                    {clinic.is_emergency && (
                      <View style={[s.badge, { backgroundColor: 'rgba(255,92,92,0.14)' }]}>
                        <Text style={[s.badgeText, { color: '#FF5C5C' }]}>Emergency Dept</Text>
                      </View>
                    )}
                    <View style={[s.badge, { backgroundColor: `${t.accent}14` }]}>
                      <Text style={[s.badgeText, { color: t.accent }]}>{clinic.doctorCount} doctor{clinic.doctorCount === 1 ? '' : 's'}</Text>
                    </View>
                  </View>
                  {clinic.subAdmin && (
                    <Text style={[s.subAdminText, { color: t.textMuted }]}>Admin: {clinic.subAdmin.full_name}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.textMuted} />
              </TouchableOpacity>

              <View style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: t.cardBorder, paddingTop: 10 }}>
                <TouchableOpacity onPress={() => toggleActive(clinic)} disabled={busyId === clinic.id}
                  style={[s.smallBtn, { borderColor: t.cardBorder, flex: 1 }]}>
                  {busyId === clinic.id ? <ActivityIndicator size="small" color={t.textMuted} /> : (
                    <Text style={[s.smallBtnText, { color: t.textPrimary }]}>{clinic.is_active ? 'Deactivate' : 'Reactivate'}</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setConfirmDeleteId(clinic.id)} disabled={busyId === clinic.id}
                  style={[s.smallBtn, { borderColor: 'rgba(255,92,92,0.3)', flex: 1 }]}>
                  <Text style={[s.smallBtnText, { color: '#FF5C5C' }]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {showCreate && (
        <CreateClinicModal
          hospitalId={hospitalId ?? ''} theme={t}
          onClose={() => setShowCreate(false)}
          onDone={() => { setShowCreate(false); load(true) }}
        />
      )}

      {confirmDeleteId && (
        <View style={s.overlay}>
          <View style={[s.confirmCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Ionicons name="warning-outline" size={32} color="#FF5C5C" style={{ marginBottom: 10 }} />
            <Text style={[s.modalTitle, { color: t.textPrimary }]}>Delete this clinic?</Text>
            <Text style={{ fontSize: 13, color: t.textMuted, marginTop: 6, marginBottom: 18, lineHeight: 19 }}>
              Doctors assigned to this clinic will remain in the hospital pool — this only removes the clinic itself.
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity onPress={() => setConfirmDeleteId(null)} style={[s.smallBtn, { flex: 1, borderColor: t.cardBorder }]}>
                <Text style={[s.smallBtnText, { color: t.textPrimary }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(confirmDeleteId)} style={[s.smallBtn, { flex: 1, backgroundColor: '#FF5C5C' }]}>
                <Text style={[s.smallBtnText, { color: '#fff' }]}>Yes, Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  )
}

const COMMON_TAGS = ['General', 'Emergency', 'Surgery', 'Maternity', 'Pediatrics', 'Dental', 'Lab', 'Pharmacy', 'Imaging']

function CreateClinicModal({ hospitalId, theme: t, onClose, onDone }: { hospitalId: string; theme: any; onClose: () => void; onDone: () => void }) {
  const [name,       setName]       = useState('')
  const [tags,       setTags]       = useState<string[]>([])
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState('')

  function toggleTag(tag: string) {
    setTags(ts => ts.includes(tag) ? ts.filter(x => x !== tag) : [...ts, tag])
  }

  async function handleCreate() {
    if (!name.trim()) { setError('Clinic name is required.'); return }
    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not authenticated')
      const res = await fetch(`${API_URL}/api/clinics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ hospitalId, clinicName: name.trim(), serviceTags: tags }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Failed to create clinic')
      haptics.success()
      onDone()
    } catch (e) {
      haptics.error()
      setError(e instanceof Error ? e.message : 'Failed to create clinic')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={s.overlay}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.modal, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Text style={[s.modalTitle, { color: t.textPrimary }]}>New Clinic</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={8}><Ionicons name="close" size={22} color={t.textMuted} /></TouchableOpacity>
          </View>

          <Text style={[s.modalLabel, { color: t.textMuted }]}>CLINIC NAME</Text>
          <View style={[s.modalInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
            <TextInput value={name} onChangeText={setName}
              placeholder="e.g. Paediatrics" placeholderTextColor={t.textMuted}
              style={{ color: t.textPrimary, fontSize: 14 }} autoFocus />
          </View>

          <Text style={[s.modalLabel, { color: t.textMuted, marginTop: 14 }]}>SERVICES OFFERED (OPTIONAL)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
            {COMMON_TAGS.map(tag => (
              <TouchableOpacity key={tag} onPress={() => toggleTag(tag)}
                style={[s.tagChip, { borderColor: tags.includes(tag) ? t.accent : t.cardBorder, backgroundColor: tags.includes(tag) ? `${t.accent}18` : 'transparent' }]}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: tags.includes(tag) ? t.accent : t.textMuted }}>{tag}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {error ? <Text style={[s.errorText, { color: '#FF5C5C' }]}>{error}</Text> : null}

          <TouchableOpacity onPress={handleCreate} disabled={loading}
            style={[s.smallBtn, { backgroundColor: loading ? `${t.accent}88` : t.accent, paddingVertical: 14 }]}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={[s.smallBtnText, { color: '#fff', fontSize: 15 }]}>Create Clinic</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  )
}

const s = StyleSheet.create({
  safe:       { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title:      { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  card:       { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  avatar:     { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 16, fontWeight: '800' },
  clinicName: { fontSize: 15, fontWeight: '700' },
  badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  badgeText:  { fontSize: 10, fontWeight: '700' },
  subAdminText: { fontSize: 11, marginTop: 4 },
  smallBtn:   { borderRadius: 10, borderWidth: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { fontSize: 12, fontWeight: '700' },
  empty:      { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  emptyBtn:   { marginTop: 10, borderRadius: 10, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  emptyBtnText: { fontSize: 13, fontWeight: '700' },
  // Modals
  overlay:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 24, paddingBottom: 40 },
  confirmCard:{ margin: 20, borderRadius: 20, borderWidth: 1, padding: 22, alignSelf: 'center', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  modalLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  modalInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4 },
  tagChip:    { borderRadius: 99, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  errorText:  { fontSize: 12, marginBottom: 8 },
})
