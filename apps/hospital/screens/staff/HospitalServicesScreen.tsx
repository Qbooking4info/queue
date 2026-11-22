import { useState, useCallback } from 'react'
import { View, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Switch, KeyboardAvoidingView, Platform } from 'react-native'
import { Text, TextInput } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import {
  Screen, AppBar, Body, Card, Row, Hair, Seg, Btn, BottomBar, Empty, IconBtn, Mono,
} from '@queue/shared/components/q'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { Alert }    from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { getSpecialties, SpecialtyRow } from '@queue/shared/lib/api'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

interface Service {
  id: string; name: string; description: string | null
  specialty_id: string | null; specialty_name: string | null
  base_price: number | null; virtual_price: number | null
  duration_mins: number | null; is_active: boolean; clinic_id: string | null
}
interface RegisteredSpecialty { id: string; name: string; icon: string | null; slug: string }

interface Props { navigation: any }

export function HospitalServicesScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const [tab, setTab] = useState<'services' | 'specialties'>('services')
  const [services,   setServices]   = useState<Service[]>([])
  const [registered, setRegistered] = useState<RegisteredSpecialty[]>([])
  const [allSpecialties, setAllSpecialties] = useState<SpecialtyRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editing,    setEditing]    = useState<Service | 'new' | null>(null)
  const [addingSpecialty, setAddingSpecialty] = useState(false)
  const [confirmRemoveSpecialty, setConfirmRemoveSpecialty] = useState<RegisteredSpecialty | null>(null)
  const [confirmDeleteService, setConfirmDeleteService] = useState<Service | null>(null)
  const [busy, setBusy] = useState(false)

  const hospitalId = staffProfile?.hospitalId

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    const jwt = session?.access_token
    if (!jwt) throw new Error('Not authenticated')
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }
  }

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/services`, { headers })
      const body = await res.json()
      if (res.ok) {
        setServices(body.services ?? [])
        setRegistered(body.registeredSpecialties ?? [])
      }
      if (allSpecialties.length === 0) setAllSpecialties(await getSpecialties())
    } catch {
      setServices([]); setRegistered([])
    } finally {
      setLoading(false); setRefreshing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function toggleServiceActive(svc: Service) {
    setBusy(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/services/${svc.id}`, { method: 'PATCH', headers, body: JSON.stringify({ is_active: !svc.is_active }) })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to update')
      await load(true)
    } catch (e) {
      haptics.error(); Alert.alert(e instanceof Error ? e.message : 'Failed to update')
    } finally { setBusy(false) }
  }

  async function deleteService(id: string) {
    setConfirmDeleteService(null); setBusy(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/services/${id}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to delete')
      haptics.success(); await load(true)
    } catch (e) {
      haptics.error(); Alert.alert(e instanceof Error ? e.message : 'Failed to delete')
    } finally { setBusy(false) }
  }

  async function removeSpecialty(specialtyId: string) {
    setConfirmRemoveSpecialty(null); setBusy(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/hospitals/${hospitalId}/specialties/${specialtyId}`, { method: 'DELETE', headers })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to remove')
      haptics.success(); await load(true)
    } catch (e) {
      haptics.error(); Alert.alert(e instanceof Error ? e.message : 'Failed to remove')
    } finally { setBusy(false) }
  }

  async function addSpecialty(specialtyId: string) {
    setBusy(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${API_URL}/api/hospitals/${hospitalId}/specialties`, { method: 'POST', headers, body: JSON.stringify({ specialtyId }) })
      if (!res.ok) throw new Error((await res.json())?.error ?? 'Failed to add')
      haptics.success()
      setAddingSpecialty(false)
      await load(true)
    } catch (e) {
      haptics.error(); Alert.alert(e instanceof Error ? e.message : 'Failed to add')
    } finally { setBusy(false) }
  }

  return (
    <Screen>
      <AppBar
        title="Services & prices"
        sub="What you offer and what it costs"
        onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined}
        right={
          <IconBtn
            name="add"
            label={tab === 'services' ? 'Add service' : 'Add specialty'}
            onPress={() => tab === 'services' ? setEditing('new') : setAddingSpecialty(true)}
          />
        }
      />

      <Seg<'services' | 'specialties'>
        value={tab} onChange={setTab}
        options={[
          { key: 'services', label: `Services · ${services.length}` },
          { key: 'specialties', label: `Specialties · ${registered.length}` },
        ]}
      />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      ) : (
        <Body refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }}
            tintColor={t.q.primary} colors={[t.q.primary]} />
        }>
          {tab === 'services' ? (
            services.length === 0 ? (
              <Card style={{ marginTop: 12 }}>
                <Empty
                  icon="medkit-outline"
                  title="No services yet"
                  body="A service is something a patient books and pays for — a consultation, a scan, a dental check."
                  action="Add the first one"
                  onAction={() => setEditing('new')}
                />
              </Card>
            ) : (
              <Card>
                {services.map((svc, i) => (
                  <View key={svc.id}>
                    {i > 0 && <Hair />}
                    <Row
                      icon="medkit-outline"
                      iconTone={svc.is_active ? 'teal' : 'neutral'}
                      dim={!svc.is_active}
                      title={svc.name}
                      sub={[
                        svc.specialty_name,
                        svc.duration_mins != null ? `${svc.duration_mins} min` : null,
                        svc.description,
                      ].filter(Boolean).join(' · ')}
                      right={
                        <View style={{ alignItems: 'flex-end', gap: 2 }}>
                          {svc.base_price != null && (
                            <Mono size={13} weight="700">₦{svc.base_price.toLocaleString('en-NG')}</Mono>
                          )}
                          {svc.virtual_price != null && (
                            <Mono size={11} color={t.q.ink60}>video ₦{svc.virtual_price.toLocaleString('en-NG')}</Mono>
                          )}
                        </View>
                      }
                    />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 12 }}>
                      <Btn label="Edit" variant="secondary" small onPress={() => setEditing(svc)} />
                      <Btn label="Delete" variant="ghost" small onPress={() => setConfirmDeleteService(svc)} />
                      <View style={{ flex: 1 }} />
                      <Text style={{ fontSize: 12, color: t.q.ink60 }}>
                        {svc.is_active ? 'Bookable' : 'Hidden'}
                      </Text>
                      <Switch
                        value={svc.is_active}
                        onValueChange={() => toggleServiceActive(svc)}
                        disabled={busy}
                        accessibilityLabel={`${svc.name} bookable`}
                        trackColor={{ true: t.q.primary, false: t.q.line }}
                        thumbColor="#FFFFFF"
                      />
                    </View>
                  </View>
                ))}
              </Card>
            )
          ) : (
            registered.length === 0 ? (
              <Card style={{ marginTop: 12 }}>
                <Empty
                  icon="ribbon-outline"
                  title="No specialties registered"
                  body="Specialties are what patients filter by when they search for care."
                  action="Add a specialty"
                  onAction={() => setAddingSpecialty(true)}
                />
              </Card>
            ) : (
              <Card>
                {registered.map((sp, i) => (
                  <View key={sp.id}>
                    {i > 0 && <Hair />}
                    <Row
                      icon="medical-outline"
                      title={sp.name}
                      right={
                        <Btn label="Remove" variant="ghost" small disabled={busy}
                          onPress={() => setConfirmRemoveSpecialty(sp)} />
                      }
                    />
                  </View>
                ))}
              </Card>
            )
          )}
        </Body>
      )}

      <BottomBar>
        <Btn
          grow
          label={tab === 'services' ? 'Add service' : 'Add specialty'}
          icon="add"
          onPress={() => tab === 'services' ? setEditing('new') : setAddingSpecialty(true)}
        />
      </BottomBar>

      {editing && (
        <ServiceModal
          theme={t} service={editing === 'new' ? null : editing}
          specialties={allSpecialties}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); load(true) }}
        />
      )}

      {addingSpecialty && (
        <View style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
        }}>
          <View style={{
            backgroundColor: t.q.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
            paddingTop: 16, paddingBottom: 28, maxHeight: '80%',
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: t.q.ink }}>Add a specialty</Text>
              <IconBtn name="close" label="Close" onPress={() => setAddingSpecialty(false)} />
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              <Card>
                {allSpecialties.filter(sp => !registered.some(r => r.id === sp.id)).map((sp, i) => (
                  <View key={sp.id}>
                    {i > 0 && <Hair />}
                    <Row
                      icon="medical-outline"
                      title={sp.name}
                      right={<Text style={{ fontSize: 13, fontWeight: '700', color: t.q.primary }}>Add</Text>}
                      onPress={busy ? undefined : () => addSpecialty(sp.id)}
                    />
                  </View>
                ))}
              </Card>
            </ScrollView>
          </View>
        </View>
      )}

      {confirmRemoveSpecialty && (
        <ConfirmDialog theme={t} title="Remove this specialty?"
          message={`${confirmRemoveSpecialty.name} will no longer show on your hospital for patients searching by specialty.`}
          confirmLabel="Remove" onCancel={() => setConfirmRemoveSpecialty(null)}
          onConfirm={() => removeSpecialty(confirmRemoveSpecialty.id)} />
      )}

      {confirmDeleteService && (
        <ConfirmDialog theme={t} title="Delete this service?"
          message={`"${confirmDeleteService.name}" will stop being bookable. This cannot be undone.`}
          confirmLabel="Delete" onCancel={() => setConfirmDeleteService(null)}
          onConfirm={() => deleteService(confirmDeleteService.id)} />
      )}
    </Screen>
  )
}

function ConfirmDialog({ theme: t, title, message, confirmLabel, onCancel, onConfirm }: {
  theme: any; title: string; message: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void
}) {
  return (
    <View style={s.overlay}>
      <View style={[s.confirmCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
        <Ionicons name="warning-outline" size={32} color={t.danger} style={{ marginBottom: 10 }} />
        <Text style={[s.modalTitle, { color: t.textPrimary }]}>{title}</Text>
        <Text style={{ fontSize: 13, color: t.textMuted, marginTop: 6, marginBottom: 18, lineHeight: 19 }}>{message}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={onCancel} style={[s.smallBtn, { flex: 1, borderColor: t.cardBorder }]}>
            <Text style={[s.smallBtnText, { color: t.textPrimary }]}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onConfirm} style={[s.smallBtn, { flex: 1, backgroundColor: t.danger }]}>
            <Text style={[s.smallBtnText, { color: '#fff' }]}>{confirmLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

function ServiceModal({ theme: t, service, specialties, onClose, onDone }: {
  theme: any; service: { id: string; name: string; description: string | null; specialty_id: string | null; base_price: number | null; virtual_price: number | null; duration_mins: number | null } | null
  specialties: SpecialtyRow[]; onClose: () => void; onDone: () => void
}) {
  const [name, setName] = useState(service?.name ?? '')
  const [specialtyId, setSpecialtyId] = useState<string | null>(service?.specialty_id ?? null)
  const [description, setDescription] = useState(service?.description ?? '')
  const [basePrice, setBasePrice] = useState(service?.base_price != null ? String(service.base_price) : '')
  const [virtualPrice, setVirtualPrice] = useState(service?.virtual_price != null ? String(service.virtual_price) : '')
  const [duration, setDuration] = useState(service?.duration_mins != null ? String(service.duration_mins) : '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    if (!name.trim()) { setError('Service name is required.'); return }
    setLoading(true); setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not authenticated')
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` }
      const payload = {
        name: name.trim(), description: description.trim() || null, specialty_id: specialtyId,
        base_price: basePrice.trim() ? Number(basePrice) : null,
        virtual_price: virtualPrice.trim() ? Number(virtualPrice) : null,
        duration_mins: duration.trim() ? Number(duration) : null,
      }
      const res = service
        ? await fetch(`${API_URL}/api/services/${service.id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) })
        : await fetch(`${API_URL}/api/services`, { method: 'POST', headers, body: JSON.stringify(payload) })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'Failed to save')
      haptics.success()
      onDone()
    } catch (e) {
      haptics.error()
      setError(e instanceof Error ? e.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={s.overlay}>
      <KeyboardAvoidingView behavior="padding">
        <View style={[s.modal, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={[s.modalTitle, { color: t.textPrimary }]}>{service ? 'Edit Service' : 'Add Service'}</Text>
              <TouchableOpacity onPress={onClose} accessibilityLabel="Close" hitSlop={8}><Ionicons name="close" size={22} color={t.textMuted} /></TouchableOpacity>
            </View>

            <Text style={[s.modalLabel, { color: t.textMuted }]}>SERVICE NAME</Text>
            <View style={[s.modalInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
              <TextInput value={name} onChangeText={setName} placeholder="e.g. General Consultation" placeholderTextColor={t.textMuted} style={{ color: t.textPrimary, fontSize: 14 }} autoFocus />
            </View>

            <Text style={[s.modalLabel, { color: t.textMuted, marginTop: 12 }]}>SPECIALTY</Text>
            <ScrollView style={{ maxHeight: 120, marginBottom: 4 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity onPress={() => setSpecialtyId(null)}
                style={[s.specialtyRow, { borderColor: specialtyId === null ? t.accent : t.cardBorder, backgroundColor: specialtyId === null ? `${t.accent}18` : 'transparent' }]}>
                <Text style={{ fontSize: 12, color: specialtyId === null ? t.accent : t.textMuted }}>— No specialty —</Text>
              </TouchableOpacity>
              {specialties.map(sp => (
                <TouchableOpacity key={sp.id} onPress={() => setSpecialtyId(sp.id)}
                  style={[s.specialtyRow, { borderColor: specialtyId === sp.id ? t.accent : t.cardBorder, backgroundColor: specialtyId === sp.id ? `${t.accent}18` : 'transparent' }]}>
                  <Text style={{ fontSize: 12, color: specialtyId === sp.id ? t.accent : t.textPrimary }}>{sp.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={[s.modalLabel, { color: t.textMuted, marginTop: 10 }]}>DESCRIPTION</Text>
            <View style={[s.modalInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
              <TextInput value={description} onChangeText={setDescription} multiline placeholder="Optional" placeholderTextColor={t.textMuted} style={{ color: t.textPrimary, fontSize: 13, minHeight: 40 }} />
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[s.modalLabel, { color: t.textMuted }]}>IN-PERSON ₦</Text>
                <View style={[s.modalInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                  <TextInput value={basePrice} onChangeText={setBasePrice} keyboardType="number-pad" placeholderTextColor={t.textMuted} style={{ color: t.textPrimary, fontSize: 13 }} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.modalLabel, { color: t.textMuted }]}>VIRTUAL ₦</Text>
                <View style={[s.modalInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                  <TextInput value={virtualPrice} onChangeText={setVirtualPrice} keyboardType="number-pad" placeholderTextColor={t.textMuted} style={{ color: t.textPrimary, fontSize: 13 }} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.modalLabel, { color: t.textMuted }]}>MINS</Text>
                <View style={[s.modalInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                  <TextInput value={duration} onChangeText={setDuration} keyboardType="number-pad" placeholderTextColor={t.textMuted} style={{ color: t.textPrimary, fontSize: 13 }} />
                </View>
              </View>
            </View>

            {error ? <Text style={[s.errorText, { color: t.danger, marginTop: 10 }]}>{error}</Text> : null}

            <TouchableOpacity onPress={handleSave} disabled={loading}
              style={[s.smallBtn, { backgroundColor: loading ? `${t.accent}88` : t.accent, paddingVertical: 14, marginTop: 14 }]}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={[s.smallBtnText, { color: '#fff', fontSize: 15 }]}>{service ? 'Save Changes' : 'Add Service'}</Text>}
            </TouchableOpacity>
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
  addBtn:     { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  addBtnText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  tab:        { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  tabText:    { fontSize: 11, fontWeight: '700' },
  card:       { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  svcName:    { fontSize: 14, fontWeight: '700' },
  badge:      { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 },
  badgeText:  { fontSize: 10, fontWeight: '700' },
  smallBtn:   { borderRadius: 10, borderWidth: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center' },
  smallBtnText: { fontSize: 12, fontWeight: '700' },
  doctorRow:  { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  empty:      { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  overlay:    { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal:      { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 24, paddingBottom: 40 },
  confirmCard:{ margin: 20, borderRadius: 20, borderWidth: 1, padding: 22, alignSelf: 'center', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  modalLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  modalInput: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 4 },
  specialtyRow: { borderRadius: 10, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 12, marginBottom: 6 },
  errorText:  { fontSize: 12 },
})
