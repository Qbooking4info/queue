import { useState, useCallback, useEffect } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Switch, RefreshControl, TextInput } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics }  from '@queue/shared/lib/haptics'
import { Button } from '@queue/shared/components/ui/Button'

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
  latitude: number | null
  longitude: number | null
  ambulance_private_fleet: boolean
  ambulance_service_radius_m: number | null
  ambulance_service_hours_247: boolean
}

interface Props { navigation: any }

async function authedFetch(path: string, init?: RequestInit) {
  const { data: { session } } = await supabase.auth.getSession()
  const jwt = session?.access_token
  return fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}`, ...(init?.headers ?? {}) },
  })
}

export function HospitalSettingsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const [settings,   setSettings]   = useState<Settings | null>(null)
  const [hours,      setHours]      = useState<DayHours[]>([])
  const [loading,    setLoading]    = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving,     setSaving]     = useState(false)
  const [hospitalName, setHospitalName] = useState('')

  // Local edit buffers for the sections that need an explicit Save rather than
  // the toggle rows' save-on-tap -- text fields would otherwise fire a save
  // request on every keystroke.
  const [editHours, setEditHours] = useState<DayHours[]>([])
  const [address, setAddress] = useState('')
  const [geocoding, setGeocoding] = useState(false)
  const [foundLat, setFoundLat] = useState<number | null>(null)
  const [foundLng, setFoundLng] = useState<number | null>(null)
  const [dailyLimit, setDailyLimit] = useState('')
  const [opdFee, setOpdFee] = useState('')
  const [ambRadius, setAmbRadius] = useState('')
  const [savingHours, setSavingHours] = useState(false)
  const [savingLocation, setSavingLocation] = useState(false)
  const [savingBooking, setSavingBooking] = useState(false)

  const hospitalId = staffProfile?.hospitalId
  const isAdmin = staffProfile?.role === 'hospital_admin'

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) return
    if (!silent) setLoading(true)
    try {
      const [settingsRes, hosRes] = await Promise.all([
        authedFetch(`/api/hospitals/${hospitalId}/settings`),
        supabase.from('hospitals').select('name').eq('id', hospitalId).single(),
      ])
      if (settingsRes.ok) {
        const body = await settingsRes.json()
        setSettings(body.settings)
        setHours(body.hours ?? [])
        setEditHours(body.hours ?? [])
        setDailyLimit(body.settings.daily_booking_limit != null ? String(body.settings.daily_booking_limit) : '')
        setOpdFee(body.settings.opd_fee != null ? String(body.settings.opd_fee) : '')
        setAmbRadius(body.settings.ambulance_service_radius_m != null ? String(body.settings.ambulance_service_radius_m) : '')
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
      const res = await authedFetch(`/api/hospitals/${hospitalId}/settings`, {
        method: 'PATCH', body: JSON.stringify({ settings: patch }),
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

  async function saveHours() {
    if (!hospitalId) return
    setSavingHours(true)
    try {
      const res = await authedFetch(`/api/hospitals/${hospitalId}/settings`, {
        method: 'PATCH', body: JSON.stringify({ hours: editHours }),
      })
      if (!res.ok) { const b = await res.json().catch(() => null); throw new Error(b?.error ?? 'Save failed') }
      setHours(editHours)
      haptics.success()
    } catch (e) {
      haptics.error()
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not save hours')
    } finally {
      setSavingHours(false)
    }
  }

  async function geocodeAddress() {
    if (!address.trim()) return
    setGeocoding(true)
    try {
      const res = await fetch(`${API_URL}/api/geocode?q=${encodeURIComponent(address)}`)
      const data = await res.json() as { lat: string; lon: string } | null
      if (!data) { Alert.alert('Address not found', 'Try a more specific query.'); return }
      setFoundLat(parseFloat(data.lat)); setFoundLng(parseFloat(data.lon))
    } finally { setGeocoding(false) }
  }

  async function saveLocation() {
    if (foundLat == null || foundLng == null) { Alert.alert('Look up an address first'); return }
    setSavingLocation(true)
    try {
      await save({ latitude: foundLat, longitude: foundLng })
      setAddress(''); setFoundLat(null); setFoundLng(null)
    } finally { setSavingLocation(false) }
  }

  async function saveBookingLimits() {
    setSavingBooking(true)
    try {
      await save({
        daily_booking_limit: dailyLimit.trim() ? parseInt(dailyLimit, 10) : null,
        opd_fee: opdFee.trim() ? parseInt(opdFee, 10) : 0,
        ambulance_service_radius_m: ambRadius.trim() ? parseInt(ambRadius, 10) : null,
      })
    } finally { setSavingBooking(false) }
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
          <Text style={[s.title, { color: t.textPrimary }]}>Settings</Text>
        </View>
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

          {/* Booking limits */}
          {isAdmin && (
            <>
              <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 20 }]}>BOOKING LIMITS</Text>
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder, padding: 14 }]}>
                <FieldRow label="Daily booking limit" sub="Leave blank for no limit" theme={t}>
                  <TextInput value={dailyLimit} onChangeText={setDailyLimit} placeholder="No limit" placeholderTextColor={t.textMuted}
                    keyboardType="number-pad" style={[s.smallInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
                </FieldRow>
                <FieldRow label="OPD consultation fee (₦)" theme={t}>
                  <TextInput value={opdFee} onChangeText={setOpdFee} placeholder="0" placeholderTextColor={t.textMuted}
                    keyboardType="number-pad" style={[s.smallInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
                </FieldRow>
                <Button label="Save" onPress={saveBookingLimits} loading={savingBooking} size="sm" style={{ marginTop: 10 }} />
              </View>
            </>
          )}

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

          {/* Ambulance service */}
          {isAdmin && (
            <>
              <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 20 }]}>AMBULANCE SERVICE</Text>
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                <ToggleRow label="Private fleet only" sub="Only your own ambulances serve this hospital, not the shared network"
                  value={settings?.ambulance_private_fleet ?? true} disabled={saving}
                  onToggle={() => toggle('ambulance_private_fleet')} theme={t} />
                <ToggleRow label="24/7 ambulance service" sub="Accept transport requests at any hour"
                  value={settings?.ambulance_service_hours_247 ?? true} disabled={saving}
                  onToggle={() => toggle('ambulance_service_hours_247')} theme={t} last />
                <View style={{ padding: 14, paddingTop: 4 }}>
                  <FieldRow label="Service radius (meters)" sub="Leave blank for no limit" theme={t}>
                    <TextInput value={ambRadius} onChangeText={setAmbRadius} placeholder="No limit" placeholderTextColor={t.textMuted}
                      keyboardType="number-pad" style={[s.smallInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
                  </FieldRow>
                  <Button label="Save" onPress={saveBookingLimits} loading={savingBooking} size="sm" style={{ marginTop: 10 }} />
                </View>
              </View>
            </>
          )}

          {/* Location */}
          {isAdmin && (
            <>
              <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 20 }]}>LOCATION</Text>
              <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder, padding: 14 }]}>
                {settings?.latitude != null && settings?.longitude != null && (
                  <Text style={[s.hintText, { color: t.textMuted, textAlign: 'left', marginBottom: 10 }]}>
                    Current: {settings.latitude.toFixed(4)}, {settings.longitude.toFixed(4)}
                  </Text>
                )}
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput value={address} onChangeText={setAddress} placeholder="Search for your hospital's address" placeholderTextColor={t.textMuted}
                    style={[s.smallInput, { flex: 1, backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
                  <TouchableOpacity onPress={geocodeAddress} disabled={geocoding} style={[s.findBtn, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}>
                    {geocoding ? <ActivityIndicator size="small" color={t.textSecondary} /> : <Text style={{ fontSize: 13, color: t.textSecondary, fontWeight: '600' }}>Find</Text>}
                  </TouchableOpacity>
                </View>
                {foundLat != null && foundLng != null && (
                  <Text style={[s.hintText, { color: t.textMuted, textAlign: 'left', marginTop: 8 }]}>Found: {foundLat.toFixed(4)}, {foundLng.toFixed(4)}</Text>
                )}
                <Button label="Save location" onPress={saveLocation} loading={savingLocation} size="sm" style={{ marginTop: 10 }} />
              </View>
            </>
          )}

          {/* Operating hours */}
          <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 20 }]}>OPERATING HOURS</Text>
          <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            {editHours.map((h, i) => (
              <View key={h.day} style={[s.hoursEditRow, { borderTopColor: t.cardBorder, borderTopWidth: i === 0 ? 0 : 1 }]}>
                <Text style={[s.dayName, { color: t.textPrimary, flex: 1 }]}>{DAYS[h.day]}</Text>
                {h.closed ? (
                  <Text style={[s.closedText, { color: t.textMuted, marginRight: 10 }]}>Closed</Text>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 10 }}>
                    <TextInput value={h.open} onChangeText={v => setEditHours(hs => hs.map(x => x.day === h.day ? { ...x, open: v } : x))}
                      placeholder="08:00" placeholderTextColor={t.textMuted} maxLength={5}
                      style={[s.timeInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
                    <Text style={{ color: t.textMuted, fontSize: 12 }}>–</Text>
                    <TextInput value={h.close} onChangeText={v => setEditHours(hs => hs.map(x => x.day === h.day ? { ...x, close: v } : x))}
                      placeholder="18:00" placeholderTextColor={t.textMuted} maxLength={5}
                      style={[s.timeInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary }]} />
                  </View>
                )}
                <Switch value={!h.closed} onValueChange={v => setEditHours(hs => hs.map(x => x.day === h.day ? { ...x, closed: !v } : x))}
                  trackColor={{ true: t.accentDark, false: t.cardBorder }} />
              </View>
            ))}
            <View style={{ padding: 14, paddingTop: 10 }}>
              <Button label="Save hours" onPress={saveHours} loading={savingHours} size="sm" />
            </View>
          </View>

          {isAdmin && <PayoutAccountCard theme={t} />}
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
        trackColor={{ true: t.accentDark, false: t.cardBorder }} />
    </View>
  )
}

function FieldRow({ label, sub, theme: t, children }: { label: string; sub?: string; theme: any; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={[s.toggleLabel, { color: t.textPrimary, marginBottom: sub ? 2 : 6 }]}>{label}</Text>
      {sub && <Text style={[s.toggleSub, { color: t.textMuted, marginBottom: 6 }]}>{sub}</Text>}
      {children}
    </View>
  )
}

interface Bank { name: string; code: string }
interface PayoutState { bankName: string | null; last4: string | null; subaccountCode: string | null }

function PayoutAccountCard({ theme: t }: { theme: any }) {
  const [current, setCurrent] = useState<PayoutState | null>(null)
  const [disabled, setDisabled] = useState(false)
  const [banks, setBanks] = useState<Bank[]>([])
  const [showBanks, setShowBanks] = useState(false)
  const [bankCode, setBankCode] = useState('')
  const [bankName, setBankName] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [resolvedName, setResolvedName] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch('/api/payments/subaccount?banks=1')
        if (res.status === 503) { setDisabled(true); return }
        if (res.ok) setBanks((await res.json()).banks ?? [])
      } finally { setLoading(false) }
    })()
  }, [])

  // Resolve the account name once both fields look complete, same as the web version.
  useEffect(() => {
    setResolvedName(null)
    if (!/^\d{10}$/.test(accountNumber) || !bankCode) return
    let cancelled = false
    setResolving(true)
    authedFetch(`/api/payments/subaccount?accountNumber=${accountNumber}&bankCode=${bankCode}`)
      .then(async r => {
        if (cancelled) return
        const b = await r.json().catch(() => null)
        if (r.ok) setResolvedName(b.accountName)
      })
      .finally(() => { if (!cancelled) setResolving(false) })
    return () => { cancelled = true }
  }, [accountNumber, bankCode])

  async function save() {
    setSaving(true)
    try {
      const res = await authedFetch('/api/payments/subaccount', { method: 'POST', body: JSON.stringify({ bankCode, accountNumber }) })
      const b = await res.json().catch(() => null)
      if (!res.ok) { Alert.alert('Could not save', b?.error ?? 'Try again.'); return }
      setCurrent({ bankName: b.bankName, last4: b.last4, subaccountCode: b.subaccountCode })
      setAccountNumber(''); setBankCode(''); setBankName(''); setResolvedName(null)
      haptics.success()
    } finally { setSaving(false) }
  }

  function remove() {
    Alert.alert('Remove this payout account?', 'Online payment will be turned off — bookings continue, but patients pay at the desk.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: async () => {
        const res = await authedFetch('/api/payments/subaccount', { method: 'DELETE' })
        if (res.ok) setCurrent({ bankName: null, last4: null, subaccountCode: null })
      } },
    ])
  }

  if (loading) return null

  return (
    <>
      <Text style={[s.sectionLabel, { color: t.textMuted, marginTop: 20 }]}>PAYOUT ACCOUNT</Text>
      <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder, padding: 14 }]}>
        {disabled ? (
          <Text style={[s.toggleSub, { color: t.textMuted }]}>Online payment is not enabled on this platform yet. Patients currently pay at your front desk.</Text>
        ) : current?.subaccountCode ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View>
              <Text style={[s.toggleLabel, { color: t.textPrimary }]}>{current.bankName ?? 'Bank'} •••• {current.last4}</Text>
              <Text style={[s.toggleSub, { color: t.textMuted }]}>Consultation fees settle here directly</Text>
            </View>
            <TouchableOpacity onPress={remove} accessibilityLabel="Remove payout account" hitSlop={8}>
              <Ionicons name="trash-outline" size={16} color={t.danger} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={[s.toggleSub, { color: t.textMuted, marginBottom: 12 }]}>
              Where your share of each payment settles. Queue takes the platform fee; the consultation fee goes straight here.
            </Text>
            <TouchableOpacity onPress={() => setShowBanks(v => !v)} style={[s.smallInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder, justifyContent: 'center' }]}>
              <Text style={{ color: bankName ? t.textPrimary : t.textMuted, fontSize: 13 }}>{bankName || 'Select bank'}</Text>
            </TouchableOpacity>
            {showBanks && (
              <View style={[s.bankList, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}>
                <ScrollView style={{ maxHeight: 180 }}>
                  {banks.map(b => (
                    <TouchableOpacity key={b.code} onPress={() => { setBankCode(b.code); setBankName(b.name); setShowBanks(false) }} style={s.bankRow}>
                      <Text style={{ color: t.textPrimary, fontSize: 13 }}>{b.name}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
            <TextInput value={accountNumber} onChangeText={v => setAccountNumber(v.replace(/\D/g, ''))} placeholder="10-digit account number"
              placeholderTextColor={t.textMuted} keyboardType="number-pad" maxLength={10}
              style={[s.smallInput, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary, marginTop: 8 }]} />
            {resolving && <Text style={[s.hintText, { color: t.textMuted, textAlign: 'left', marginTop: 6 }]}>Verifying…</Text>}
            {resolvedName && (
              <View style={[s.resolvedBanner, { backgroundColor: t.statusOpen.bg, borderColor: t.statusOpen.border }]}>
                <Ionicons name="checkmark-circle" size={14} color={t.statusOpen.text} />
                <Text style={{ color: t.statusOpen.text, fontSize: 12, fontWeight: '600' }}>{resolvedName}</Text>
              </View>
            )}
            <Button label="Save payout account" onPress={save} loading={saving} disabled={!resolvedName} size="sm" style={{ marginTop: 10 }} />
          </>
        )}
      </View>
    </>
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
  hoursEditRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  dayName:     { fontSize: 13, fontWeight: '600' },
  hoursText:   { fontSize: 13 },
  closedText:  { fontSize: 13, fontStyle: 'italic' },
  hintText:    { fontSize: 11, textAlign: 'center', marginTop: 8 },
  smallInput:  { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13 },
  timeInput:   { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, width: 56, textAlign: 'center' },
  findBtn:     { paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bankList:    { borderWidth: 1, borderRadius: 10, marginTop: 4, overflow: 'hidden' },
  bankRow:     { paddingHorizontal: 12, paddingVertical: 10 },
  resolvedBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, padding: 8, marginTop: 8 },
})
