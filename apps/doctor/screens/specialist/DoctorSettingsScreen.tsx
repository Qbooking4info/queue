import { useState, useCallback } from 'react'
import {
  View, Switch, ActivityIndicator, Linking, Modal, ScrollView, Pressable,
  KeyboardAvoidingView, Platform,
} from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import {
  getDoctorProfileSettings, updateDoctorProfileSettings, DoctorProfileSettings,
  getQualificationDocuments, uploadQualificationDocument, deleteQualificationDocument, QualificationDocument,
  getSpecialties, SpecialtyRow,
} from '@queue/shared/lib/api'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Field, Btn, BottomBar,
  Empty, IconBtn, Seg,
} from '@queue/shared/components/q'

interface Props { navigation: { goBack: () => void; canGoBack?: () => boolean; navigate: (name: string) => void } }

const DEFAULTS: DoctorProfileSettings = {
  title: null, specialty_id: null, level: null, bio: null, qualification: null, years_experience: null,
  virtual_fee: null, home_visit_fee: null,
  accepts_direct_virtual: false, accepts_direct_home_visit: false, show_phone_to_patients: false,
}

export function DoctorSettingsScreen({ navigation }: Props) {
  const { theme: t, mode, toggleTheme } = useTheme()
  const { signOut } = useAuth()
  const [form, setForm] = useState<DoctorProfileSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [docs, setDocs] = useState<QualificationDocument[]>([])
  const [uploading, setUploading] = useState(false)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [specialties, setSpecialties] = useState<SpecialtyRow[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const [profile, documents, specialtyList] = await Promise.all([
      getDoctorProfileSettings(), getQualificationDocuments(), getSpecialties(),
    ])
    if (profile) setForm({ ...DEFAULTS, ...profile })
    setDocs(documents)
    setSpecialties(specialtyList)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  function set<K extends keyof DoctorProfileSettings>(key: K, value: DoctorProfileSettings[K]) {
    setForm(f => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    const err = await updateDoctorProfileSettings(form)
    setSaving(false)
    if (err) { haptics.error(); return }
    haptics.success()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleUpload() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
      copyToCacheDirectory: true,
    })
    if (result.canceled || !result.assets?.[0]) return
    const asset = result.assets[0]
    const title = asset.name?.replace(/\.[^/.]+$/, '') || 'Document'

    setUploading(true)
    const err = await uploadQualificationDocument(title, asset.uri, asset.name ?? 'document', asset.mimeType ?? 'application/octet-stream')
    setUploading(false)
    if (err) { haptics.error(); return }
    haptics.success()
    load()
  }

  async function handleDelete(id: string) {
    haptics.tap()
    await deleteQualificationDocument(id)
    load()
  }

  if (loading) {
    return (
      <Screen>
        <AppBar title="Settings & fees" onBack={navigation.canGoBack?.() ? () => navigation.goBack() : undefined} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      </Screen>
    )
  }

  const specialtyName = specialties.find(s => s.id === form.specialty_id)?.name

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppBar title="Settings & fees" sub="What patients see when they book you directly"
          onBack={navigation.canGoBack?.() ? () => navigation.goBack() : undefined} />

        <Body>
          <SectionHead title="Direct bookings" />
          <Card style={{ marginTop: 0 }}>
            <ToggleRow label="Accept virtual consults" sub="Patients can book a video call with you directly"
              value={!!form.accepts_direct_virtual} onToggle={v => set('accepts_direct_virtual', v)} theme={t} />
            {form.accepts_direct_virtual && (
              <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
                <Field label="Virtual consultation fee (₦)" keyboardType="number-pad"
                  value={form.virtual_fee?.toString() ?? ''}
                  onChangeText={v => set('virtual_fee', v ? Number(v.replace(/\D/g, '')) : null)}
                  placeholder="e.g. 6000" />
              </View>
            )}
            <ToggleRow label="Accept home visits" sub="Patients can ask you to visit their home"
              value={!!form.accepts_direct_home_visit} onToggle={v => set('accepts_direct_home_visit', v)} theme={t} />
            {form.accepts_direct_home_visit && (
              <View style={{ paddingHorizontal: 14, paddingBottom: 12 }}>
                <Field label="Home visit fee (₦)" keyboardType="number-pad"
                  value={form.home_visit_fee?.toString() ?? ''}
                  onChangeText={v => set('home_visit_fee', v ? Number(v.replace(/\D/g, '')) : null)}
                  placeholder="e.g. 20000" />
              </View>
            )}
            <ToggleRow label="Show my phone number to patients"
              sub="Otherwise it is only visible once they have booked you"
              value={!!form.show_phone_to_patients} onToggle={v => set('show_phone_to_patients', v)} theme={t} last />
          </Card>

          <SectionHead title="Public profile" />
          <Card>
            <View style={{ padding: 14, gap: 14 }}>
              <Field label="Title" value={form.title ?? ''} onChangeText={v => set('title', v || null)} placeholder="e.g. Dr." />

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12.5, fontWeight: '600', color: t.q.ink70 }}>Medical specialty</Text>
                <Pressable
                  onPress={() => { haptics.tap(); setPickerOpen(true) }}
                  accessibilityRole="button"
                  accessibilityLabel={`Medical specialty: ${specialtyName ?? 'not chosen'}`}
                  style={{
                    minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: t.q.line,
                    backgroundColor: t.q.field, paddingHorizontal: 14,
                    flexDirection: 'row', alignItems: 'center', gap: 10,
                  }}>
                  <Text style={{ flex: 1, fontSize: 15, color: specialtyName ? t.q.ink : t.q.ink60 }}>
                    {specialtyName ?? 'Choose your specialty'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={t.q.ink60} />
                </Pressable>
              </View>

              <Field label="Level / cadre" value={form.level ?? ''} onChangeText={v => set('level', v || null)}
                placeholder="e.g. Consultant, Senior Registrar, MO" />
              <Field label="Qualifications" value={form.qualification ?? ''} onChangeText={v => set('qualification', v || null)}
                placeholder="e.g. MBBS, FWACS" />
              <Field label="Years of experience" keyboardType="number-pad"
                value={form.years_experience?.toString() ?? ''}
                onChangeText={v => set('years_experience', v ? Number(v.replace(/\D/g, '')) : null)}
                placeholder="e.g. 8" />
              <Field label="Bio" value={form.bio ?? ''} onChangeText={v => set('bio', v || null)}
                placeholder="A short bio patients will see" multiline
                style={{ minHeight: 96, textAlignVertical: 'top' }} />
            </View>
          </Card>

          <SectionHead title="Qualification documents" />
          <Card>
            {docs.length === 0 ? (
              <Empty icon="document-text-outline" title="Nothing uploaded yet"
                body="Upload certificates or licences so patients can see your credentials are real." />
            ) : docs.map((d, i) => (
              <View key={d.id}>
                {i > 0 && <Hair />}
                <Row
                  compact icon="document-text-outline" iconTone="teal"
                  title={d.title}
                  onPress={d.url ? () => Linking.openURL(d.url as string) : undefined}
                  right={<IconBtn name="trash-outline" label={`Delete ${d.title}`} color={t.q.red}
                    onPress={() => handleDelete(d.id)} />} />
              </View>
            ))}
            <Hair />
            <View style={{ padding: 14 }}>
              <Btn label="Upload document" variant="secondary" icon="cloud-upload-outline"
                loading={uploading} onPress={handleUpload} />
              <Text style={{ fontSize: 11.5, color: t.q.ink60, marginTop: 8, textAlign: 'center' }}>
                PDF, JPG or PNG · up to 10 MB
              </Text>
            </View>
          </Card>

          <SectionHead title="Appearance" />
          <Seg<'light' | 'dark'>
            value={mode === 'dark' ? 'dark' : 'light'}
            onChange={v => { if (v !== (mode === 'dark' ? 'dark' : 'light')) toggleTheme() }}
            options={[{ key: 'light', label: 'Light' }, { key: 'dark', label: 'Dark' }]} />

          <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
            {confirmSignOut ? (
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Btn grow label="Cancel" variant="secondary" onPress={() => setConfirmSignOut(false)} />
                <Btn grow label="Confirm sign out" variant="danger" onPress={() => { void signOut() }} />
              </View>
            ) : (
              <Btn label="Sign out" variant="danger" onPress={() => { haptics.tap(); setConfirmSignOut(true) }} />
            )}
          </View>
        </Body>

        <BottomBar>
          <Btn grow label={saved ? 'Saved' : 'Save settings'} icon={saved ? 'checkmark' : undefined}
            loading={saving} onPress={save} />
        </BottomBar>
      </Screen>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: t.q.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
              <Text accessibilityRole="header" style={{ flex: 1, fontSize: 17, fontWeight: '700', color: t.q.ink }}>
                Choose your specialty
              </Text>
              <IconBtn name="close" label="Close" onPress={() => setPickerOpen(false)} />
            </View>
            <Hair inset={0} />
            <ScrollView>
              {specialties.map((s, i) => (
                <View key={s.id}>
                  {i > 0 && <Hair />}
                  <Row
                    title={s.name}
                    tint={form.specialty_id === s.id}
                    right={form.specialty_id === s.id
                      ? <Ionicons name="checkmark" size={18} color={t.q.primary} />
                      : undefined}
                    onPress={() => { haptics.tap(); set('specialty_id', s.id); setPickerOpen(false) }} />
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

function ToggleRow({ label, sub, value, onToggle, theme: t, last }: {
  label: string; sub: string; value: boolean; onToggle: (v: boolean) => void; theme: any; last?: boolean
}) {
  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 56 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ fontSize: 14.5, fontWeight: '600', letterSpacing: -0.14, color: t.q.ink }}>{label}</Text>
          <Text style={{ fontSize: 12.5, lineHeight: 16, color: t.q.ink60 }}>{sub}</Text>
        </View>
        <Switch
          value={value} onValueChange={v => { haptics.tap(); onToggle(v) }}
          accessibilityLabel={label}
          trackColor={{ true: t.q.primary, false: t.q.line }}
          thumbColor="#FFFFFF" />
      </View>
      {!last && <Hair />}
    </>
  )
}
