import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { Button } from '@queue/shared/components/ui/Button'
import { haptics } from '@queue/shared/lib/haptics'
import { registerAmbulanceProvider } from '@queue/shared/lib/ambulance-admin-api'
import { getHospitals } from '@queue/shared/lib/api'
import type { HospitalWithDoctors } from '@queue/shared/lib/api'

type ProviderType = 'hospital_fleet' | 'third_party'

const PROVIDER_TYPE_OPTIONS: { value: ProviderType; label: string; icon: keyof typeof Ionicons.glyphMap; sub: string }[] = [
  { value: 'third_party',   label: 'Independent', icon: 'car-outline',      sub: 'A private or government service, not tied to one hospital' },
  { value: 'hospital_fleet', label: 'Hospital-owned', icon: 'business-outline', sub: 'Runs as this hospital\'s own ambulance service' },
]

const OWNERSHIP_OPTIONS: { value: 'private' | 'government'; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { value: 'private',    label: 'Private',    icon: 'briefcase-outline' },
  { value: 'government', label: 'Government', icon: 'shield-checkmark-outline' },
]

/**
 * "independent and hospital owned ambulances to work the same, have the
 * same registration process" -- one form for both. Account creation already
 * happened in AmbulanceProviderRegisterScreen; this collects the service's
 * own details and submits to POST /api/ambulances/register, which creates
 * the ambulance_providers row (hospital-linked or third_party) and this
 * account's ambulance_provider_admins ('owner') row in one step. A
 * hospital-owned service picks its hospital here rather than signing in
 * with a hospital_admin account -- ambulance management lives in this app
 * only, on its own account, for either kind of provider.
 */
export function AmbulanceProviderOnboardingScreen() {
  const { theme: t } = useTheme()
  const { setPendingAmbulanceProviderOnboarding, refreshProfile } = useAuth()

  const [providerType, setProviderType] = useState<ProviderType>('third_party')
  const [providerName, setProviderName] = useState('')
  const [ownership, setOwnership] = useState<'private' | 'government'>('private')

  const [hospitalQuery, setHospitalQuery] = useState('')
  const [hospitalResults, setHospitalResults] = useState<HospitalWithDoctors[]>([])
  const [hospitalSearching, setHospitalSearching] = useState(false)
  const [selectedHospital, setSelectedHospital] = useState<HospitalWithDoctors | null>(null)

  const [contactPhone, setContactPhone] = useState('')
  const [contactEmail, setContactEmail] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const searchHospitals = useCallback((q: string) => {
    setHospitalSearching(true)
    getHospitals(q).then(rows => setHospitalResults(rows.slice(0, 20))).finally(() => setHospitalSearching(false))
  }, [])

  // Load an initial page immediately (empty query) so there's something to
  // pick from before typing, then re-search as the query changes.
  useEffect(() => {
    if (providerType !== 'hospital_fleet') return
    const handle = setTimeout(() => searchHospitals(hospitalQuery), 300)
    return () => clearTimeout(handle)
  }, [providerType, hospitalQuery, searchHospitals])

  function validate() {
    if (!providerName.trim()) { setError('Enter your service name.'); return false }
    if (providerType === 'hospital_fleet' && !selectedHospital) { setError('Select which hospital this service is part of.'); return false }
    if (!contactPhone.trim()) { setError('Enter a contact phone number.'); return false }
    return true
  }

  async function handleSubmit() {
    setError('')
    if (!validate()) return
    setSubmitting(true)
    try {
      await registerAmbulanceProvider({
        providerName: providerName.trim(),
        providerType,
        hospitalId: providerType === 'hospital_fleet' ? selectedHospital!.id : undefined,
        ownershipCategory: providerType === 'third_party' ? ownership : undefined,
        contactPhone: contactPhone.trim(),
        contactEmail: contactEmail.trim() || undefined,
      })
      haptics.success()
      setPendingAmbulanceProviderOnboarding(false)
      await refreshProfile()
      setDone(true)
    } catch (e) {
      haptics.error()
      setError(e instanceof Error ? e.message : 'Registration failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <Ionicons name="checkmark-circle" size={72} color={t.accentDark} style={{ marginBottom: 20 }} />
          <Text style={[s.doneTitle, { color: t.textPrimary }]}>You&apos;re registered!</Text>
          <Text style={[s.doneSub, { color: t.textMuted }]}>
            {providerName} is now on Queue. Add your first ambulance from the Fleet tab to
            start receiving requests.
          </Text>
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
          <Text style={[s.title, { color: t.textPrimary }]}>Your ambulance service</Text>
          <Text style={[s.sub, { color: t.textMuted }]}>
            This is what patients and hospitals will see when you&apos;re dispatched.
          </Text>

          {error ? (
            <View style={[s.errorBanner, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }]}>
              <Ionicons name="alert-circle-outline" size={14} color={t.danger} />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}

          <Text style={[s.label, { color: t.textMuted }]}>Type of service</Text>
          <View style={s.typeRow}>
            {PROVIDER_TYPE_OPTIONS.map(opt => {
              const active = providerType === opt.value
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => setProviderType(opt.value)}
                  style={[s.typeCard, { backgroundColor: active ? t.accentBgMid : t.cardBg, borderColor: active ? t.accentBorder : t.cardBorder }]}
                >
                  <Ionicons name={opt.icon} size={18} color={active ? t.accent : t.textMuted} />
                  <Text style={{ color: active ? t.accent : t.textPrimary, fontSize: 13, fontWeight: '700', marginTop: 6 }}>{opt.label}</Text>
                  <Text style={{ color: t.textMuted, fontSize: 10.5, marginTop: 2, lineHeight: 14 }}>{opt.sub}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          <Field icon="business-outline" placeholder="Service name (e.g. Lifeline Ambulance)" value={providerName} onChange={setProviderName} t={t} />

          {providerType === 'hospital_fleet' ? (
            <>
              <Text style={[s.label, { color: t.textMuted }]}>Which hospital</Text>
              <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
                <Ionicons name="search-outline" size={16} color={t.textMuted} />
                <TextInput
                  value={hospitalQuery} onChangeText={t2 => { setHospitalQuery(t2); setSelectedHospital(null) }}
                  placeholder="Search hospitals by name" placeholderTextColor={t.textMuted}
                  style={[s.inputText, { color: t.textPrimary }]}
                />
                {hospitalSearching && <ActivityIndicator size="small" color={t.textMuted} />}
              </View>
              {selectedHospital ? (
                <View style={[s.selectedHospital, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
                  <Ionicons name="checkmark-circle" size={16} color={t.accent} />
                  <Text style={{ color: t.accent, fontSize: 13, fontWeight: '700', flex: 1 }}>{selectedHospital.name}</Text>
                  <TouchableOpacity onPress={() => setSelectedHospital(null)}>
                    <Ionicons name="close" size={16} color={t.accent} />
                  </TouchableOpacity>
                </View>
              ) : (
                hospitalResults.map(h => (
                  <TouchableOpacity key={h.id} onPress={() => { setSelectedHospital(h); haptics.tap() }}
                    style={[s.hospitalRow, { borderColor: t.cardBorder, backgroundColor: t.cardBg }]}>
                    <Text style={{ color: t.textPrimary, fontSize: 13, fontWeight: '600' }}>{h.name}</Text>
                    {(h.city || h.state) && <Text style={{ color: t.textMuted, fontSize: 11.5, marginTop: 2 }}>{[h.city, h.state].filter(Boolean).join(', ')}</Text>}
                  </TouchableOpacity>
                ))
              )}
            </>
          ) : (
            <>
              <Text style={[s.label, { color: t.textMuted }]}>Ownership</Text>
              <View style={s.ownershipRow}>
                {OWNERSHIP_OPTIONS.map(opt => {
                  const active = ownership === opt.value
                  return (
                    <TouchableOpacity
                      key={opt.value}
                      onPress={() => setOwnership(opt.value)}
                      style={[s.ownershipBtn, { backgroundColor: active ? t.accentBgMid : t.cardBg, borderColor: active ? t.accentBorder : t.cardBorder }]}
                    >
                      <Ionicons name={opt.icon} size={16} color={active ? t.accent : t.textMuted} />
                      <Text style={{ color: active ? t.accent : t.textPrimary, fontSize: 13, fontWeight: '700' }}>{opt.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
            </>
          )}

          <Field icon="call-outline" placeholder="Contact phone" value={contactPhone} onChange={setContactPhone} t={t} keyboard="phone-pad" />
          <Field icon="mail-outline" placeholder="Contact email (optional)" value={contactEmail} onChange={setContactEmail} t={t} keyboard="email-address" />

          <Button label="Register" onPress={handleSubmit} loading={submitting} style={{ marginTop: t.spacing.lg }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field({ icon, placeholder, value, onChange, t, keyboard }: {
  icon: React.ComponentProps<typeof Ionicons>['name']; placeholder: string; value: string
  onChange: (v: string) => void; t: any; keyboard?: any
}) {
  return (
    <View style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
      <Ionicons name={icon} size={16} color={t.textMuted} />
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={t.textMuted} keyboardType={keyboard ?? 'default'}
        autoCapitalize={keyboard === 'email-address' ? 'none' : 'sentences'} autoCorrect={false}
        style={[s.inputText, { color: t.textPrimary }]}
      />
    </View>
  )
}

const s = StyleSheet.create({
  safe:        { flex: 1 },
  title:       { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginBottom: 6 },
  sub:         { fontSize: 13, lineHeight: 19, marginBottom: 20 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 14 },
  errorText:   { fontSize: 13, color: '#FF5C5C', flex: 1 },
  input:       { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 12 },
  inputText:   { fontSize: 14, flex: 1 },
  label:       { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  typeRow:     { flexDirection: 'row', gap: 10, marginBottom: 16 },
  typeCard:    { flex: 1, borderRadius: 14, borderWidth: 1, padding: 13, alignItems: 'flex-start' },
  ownershipRow:{ flexDirection: 'row', gap: 10, marginBottom: 16 },
  ownershipBtn:{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 13 },
  selectedHospital: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  hospitalRow: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  doneTitle:   { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, marginBottom: 8, textAlign: 'center' },
  doneSub:     { fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
