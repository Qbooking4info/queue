import { useState } from 'react'
import { View, Linking, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Field, Btn, Mono, CardLabel,
} from '@queue/shared/components/q'

interface Props { navigation: any }

const FAQS = [
  { q: 'How do I book an appointment?', a: 'Open Find care, or tap a hospital on Home. Choose a doctor or let the hospital assign one, pick a date and arrival window, then confirm.' },
  { q: 'Can I book for a family member?', a: 'Yes. In the booking flow, choose them under "Who is this for?". You add people in Profile, then Dependents.' },
  { q: 'How do I cancel or reschedule?', a: 'Open the appointment and tap Cancel or Reschedule. Cancel before your window and nothing is charged.' },
  { q: 'Why did my number change?', a: 'Emergencies are seen first. When one arrives, everyone behind moves back by one — your place in the ordinary queue is not lost, and the live queue screen says how many were brought forward.' },
  { q: 'What payment methods are accepted?', a: 'Card, bank transfer, USSD, your Queue wallet, and HMO insurance where the hospital accepts it.' },
  { q: 'How does a video visit work?', a: 'Book a virtual visit and join from the appointment when your window comes. The doctor calls you — you do not need to be at the hospital.' },
  { q: 'Is my health data secure?', a: 'Yes. Data is encrypted in transit and at rest. We comply with the NDPR and never share identifiable data without your consent.' },
  { q: 'What is the emergency premium?', a: 'An emergency booking carries a higher fee and places you at the top of today’s queue, whichever way you start it.' },
  { q: 'How do I get a refund?', a: 'A cancelled or rejected booking is refunded to your wallet. If you paid at the hospital, the hospital refunds you directly.' },
]

export function SupportScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user } = useAuth()
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [sending, setSending] = useState(false)

  async function handleSend() {
    if (!query.trim()) return
    setSending(true)
    const { error } = await supabase.from('support_tickets').insert({
      user_id: user?.id ?? null,
      email: user?.email ?? null,
      message: query.trim(),
    })
    setSending(false)
    if (error) {
      haptics.error()
      Alert.alert('Could not send', 'Your message did not go through. Please try again.')
      return
    }
    haptics.success()
    Alert.alert('Message received', 'We will get back to you within 24 hours.')
    setQuery('')
  }

  const open = (url: string) => Linking.openURL(url).catch(() => Alert.alert('Error', 'Could not open that.'))

  return (
    <Screen>
      <AppBar title="Support & help" onBack={() => navigation.goBack()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
        <Body keyboardShouldPersistTaps="handled">
          <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: t.q.ink }}>
              How can we help?
            </Text>
            <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink60, marginTop: 4 }}>
              Our support team is available 8am–10pm daily.
            </Text>
          </View>

          <Card>
            {/* A phone number and an address, shown as text as well as linked:
                a tel: or mailto: link does not open on every device, and a
                number you can read is one you can dial by hand. */}
            <Row
              icon="call-outline"
              title="Call us"
              sub="8am–10pm daily"
              right={<Mono size={13} weight="700">+234 700 78383</Mono>}
              onPress={() => open('tel:+2347007838383')}
            />
            <Hair />
            <Row
              icon="logo-whatsapp" iconTone="green"
              title="WhatsApp"
              sub="Usually the fastest reply"
              chevron
              onPress={() => open('https://wa.me/2347007838383')}
            />
            <Hair />
            <Row
              icon="mail-outline"
              title="Email us"
              sub="support@queueapp.ng"
              chevron
              onPress={() => open('mailto:support@queueapp.ng')}
            />
          </Card>

          <SectionHead title="Send us a message" />
          <Card pad style={{ gap: 12 }}>
            <Field
              label="What has gone wrong?"
              value={query}
              onChangeText={setQuery}
              multiline
              numberOfLines={4}
              placeholder="Tell us what happened, and which booking it was about…"
              style={{ minHeight: 100, textAlignVertical: 'top' }}
            />
            <Btn label="Send message" loading={sending} disabled={!query.trim()} onPress={handleSend} />
          </Card>

          <SectionHead title="Frequently asked" />
          <Card>
            {FAQS.map((f, i) => {
              const on = openFaq === i
              return (
                <View key={f.q}>
                  {i > 0 && <Hair />}
                  <Row
                    icon={on ? 'chevron-down' : 'help-circle-outline'}
                    iconTone="neutral"
                    title={f.q}
                    onPress={() => setOpenFaq(on ? null : i)}
                  />
                  {on && (
                    <View style={{ paddingHorizontal: 14, paddingBottom: 14, paddingLeft: 62 }}>
                      <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink70 }}>{f.a}</Text>
                    </View>
                  )}
                </View>
              )
            })}
          </Card>

          <View style={{ alignItems: 'center', paddingTop: 20, gap: 2 }}>
            <CardLabel>Queue</CardLabel>
            <Mono size={11} color={t.q.ink60}>v1.0.0 · queueapp.ng · Made in Nigeria</Mono>
          </View>
        </Body>
      </KeyboardAvoidingView>
    </Screen>
  )
}
