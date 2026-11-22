import { useCallback, useEffect, useState } from 'react'
import { View, Switch, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { haptics } from '@queue/shared/lib/haptics'
import { getProviderSettings, updateProviderSettings } from '@queue/shared/lib/ambulance-admin-api'
import {
  Screen, AppBar, Body, Card, Hair, SectionHead, Field, Btn, BottomBar, Notice,
} from '@queue/shared/components/q'

/**
 * private_fleet / service_radius_m / service_hours_247 -- columns on
 * ambulance_providers itself now, so hospital-owned and independent
 * providers are edited from the exact same screen. private_fleet only means
 * anything for a hospital-owned provider ("only send patients to their own
 * hospital, or be flexible"); an independent operator has no home hospital
 * for it to refer to, so that toggle is hidden for them.
 */
export function ProviderSettingsScreen({ navigation }: { navigation?: any }) {
  const { theme: t } = useTheme()

  const [providerType, setProviderType] = useState<'hospital_fleet' | 'third_party' | null>(null)
  const [privateFleet, setPrivateFleet] = useState(true)
  const [hours247, setHours247] = useState(true)
  const [radiusKm, setRadiusKm] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  const load = useCallback(async () => {
    try {
      const { settings } = await getProviderSettings()
      setProviderType(settings.provider_type)
      setPrivateFleet(settings.private_fleet)
      setHours247(settings.service_hours_247)
      setRadiusKm(settings.service_radius_m != null ? String(Math.round(settings.service_radius_m / 1000)) : '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load settings')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false)
    try {
      const radiusM = radiusKm.trim() ? Math.round(Number(radiusKm) * 1000) : null
      await updateProviderSettings({
        ...(providerType === 'hospital_fleet' ? { privateFleet } : {}),
        serviceHours247: hours247,
        serviceRadiusM: radiusM,
      })
      haptics.success()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      haptics.error()
      setError(err instanceof Error ? err.message : 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <Screen>
        <AppBar title="Service settings"
          onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      </Screen>
    )
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppBar title="Service settings" sub="How far and when your fleet is dispatched"
          onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined} />

        <Body>
          {!!error && <Notice tone="red" icon="alert-circle">{error}</Notice>}

          <SectionHead title="Dispatch" />
          <Card>
            {providerType === 'hospital_fleet' && (
              <ToggleRow
                label="Private fleet"
                sub="Only transport patients to your own hospital"
                value={privateFleet} onToggle={setPrivateFleet} theme={t} />
            )}
            <ToggleRow
              label="Available 24/7"
              sub={providerType === 'hospital_fleet'
                ? "Off restricts dispatch to your hospital's operating hours"
                : 'Off means you never receive requests'}
              value={hours247} onToggle={setHours247} theme={t} last />
          </Card>

          <SectionHead title="Coverage" />
          <Card>
            <View style={{ padding: 14, gap: 6 }}>
              <Field label="Coverage radius (km)" value={radiusKm} onChangeText={setRadiusKm}
                keyboardType="number-pad" placeholder="No cap"
                hint="Offers outside this radius never reach your crews. Leave it blank for no cap." />
            </View>
          </Card>
        </Body>

        <BottomBar>
          <Btn grow label={saved ? 'Saved' : 'Save changes'} icon={saved ? 'checkmark' : undefined}
            loading={saving} onPress={handleSave} />
        </BottomBar>
      </Screen>
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
