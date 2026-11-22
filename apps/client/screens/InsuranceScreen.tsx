import { useState, useEffect } from 'react'
import { View, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { supabase } from '@queue/shared/lib/supabase'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Field, Notice, Btn,
  BottomBar, Mono,
} from '@queue/shared/components/q'

interface Insurance {
  provider: string; plan_name: string; member_id: string; group_number: string
}

const PROVIDERS = ['NHIS', 'Hygeia HMO', 'Leadway Health', 'AXA Mansard', 'Reliance HMO', 'Avon HMO', 'Other']

export function InsuranceScreen({ navigation }: { navigation: any }) {
  const { theme: t } = useTheme()
  const [insurance, setInsurance] = useState<Insurance>({ provider: '', plan_name: '', member_id: '', group_number: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

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
        // PGRST116 (no rows) is expected for a new user, not an error.
      } catch {
        // Network error -- show the empty form rather than a dead screen.
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSave() {
    if (!userId) { Alert.alert('Still loading', 'Give it a moment and try again.'); return }
    if (!insurance.provider) { Alert.alert('Provider needed', 'Please choose your insurance provider.'); return }
    if (!insurance.member_id.trim()) { Alert.alert('Member ID needed', 'Please enter your member ID.'); return }
    setSaving(true)
    const { error } = await supabase.from('user_insurance').upsert({
      user_id: userId,
      provider: insurance.provider,
      plan_name: insurance.plan_name || null,
      member_id: insurance.member_id.trim(),
      group_number: insurance.group_number || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    setSaving(false)
    if (error) Alert.alert('Could not save', error.message)
    else Alert.alert('Saved', 'Your insurance details are saved.')
  }

  return (
    <Screen>
      <AppBar title="Insurance / HMO" onBack={() => navigation.goBack()} />

      {loading ? (
        <ActivityIndicator color={t.q.primary} style={{ marginTop: 40 }} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
          <Body keyboardShouldPersistTaps="handled">
            <Notice tone="teal" icon="shield-checkmark-outline">
              Hospitals that accept your HMO show &quot;Accepts HMO&quot; in search. Pre-authorisation can take
              up to an hour, so add these details before you need them.
            </Notice>

            <SectionHead title="Provider" />
            <Card>
              {PROVIDERS.map((p, i) => {
                const on = insurance.provider === p
                return (
                  <View key={p}>
                    {i > 0 && <Hair />}
                    <Row
                      icon="shield-outline"
                      iconTone={on ? 'teal' : 'neutral'}
                      tint={on}
                      title={p}
                      right={on ? <Mono size={11} color={t.q.primary}>SELECTED</Mono> : undefined}
                      onPress={() => setInsurance(s => ({ ...s, provider: p }))}
                    />
                  </View>
                )
              })}
            </Card>

            <SectionHead title="Your cover" />
            <View style={{ paddingHorizontal: 16, gap: 14 }}>
              <Field
                label="Plan name"
                value={insurance.plan_name}
                onChangeText={v => setInsurance(s => ({ ...s, plan_name: v }))}
                placeholder="e.g. Gold Plan, Comprehensive"
              />
              <Field
                label="Member ID"
                value={insurance.member_id}
                onChangeText={v => setInsurance(s => ({ ...s, member_id: v }))}
                placeholder="As printed on your card"
                autoCapitalize="characters"
              />
              <Field
                label="Group / policy number"
                hint="Optional — employers and family plans usually have one"
                value={insurance.group_number}
                onChangeText={v => setInsurance(s => ({ ...s, group_number: v }))}
                placeholder=""
                autoCapitalize="characters"
              />
            </View>

            <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
              <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
                These details are shared with a hospital only when you book there.
              </Text>
            </View>
          </Body>

          <BottomBar>
            <Btn grow label="Save insurance details" loading={saving} onPress={handleSave} />
          </BottomBar>
        </KeyboardAvoidingView>
      )}
    </Screen>
  )
}
