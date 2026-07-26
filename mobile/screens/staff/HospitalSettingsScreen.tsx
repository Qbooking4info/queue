import { useState, useCallback } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Switch, Alert, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth }  from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import { haptics }  from '../../lib/haptics'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface DayHours { day: number; open: string; close: string; closed: boolean }

interface Settings {
  accepts_virtual: boolean
  emergency_hours: boolean
  is_24_hours: boolean
  approval_mode: 'auto' | 'manual'
  requires_referral: boolean
  sms_reminders: boolean
  email_reminders: boolean
  daily_booking_limit: number | null
  opd_fee: number | null
}

interface Props { navigation: any }

export function HospitalSettingsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const [settings,   setSettings]   = useState<Settings | null>(null)
  const [hours,      setHours]      = useState<DayHours[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [hospitalName, setHospitalName] = useState('')

  const hospitalId = staffProfile?.hospitalId

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) return
    if (!silent) setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      const [settingsRes, hosRes] = await Promise.all([
        fetch(`${API_URL}/api/hospitals/${hospitalId}/settings`, {
          headers: { Authorization: `Bearer ${jwt}` },
        }),
        (supabase as any).from('hospitals').select('name').eq('id', hospitalId).single(),
      ])
      if (settingsRes.ok) {
        const body = await settingsRes.json()
        setSettings(body.settings)
        setHours(body.hours ?? [])
      }
      if (hosRes.data) setHospitalName(hosRes.data.name)
    } catch { /* silent */ }
    setLoading(false)
    setRefreshing(false)
  }, [hospitalId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function save(patch: Partial<Settings>) {
    if (!hospitalId || !settings) return
    setSaving(true)
    const updated = { ...settings, ...patch }
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      const res = await fetch(`${API_URL}/api/hospitals/${hospitalId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ settings: patch }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error ?? 'Save failed')
      }
      setSettings(updated)
      haptics.success()
    } catch (e) {
      haptics.error()
      Alert.alert('Error', e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  function toggle(field: keyof Settings) {
    if (!settings) return
    const val = !(settings[field] as boolean)
    save({ [field]: val })
  }

  return (
    <SafeAreaView edges={['top','left','right']} style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: t.textPrimary }]}>Settings</Text>
        {saving && <ActivityIndicator color={t.accent} size="small" />}
      </View>
      {hospitalName ? <Text style={[s.subtitle, { color: t.textMuted }]}>{hospitalName}</Text> : null}

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.accent} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }} tintColor={t.accent} />}
        >
          {/* Booking & approval */}
          <Text style={[s.sectionLabel, { color: t.textMuted }]}>BOOKING</Text>
          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <ToggleRow label="Auto-approve bookings" sub="Instantly confirm bookings without review"
              value={settings?.approval_mode === 'auto'} disabled={saving}
              onToggle={() => save({ approval_mode: settings?.approval_mode === 'auto' ? 'manual' : 'auto' })} theme={t} />
            <ToggleRow label="Requires referral" sub="Patients must provide a referral note"
              value={settings?.requires_referral ?? false} disabled={saving}
              onToggle={() => toggle('requires_referral')} theme={t} />
            <ToggleRow label="Virtual consultations" sub="Allow video call appointments"
              value={settings?.accepts_virtual ?? false} disabled={saving}
              onToggle={() => toggle('accepts_virtual')} theme={t} last />
          </View>

          {/* Hours */}
          <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 20 }]}>OPERATIONS</Text>
          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <ToggleRow label="24-hour service" sub="Hospital operates around the clock"
              value={settings?.is_24_hours ?? false} disabled={saving}
              onToggle={() => toggle('is_24_hours')} theme={t} />
            <ToggleRow label="Emergency hours" sub="Accept emergency walk-ins at any hour"
              value={settings?.emergency_hours ?? false} disabled={saving}
              onToggle={() => toggle('emergency_hours')} theme={t} last />
          </View>

          {/* Reminders */}
          <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 20 }]}>REMINDERS</Text>
          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <ToggleRow label="SMS reminders" sub="Send SMS reminders to patients"
              value={settings?.sms_reminders ?? false} disabled={saving}
              onToggle={() => toggle('sms_reminders')} theme={t} />
            <ToggleRow label="Email reminders" sub="Send email reminders to patients"
              value={settings?.email_reminders ?? false} disabled={saving}
              onToggle={() => toggle('email_reminders')} theme={t} last />
          </View>

          {/* Operating hours */}
          {hours.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 20 }]}>OPERATING HOURS</Text>
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                {hours.map((h, i) => (
                  <View key={h.day} style={[s.hoursRow, { borderTopColor: t.cardBorder, borderTopWidth: i === 0 ? 0 : 1 }]}>
                    <Text style={[s.dayName, { color: t.textPrimary }]}>{DAYS[h.day]}</Text>
                    {h.closed ? (
                      <Text style={[s.closedText, { color: t.textMuted }]}>Closed</Text>
                    ) : (
                      <Text style={[s.hoursText, { color: t.textSecondary }]}>{h.open} – {h.close}</Text>
                    )}
                  </View>
                ))}
              </View>
              <Text style={[s.hintText, { color: t.textMuted }]}>To edit operating hours, use the web portal.</Text>
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function ToggleRow({ label, sub, value, disabled, onToggle, theme: t, last }: {
  label: string; sub: string; value: boolean; disabled: boolean
  onToggle: () => void; theme: any; last?: boolean
}) {
  return (
    <View style={[s.toggleRow, { borderBottomColor: t.cardBorder, borderBottomWidth: last ? 0 : 1 }]}>
      <View style={{ flex: 1 }}>
        <Text style={[s.toggleLabel, { color: t.textPrimary }]}>{label}</Text>
        <Text style={[s.toggleSub, { color: t.textMuted }]}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onToggle} disabled={disabled}
        trackColor={{ true: '#00C265', false: t.cardBorder }} />
    </View>
  )
}

const s = StyleSheet.create({
  safe:        { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 2 },
  title:       { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  subtitle:    { fontSize: 13, paddingHorizontal: 20, marginBottom: 16 },
  sectionLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 },
  card:        { borderRadius: 16, borderWidth: 1, overflow: 'hidden', marginBottom: 4 },
  toggleRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  toggleLabel: { fontSize: 14, fontWeight: '600' },
  toggleSub:   { fontSize: 11, marginTop: 2 },
  hoursRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11 },
  dayName:     { fontSize: 13, fontWeight: '600' },
  hoursText:   { fontSize: 13 },
  closedText:  { fontSize: 13, fontStyle: 'italic' },
  hintText:    { fontSize: 11, textAlign: 'center', marginTop: 8 },
})
