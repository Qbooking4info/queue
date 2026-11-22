import { useState, useEffect, useCallback } from 'react'
import { View, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import { registerAmbulanceProvider } from '@queue/shared/lib/ambulance-admin-api'
import { getHospitals } from '@queue/shared/lib/api'
import type { HospitalWithDoctors } from '@queue/shared/lib/api'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Chip, Field,
  Btn, BottomBar, Notice, SearchField, Empty,
} from '@queue/shared/components/q'

type ProviderType = 'hospital_fleet' | 'third_party'

const PROVIDER_TYPE_OPTIONS: { value: ProviderType; label: string; icon: keyof typeof Ionicons.glyphMap; sub: string }[] = [
  { value: 'third_party',    label: 'Independent provider', icon: 'car-outline',      sub: 'You serve any hospital' },
  { value: 'hospital_fleet', label: 'Hospital-owned',       icon: 'business-outline', sub: "Your fleet belongs to a hospital on Queue" },
]

const OWNERSHIP_OPTIONS: { value: 'private' | 'government'; label: string }[] = [
  { value: 'private',    label: 'Private' },
  { value: 'government', label: 'Government' },
]

/**
 * One form for both kinds of service. Account creation already happened in
 * AmbulanceProviderRegisterScreen; this collects the service's own details
 * and submits to POST /api/ambulances/register, which creates the
 * ambulance_providers row (hospital-linked or third_party) and this
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
      <Screen>
        <AppBar />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 }}>
          <Ionicons name="checkmark-circle" size={64} color={t.q.green} />
          <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '700', color: t.q.ink, textAlign: 'center' }}>
            You're registered
          </Text>
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60, textAlign: 'center' }}>
            {providerName} is on Queue. Add your first ambulance from the Fleet tab to start receiving
            requests.
          </Text>
        </View>
      </Screen>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppBar title="Setup" sub="Your ambulance service" />

        <Body keyboardShouldPersistTaps="handled">
          <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
            <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '800', letterSpacing: -0.6, color: t.q.ink }}>
              Your ambulance service
            </Text>
            <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60, marginTop: 6 }}>
              This is what patients and hospitals see when you are dispatched.
            </Text>
          </View>

          {!!error && <Notice tone="red" icon="alert-circle">{error}</Notice>}

          <SectionHead title="Type of service" />
          <Card>
            {PROVIDER_TYPE_OPTIONS.map((opt, i) => (
              <View key={opt.value}>
                {i > 0 && <Hair />}
                <Row
                  icon={opt.icon}
                  iconTone={providerType === opt.value ? 'teal' : 'neutral'}
                  title={opt.label}
                  sub={opt.sub}
                  tint={providerType === opt.value}
                  right={providerType === opt.value
                    ? <Ionicons name="checkmark-circle" size={20} color={t.q.primary} />
                    : undefined}
                  onPress={() => { haptics.tap(); setProviderType(opt.value) }} />
              </View>
            ))}
          </Card>

          <SectionHead title="Your service" />
          <Card>
            <View style={{ padding: 14, gap: 14 }}>
              <Field label="Service name" value={providerName} onChangeText={setProviderName}
                placeholder="e.g. Lifeline Ambulance" autoCapitalize="words" />
              {providerType === 'third_party' && (
                <View style={{ gap: 8 }}>
                  <CardLabel>Ownership</CardLabel>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {OWNERSHIP_OPTIONS.map(opt => (
                      <Chip key={opt.value} label={opt.label} on={ownership === opt.value}
                        onPress={() => { haptics.tap(); setOwnership(opt.value) }} />
                    ))}
                  </View>
                </View>
              )}
              <Field label="Contact phone" value={contactPhone} onChangeText={setContactPhone}
                placeholder="+234 812 345 6789" keyboardType="phone-pad" autoCorrect={false} />
              <Field label="Contact email (optional)" value={contactEmail} onChangeText={setContactEmail}
                placeholder="dispatch@service.com" keyboardType="email-address"
                autoCapitalize="none" autoCorrect={false} />
            </View>
          </Card>

          {providerType === 'hospital_fleet' && (
            <>
              <SectionHead title="Which hospital" />
              {selectedHospital ? (
                <Card>
                  <Row
                    icon="business-outline" iconTone="teal" tint
                    title={selectedHospital.name}
                    sub={[selectedHospital.city, selectedHospital.state].filter(Boolean).join(', ') || null}
                    right={<Btn label="Change" variant="secondary" small
                      onPress={() => { setSelectedHospital(null); setHospitalQuery('') }} />} />
                </Card>
              ) : (
                <>
                  <SearchField value={hospitalQuery} onChangeText={setHospitalQuery}
                    placeholder="Search hospitals by name" />
                  {hospitalSearching ? (
                    <ActivityIndicator color={t.q.primary} style={{ marginVertical: 20 }} />
                  ) : hospitalResults.length === 0 ? (
                    <Card>
                      <Empty icon="business-outline" title="No hospitals found"
                        body="Try a different name." />
                    </Card>
                  ) : (
                    <Card>
                      {hospitalResults.map((h, i) => (
                        <View key={h.id}>
                          {i > 0 && <Hair />}
                          <Row
                            icon="business-outline"
                            title={h.name}
                            sub={[h.city, h.state].filter(Boolean).join(', ') || null}
                            chevron
                            onPress={() => { haptics.tap(); setSelectedHospital(h) }} />
                        </View>
                      ))}
                    </Card>
                  )}
                </>
              )}
            </>
          )}
        </Body>

        <BottomBar>
          <Btn grow label="Register service" loading={submitting} onPress={handleSubmit} />
        </BottomBar>
      </Screen>
    </KeyboardAvoidingView>
  )
}
