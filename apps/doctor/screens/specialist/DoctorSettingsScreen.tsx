import { useEffect, useState, useCallback } from 'react'
import { View, Text, TextInput, TouchableOpacity, Switch, ActivityIndicator, Linking, Modal, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as DocumentPicker from 'expo-document-picker'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Button } from '@queue/shared/components/ui/Button'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import {
  getDoctorProfileSettings, updateDoctorProfileSettings, DoctorProfileSettings,
  getQualificationDocuments, uploadQualificationDocument, deleteQualificationDocument, QualificationDocument,
  getSpecialties, SpecialtyRow,
} from '@queue/shared/lib/api'
import { ShellScroll } from '@queue/shared/components/AppShell'

interface Props { navigation: any }

const DEFAULTS: DoctorProfileSettings = {
  title: null, specialty_id: null, level: null, bio: null, qualification: null, years_experience: null,
  virtual_fee: null, home_visit_fee: null,
  accepts_direct_virtual: false, accepts_direct_home_visit: false, show_phone_to_patients: false,
}

export function DoctorSettingsScreen({}: Props) {
  const { theme: t, themeId, toggleTheme } = useTheme()
  const { user, doctorProfile, signOut } = useAuth()
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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent} />
      </View>
    )
  }

  return (
    <>
      <ShellScroll>
        <Text style={{ fontSize: 22, fontWeight: '800', color: t.textPrimary, letterSpacing: -0.5, marginBottom: 4 }}>Settings</Text>
        <Text style={{ fontSize: 12, color: t.textMuted, marginBottom: 20 }}>
          Your independent, hospital-agnostic profile — what patients see when booking you directly.
        </Text>

        <Section theme={t} title="Direct bookings">
          <ToggleRow theme={t} label="Accept virtual consults" sub="Patients can book a video call with you directly"
            value={form.accepts_direct_virtual} onChange={v => set('accepts_direct_virtual', v)} />
          {form.accepts_direct_virtual && (
            <FeeRow theme={t} label="Virtual consultation fee (₦)" value={form.virtual_fee}
              onChange={v => set('virtual_fee', v)} />
          )}
          <ToggleRow theme={t} label="Accept home visits" sub="Patients can request you visit their home"
            value={form.accepts_direct_home_visit} onChange={v => set('accepts_direct_home_visit', v)} />
          {form.accepts_direct_home_visit && (
            <FeeRow theme={t} label="Home visit fee (₦)" value={form.home_visit_fee}
              onChange={v => set('home_visit_fee', v)} />
          )}
          <ToggleRow theme={t} label="Show my phone number to patients" sub="Otherwise only visible after they've booked you"
            value={form.show_phone_to_patients} onChange={v => set('show_phone_to_patients', v)} last />
        </Section>

        <Section theme={t} title="Public profile">
          <FieldRow theme={t} label="Title" value={form.title ?? ''} onChange={v => set('title', v || null)} placeholder="e.g. Dr." />
          <TouchableOpacity onPress={() => { haptics.tap(); setPickerOpen(true) }}
            style={{ padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: t.cardBorder }}>
            <Text style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>Medical Specialty</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.inputBg, borderRadius: 10, padding: 10 }}>
              <Text style={{ fontSize: 13, color: form.specialty_id ? t.textPrimary : t.textMuted }}>
                {specialties.find(s => s.id === form.specialty_id)?.name ?? 'Select specialty…'}
              </Text>
              <Ionicons name="chevron-down" size={14} color={t.textMuted} />
            </View>
          </TouchableOpacity>
          <FieldRow theme={t} label="Level / Cadre" value={form.level ?? ''} onChange={v => set('level', v || null)}
            placeholder="e.g. Consultant, Senior Registrar, MO" />
          <FieldRow theme={t} label="Qualifications" value={form.qualification ?? ''} onChange={v => set('qualification', v || null)} placeholder="e.g. MBBS, FWACS" />
          <FieldRow theme={t} label="Years of experience" value={form.years_experience?.toString() ?? ''}
            onChange={v => set('years_experience', v ? Number(v.replace(/\D/g, '')) : null)} placeholder="e.g. 8" keyboardType="number-pad" />
          <FieldRow theme={t} label="Bio" value={form.bio ?? ''} onChange={v => set('bio', v || null)} placeholder="Brief bio patients will see" multiline last />
        </Section>

        <Button label={saved ? 'Saved ✓' : 'Save Settings'} onPress={save} loading={saving} style={{ marginBottom: 20 }} />

        <Section theme={t} title="Qualification documents">
          {docs.length === 0 ? (
            <Text style={{ fontSize: 12, color: t.textMuted, padding: 14 }}>
              No documents uploaded yet. Upload certificates or licences so patients can verify your credentials.
            </Text>
          ) : docs.map(d => (
            <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: t.cardBorder }}>
              <TouchableOpacity style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                onPress={() => d.url && Linking.openURL(d.url)}>
                <Ionicons name="document-text-outline" size={16} color={t.accent} />
                <Text numberOfLines={1} style={{ fontSize: 12, color: t.textPrimary, flex: 1 }}>{d.title}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDelete(d.id)} style={{ padding: 4 }}>
                <Ionicons name="trash-outline" size={15} color={t.danger} />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={handleUpload} disabled={uploading}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14 }}>
            {uploading ? <ActivityIndicator size="small" color={t.accent} /> : (
              <>
                <Ionicons name="cloud-upload-outline" size={15} color={t.accent} />
                <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent }}>Upload document (PDF, JPG, PNG — max 10MB)</Text>
              </>
            )}
          </TouchableOpacity>
        </Section>

        <Section theme={t} title="App">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingHorizontal: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name={themeId === 'forest' ? 'moon-outline' : 'sunny-outline'} size={14} color={t.textPrimary} />
              <Text style={{ fontSize: 13, color: t.textPrimary }}>{themeId === 'forest' ? 'Dark theme' : 'Light theme'}</Text>
            </View>
            <Switch value={themeId === 'forest'} onValueChange={toggleTheme} trackColor={{ true: t.accent, false: t.cardBorder }} />
          </View>
        </Section>

        {confirmSignOut ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={() => setConfirmSignOut(false)}
              style={{ flex: 1, padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: t.cardBorder, backgroundColor: t.cardBg }}>
              <Text style={{ color: t.textPrimary, fontWeight: '700' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => signOut()}
              style={{ flex: 1, padding: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: t.dangerStrong, backgroundColor: t.dangerSubtle }}>
              <Text style={{ color: t.danger, fontWeight: '700' }}>Confirm Sign Out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setConfirmSignOut(true)}
            style={{ borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, borderColor: t.dangerBorder, backgroundColor: t.dangerSubtle }}>
            <Text style={{ fontSize: 14, fontWeight: '700', color: t.danger }}>Sign out</Text>
          </TouchableOpacity>
        )}
      </ShellScroll>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: t.cardBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingTop: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: t.cardBorder }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: t.textPrimary }}>Select Specialty</Text>
              <TouchableOpacity onPress={() => setPickerOpen(false)}>
                <Ionicons name="close" size={20} color={t.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ padding: 8 }}>
              {specialties.map(s => (
                <TouchableOpacity key={s.id}
                  onPress={() => { haptics.tap(); set('specialty_id', s.id); setPickerOpen(false) }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10,
                    backgroundColor: form.specialty_id === s.id ? t.accentBg : 'transparent',
                  }}>
                  <Text style={{ fontSize: 18 }}>{s.icon ?? '🩺'}</Text>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: form.specialty_id === s.id ? t.accent : t.textPrimary, flex: 1 }}>{s.name}</Text>
                  {form.specialty_id === s.id && <Ionicons name="checkmark" size={16} color={t.accent} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  )
}

function Section({ theme: t, title, children }: { theme: any; title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ fontSize: 11, fontWeight: '700', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 }}>{title}</Text>
      <View style={{ backgroundColor: t.cardBg, borderColor: t.cardBorder, borderWidth: 1, borderRadius: 14, overflow: 'hidden' }}>
        {children}
      </View>
    </View>
  )
}

function ToggleRow({ theme: t, label, sub, value, onChange, last }: {
  theme: any; label: string; sub?: string; value: boolean; onChange: (v: boolean) => void; last?: boolean
}) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.cardBorder }}>
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text style={{ fontSize: 13, fontWeight: '600', color: t.textPrimary }}>{label}</Text>
        {sub && <Text style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{sub}</Text>}
      </View>
      <Switch value={value} onValueChange={v => { haptics.tap(); onChange(v) }} trackColor={{ true: t.accent, false: t.cardBorder }} />
    </View>
  )
}

function FeeRow({ theme: t, label, value, onChange }: { theme: any; label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <View style={{ padding: 12, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: t.cardBorder }}>
      <Text style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>{label}</Text>
      <TextInput value={value?.toString() ?? ''} onChangeText={v => onChange(v ? Number(v.replace(/\D/g, '')) : null)}
        keyboardType="number-pad" placeholder="e.g. 5000" placeholderTextColor={t.textMuted}
        style={{ borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.inputBg, borderRadius: 10, padding: 10, fontSize: 13, color: t.textPrimary }} />
    </View>
  )
}

function FieldRow({ theme: t, label, value, onChange, placeholder, multiline, keyboardType, last }: {
  theme: any; label: string; value: string; onChange: (v: string) => void; placeholder?: string
  multiline?: boolean; keyboardType?: 'default' | 'number-pad'; last?: boolean
}) {
  return (
    <View style={{ padding: 12, paddingHorizontal: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: t.cardBorder }}>
      <Text style={{ fontSize: 11, color: t.textMuted, marginBottom: 6 }}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={t.textMuted}
        multiline={multiline} keyboardType={keyboardType ?? 'default'}
        style={{
          borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.inputBg, borderRadius: 10,
          padding: 10, fontSize: 13, color: t.textPrimary, minHeight: multiline ? 70 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }} />
    </View>
  )
}
