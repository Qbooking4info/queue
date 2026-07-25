import { useState, useEffect } from 'react'
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { dark as t, spacing, font, radius } from '../lib/theme'

interface Insurance {
  provider: string; plan_name: string; member_id: string; group_number: string
}

const PROVIDERS = ['NHIS', 'Hygeia HMO', 'Leadway Health', 'AXA Mansard', 'Reliance HMO', 'Avon HMO', 'Other']

export function InsuranceScreen({ navigation }: { navigation: any }) {
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
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={18} color={t.accent} />
        </TouchableOpacity>
        <Text style={styles.title}>Insurance Details</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {loading ? (
          <Text style={styles.placeholder}>Loading…</Text>
        ) : (
          <>
            <View style={styles.infoBox}>
              <Ionicons name="shield-outline" size={20} color="rgba(255,255,255,0.3)" style={{ marginBottom: 8 }} />
              <Text style={styles.infoText}>
                Add your HMO or insurance details so hospitals can verify your coverage when booking appointments.
              </Text>
            </View>

            <Text style={styles.label}>Insurance Provider</Text>
            <View style={styles.chips}>
              {PROVIDERS.map(p => (
                <TouchableOpacity key={p} onPress={() => setInsurance(prev => ({ ...prev, provider: p }))}
                  style={[styles.chip, insurance.provider === p && styles.chipActive]}>
                  <Text style={[styles.chipText, insurance.provider === p && styles.chipTextActive]}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Plan Name</Text>
            <TextInput
              value={insurance.plan_name}
              onChangeText={v => setInsurance(prev => ({ ...prev, plan_name: v }))}
              placeholder="e.g. Gold Plan, Comprehensive"
              placeholderTextColor={t.textMuted}
              style={styles.input}
            />

            <Text style={styles.label}>Member ID *</Text>
            <TextInput
              value={insurance.member_id}
              onChangeText={v => setInsurance(prev => ({ ...prev, member_id: v }))}
              placeholder="Your member/enrollee ID"
              placeholderTextColor={t.textMuted}
              autoCapitalize="characters"
              style={styles.input}
            />

            <Text style={styles.label}>Group / Policy Number</Text>
            <TextInput
              value={insurance.group_number}
              onChangeText={v => setInsurance(prev => ({ ...prev, group_number: v }))}
              placeholder="Optional"
              placeholderTextColor={t.textMuted}
              style={styles.input}
            />

            <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Insurance Details'}</Text>
            </TouchableOpacity>
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe:          { flex: 1, backgroundColor: t.bg },
  header:        { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.border },
  backBtn:       { width: 36, height: 36, borderRadius: 10, backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
  title:         { fontSize: font.lg, fontWeight: '800', color: t.text, letterSpacing: -0.4 },
  scroll:        { flex: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  placeholder:   { color: t.textMuted, textAlign: 'center', paddingVertical: 40, fontSize: font.sm },
  infoBox:       { backgroundColor: t.accentMuted, borderWidth: 1, borderColor: t.accentBorder, borderRadius: radius.xl, padding: spacing.lg, marginBottom: spacing.xl },
  infoText:      { fontSize: font.sm, color: t.textSub, lineHeight: 20 },
  label:         { fontSize: font.xs, fontWeight: '700', color: t.textSub, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8, marginTop: spacing.md },
  chips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  chip:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: t.border },
  chipActive:    { borderColor: t.accent, backgroundColor: t.accentMuted },
  chipText:      { fontSize: font.sm, color: t.textSub, fontWeight: '600' },
  chipTextActive:{ color: t.accent },
  input:         { backgroundColor: t.bgCard, borderWidth: 1, borderColor: t.borderMed, borderRadius: radius.lg, paddingHorizontal: spacing.lg, paddingVertical: 13, fontSize: font.base, color: t.text },
  saveBtn:       { backgroundColor: t.accent, borderRadius: radius.lg, paddingVertical: 15, alignItems: 'center', marginTop: spacing.xl },
  saveBtnText:   { fontSize: font.base, fontWeight: '800', color: '#060A07' },
})
