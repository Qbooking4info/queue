import { useState, useEffect } from 'react'
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { supabase } from '@queue/shared/lib/supabase'

interface Insurance {
  provider: string; plan_name: string; member_id: string; group_number: string
}

const PROVIDERS = ['NHIS', 'Hygeia HMO', 'Leadway Health', 'AXA Mansard', 'Reliance HMO', 'Avon HMO', 'Other']

export function InsuranceScreen({ navigation }: { navigation: any }) {
  const { theme: t } = useTheme()
  const [insurance, setInsurance] = useState<Insurance>({ provider: '', plan_name: '', member_id: '', group_number: '' })
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [userId, setUserId]       = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: profile } = await supabase.from('users').select('id').eq('auth_id', user.id).single()
        if (!profile) return
        setUserId(profile.id)
        const { data } = await supabase
          .from('user_insurance')
          .select('provider,plan_name,member_id,group_number')
          .eq('user_id', profile.id)
          .single()
        if (data) setInsurance(data as Insurance)
        // PGRST116 (no rows) is expected for new users — not an error
      } catch {
        // Network error — show empty form
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave() {
    if (!userId) { Alert.alert('Error', 'Still loading. Please wait.'); return }
    if (!insurance.provider) { Alert.alert('Error', 'Please select an insurance provider.'); return }
    if (!insurance.member_id.trim()) { Alert.alert('Error', 'Please enter your Member ID.'); return }
    setSaving(true)
    const { error } = await supabase.from('user_insurance').upsert({
      user_id:      userId,
      provider:     insurance.provider,
      plan_name:    insurance.plan_name || null,
      member_id:    insurance.member_id.trim(),
      group_number: insurance.group_number || null,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) {
      Alert.alert('Save Failed', error.message)
    } else {
      Alert.alert('Saved', 'Your insurance details have been saved.')
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: t.canvasBg }]}>
      <View style={[styles.header, { borderBottomColor: t.cardBorder }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={[styles.backBtn, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Ionicons name="arrow-back" size={18} color={t.accent} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: t.textPrimary }]}>Insurance Details</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {loading ? (
          <Text style={[styles.placeholder, { color: t.textMuted }]}>Loading…</Text>
        ) : (
          <>
            <View style={[styles.infoBox, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
              <Ionicons name="shield-outline" size={20} color="rgba(255,255,255,0.3)" style={{ marginBottom: 8 }} />
              <Text style={[styles.infoText, { color: t.textSecondary }]}>
                Add your HMO or insurance details so hospitals can verify your coverage when booking appointments.
              </Text>
            </View>

            <Text style={[styles.label, { color: t.textSecondary }]}>Insurance Provider</Text>
            <View style={styles.chips}>
              {PROVIDERS.map(p => {
                const active = insurance.provider === p
                return (
                  <TouchableOpacity key={p} onPress={() => setInsurance(prev => ({ ...prev, provider: p }))}
                    style={[styles.chip, { borderColor: active ? t.accent : t.cardBorder, backgroundColor: active ? t.accentBg : 'transparent' }]}>
                    <Text style={[styles.chipText, { color: active ? t.accent : t.textSecondary }]}>{p}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={[styles.label, { color: t.textSecondary }]}>Plan Name</Text>
            <TextInput
              value={insurance.plan_name}
              onChangeText={v => setInsurance(prev => ({ ...prev, plan_name: v }))}
              placeholder="e.g. Gold Plan, Comprehensive"
              placeholderTextColor={t.textMuted}
              style={[styles.input, { backgroundColor: t.cardBg, borderColor: t.inputBorder, color: t.textPrimary }]}
            />

            <Text style={[styles.label, { color: t.textSecondary }]}>Member ID *</Text>
            <TextInput
              value={insurance.member_id}
              onChangeText={v => setInsurance(prev => ({ ...prev, member_id: v }))}
              placeholder="Your member/enrollee ID"
              placeholderTextColor={t.textMuted}
              autoCapitalize="characters"
              style={[styles.input, { backgroundColor: t.cardBg, borderColor: t.inputBorder, color: t.textPrimary }]}
            />

            <Text style={[styles.label, { color: t.textSecondary }]}>Group / Policy Number</Text>
            <TextInput
              value={insurance.group_number}
              onChangeText={v => setInsurance(prev => ({ ...prev, group_number: v }))}
              placeholder="Optional"
              placeholderTextColor={t.textMuted}
              style={[styles.input, { backgroundColor: t.cardBg, borderColor: t.inputBorder, color: t.textPrimary }]}
            />

            <TouchableOpacity onPress={handleSave} disabled={saving} style={[styles.saveBtn, { backgroundColor: t.accent, opacity: saving ? 0.6 : 1 }]}>
              <Text style={[styles.saveBtnText, { color: t.id === 'forest' ? '#061208' : '#fff' }]}>{saving ? 'Saving…' : 'Save Insurance Details'}</Text>
            </TouchableOpacity>
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// Layout-only (theme-independent) values -- colors are applied as inline overrides
// above, since this StyleSheet is module-scope and useTheme() is a hook that can only
// be called inside the component. Numbers match packages/shared/contexts/ThemeContext's
// spacing/radius/font scale as closely as the original design allowed (a couple were
// between two scale steps and got rounded to the nearest one, e.g. 17->16, 16->14).
const styles = StyleSheet.create({
  safe:          { flex: 1 },
  header:        { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1 },
  backBtn:       { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title:         { fontSize: 16, fontWeight: '800', letterSpacing: -0.4 },
  scroll:        { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  placeholder:   { textAlign: 'center', paddingVertical: 40, fontSize: 12 },
  infoBox:       { borderWidth: 1, borderRadius: 20, padding: 16, marginBottom: 20 },
  infoText:      { fontSize: 12, lineHeight: 20 },
  label:         { fontSize: 11, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8, marginTop: 12 },
  chips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  chipText:      { fontSize: 12, fontWeight: '600' },
  input:         { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 13, fontSize: 14 },
  saveBtn:       { borderRadius: 20, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  saveBtnText:   { fontSize: 14, fontWeight: '800' },
})
