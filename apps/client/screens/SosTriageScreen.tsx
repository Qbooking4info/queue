import { useEffect, useState } from 'react'
import { View, Pressable, Linking } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { submitSosTriage } from '@queue/shared/lib/ambulance-api'
import { haptics } from '@queue/shared/lib/haptics'
import {
  Screen, AppBar, Body, Card, Journey, Notice, Btn, BottomBar, Mono, CardLabel,
} from '@queue/shared/components/q'

// "Dispatch first": the SOS is already out. These three tap-only questions are
// asked while the crew is being found; answers only ever raise priority.
type Answer = 'yes' | 'no' | 'unsure' | null

const QUESTIONS: { key: 'breathing' | 'awake' | 'bleeding'; text: string }[] = [
  { key: 'awake', text: 'Is the person awake and talking?' },
  { key: 'breathing', text: 'Are they breathing normally?' },
  { key: 'bleeding', text: 'Any heavy bleeding?' },
]

const toBool = (a: Answer) => (a === 'yes' ? true : a === 'no' ? false : null)

interface Props { navigation: any; route: { params: { requestId: string } } }

export function SosTriageScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { requestId } = route.params
  const [answers, setAnswers] = useState<Record<string, Answer>>({ breathing: null, awake: null, bleeding: null })
  const [sending, setSending] = useState(false)
  const [elapsed, setElapsed] = useState(0)

  // How long the search has been running. A screen that says "searching" with
  // no clock on it is indistinguishable from a screen that has frozen.
  useEffect(() => {
    const id = setInterval(() => setElapsed(n => n + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`
  const anyAnswered = Object.values(answers).some(a => a !== null)
  const goTrack = () => navigation.replace('AmbulanceTracking', { requestId })

  async function send() {
    setSending(true)
    try {
      await submitSosTriage({
        requestId,
        breathingNormally: toBool(answers.breathing),
        awake: toBool(answers.awake),
        heavyBleeding: toBool(answers.bleeding),
      })
    } catch { /* the crew is already coming; never block tracking on this */ }
    goTrack()
  }

  return (
    <Screen>
      <AppBar title="SOS sent" sub={requestId} />

      <Body>
        <Journey
          steps={['Searching', 'Accepted', 'On the way', 'Arrived', 'To hospital']}
          activeIndex={0}
        />

        <Notice tone="red" icon="radio-outline">
          Your SOS is out and we are asking the nearest crews now. Answer what you can while we search —
          it goes straight to the crew.
        </Notice>

        {QUESTIONS.map(q => (
          <View key={q.key} style={{ marginBottom: 10 }}>
            <Card pad>
              <View accessibilityRole="radiogroup" accessibilityLabel={q.text} style={{ gap: 10 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: t.q.ink }}>{q.text}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {(['yes', 'no', 'unsure'] as const).map(opt => {
                    const on = answers[q.key] === opt
                    return (
                      <Pressable
                        key={opt}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        onPress={() => { haptics.tap(); setAnswers(a => ({ ...a, [q.key]: on ? null : opt })) }}
                        style={{
                          flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 14,
                          backgroundColor: on ? t.q.primary : t.q.surface,
                          borderWidth: 1, borderColor: on ? t.q.primary : t.q.line,
                        }}>
                        <Text style={{ fontSize: 15, fontWeight: on ? '700' : '500', color: on ? t.q.onPrimary : t.q.ink }}>
                          {opt === 'yes' ? 'Yes' : opt === 'no' ? 'No' : 'Not sure'}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            </Card>
          </View>
        ))}

        <View style={{ paddingHorizontal: 20, paddingTop: 6 }}>
          <CardLabel>How priority is set</CardLabel>
          <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60, marginTop: 4 }}>
            Priority comes from your answers, by protocol. Answers can only raise it, never lower it.
          </Text>
        </View>
      </Body>

      <BottomBar meta={
        <>
          <Mono size={12} color={t.q.red} weight="700">Searching</Mono>
          <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
          <Mono size={12}>{clock}</Mono>
        </>
      }>
        <Btn label="Call 112" variant="secondary" icon="call-outline"
          onPress={() => Linking.openURL('tel:112').catch(() => {})} />
        <Btn
          grow
          label={anyAnswered ? 'Send answers & track' : 'Track the ambulance'}
          loading={sending}
          onPress={anyAnswered ? send : goTrack}
        />
      </BottomBar>
    </Screen>
  )
}
