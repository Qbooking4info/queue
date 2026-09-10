import { useCallback, useEffect, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Switch, TextInput, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Button } from '@queue/shared/components/ui/Button'
import { getProviderSettings, updateProviderSettings } from '@queue/shared/lib/ambulance-admin-api'

/**
 * private_fleet / service_radius_m / service_hours_247 -- columns on
 * ambulance_providers itself now, so hospital-owned and independent
 * providers are edited from the exact same screen. private_fleet only means
 * anything for a hospital-owned provider ("only send patients to their own
 * hospital, or be flexible"); an independent operator has no home hospital
 * for it to refer to, so that toggle is hidden for them.
 */
export function ProviderSettingsScreen() {
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
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={t.accent} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text style={[s.title, { color: t.textPrimary }]}>Service Settings</Text>
        <Text style={[s.subtitle, { color: t.textMuted }]}>How far and when your fleet is dispatched.</Text>

        {error ? (
          <View style={[s.errorBanner, { backgroundColor: t.dangerSubtle, borderColor: t.dangerBorder }]}>
            <Text style={{ color: t.danger, fontSize: 12 }}>{error}</Text>
          </View>
        ) : null}

        {providerType === 'hospital_fleet' && (
          <View style={[s.row, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, { color: t.textPrimary }]}>Private fleet</Text>
              <Text style={[s.rowSub, { color: t.textMuted }]}>Only transport patients to your own hospital</Text>
            </View>
            <Switch value={privateFleet} onValueChange={setPrivateFleet} trackColor={{ true: t.accent, false: t.cardBorder }} />
          </View>
        )}

        <View style={[s.row, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.rowLabel, { color: t.textPrimary }]}>Available 24/7</Text>
            <Text style={[s.rowSub, { color: t.textMuted }]}>
              {providerType === 'hospital_fleet' ? "Off restricts dispatch to your hospital's operating hours" : 'Off means you never receive requests'}
            </Text>
          </View>
          <Switch value={hours247} onValueChange={setHours247} trackColor={{ true: t.accent, false: t.cardBorder }} />
        </View>

        <View style={[s.row, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.rowLabel, { color: t.textPrimary }]}>Service radius (km)</Text>
            <Text style={[s.rowSub, { color: t.textMuted }]}>Leave blank for no cap</Text>
          </View>
          <TextInput
            value={radiusKm} onChangeText={setRadiusKm} keyboardType="number-pad" placeholder="—"
            placeholderTextColor={t.textMuted}
            style={[s.radiusInput, { color: t.textPrimary, borderColor: t.inputBorder, backgroundColor: t.inputBg }]}
          />
        </View>

        {saved && (
          <View style={[s.savedBanner, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
            <Ionicons name="checkmark-circle" size={14} color={t.accent} />
            <Text style={{ color: t.accent, fontSize: 12, fontWeight: '600' }}>Saved</Text>
          </View>
        )}

        <Button label="Save changes" onPress={handleSave} loading={saving} style={{ marginTop: 8 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2, marginBottom: 18 },
  errorBanner: { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  rowLabel: { fontSize: 14, fontWeight: '700' },
  rowSub: { fontSize: 11.5, marginTop: 2 },
  radiusInput: { width: 64, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, textAlign: 'center', fontSize: 14 },
  savedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 6 },
})
