import { useState } from 'react'
import { View, TouchableOpacity, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Text } from '@queue/shared/components/ui/Typography'
import { submitSosTriage } from '@queue/shared/lib/ambulance-api'
import { haptics } from '@queue/shared/lib/haptics'
import { PrimaryButton } from '@queue/shared/components/ui/v3'

// v3.1 "dispatch first": the SOS is already out. These three tap-only questions are
// asked while the crew is being found; answers only ever raise priority.
type Answer = 'yes' | 'no' | 'unsure' | null
const QUESTIONS: { key: 'breathing' | 'awake' | 'bleeding'; text: string }[] = [
  { key: 'breathing', text: 'Are they breathing normally?' },
  { key: 'awake', text: 'Are they awake and talking?' },
  { key: 'bleeding', text: 'Is there heavy bleeding?' },
]
const RED_DEEP = '#7F1D1D'

const toBool = (a: Answer) => (a === 'yes' ? true : a === 'no' ? false : null)

interface Props { navigation: any; route: { params: { requestId: string } } }

export function SosTriageScreen({ navigation, route }: Props) {
  const { requestId } = route.params
  const [answers, setAnswers] = useState<Record<string, Answer>>({ breathing: null, awake: null, bleeding: null })
  const [sending, setSending] = useState(false)

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
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
      <View style={{ backgroundColor: RED_DEEP, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 20, gap: 8 }}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '800' }}>
          SOS sent · finding the nearest crew
        </Text>
        <Text style={{ color: '#FECACA', fontSize: 14, lineHeight: 20 }}>
          We are asking the nearest available crews now. Answer what you can — it helps the crew bring the right kit.
        </Text>
      </View>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }}>
        {QUESTIONS.map(q => (
          <View key={q.key} accessibilityRole="radiogroup" accessibilityLabel={q.text}
            style={{ backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#E3ECEB', padding: 14, gap: 10 }}>
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#0B1B1E' }}>{q.text}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['yes', 'no', 'unsure'] as const).map(opt => {
                const sel = answers[q.key] === opt
                return (
                  <TouchableOpacity key={opt} accessibilityRole="radio" accessibilityState={{ selected: sel }}
                    onPress={() => { haptics.tap(); setAnswers(a => ({ ...a, [q.key]: sel ? null : opt })) }}
                    style={{ flex: 1, minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: sel ? '#0F766E' : '#F8FAFC', borderWidth: sel ? 0 : 1, borderColor: '#E3ECEB' }}>
                    <Text style={{ fontSize: 15, fontWeight: sel ? '700' : '500', color: sel ? '#FFFFFF' : '#0B1B1E' }}>
                      {opt === 'yes' ? 'Yes' : opt === 'no' ? 'No' : 'Not sure'}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        ))}
        <Text style={{ fontSize: 12, color: '#4B5B5E', lineHeight: 18 }}>
          Priority is set from your answers by our protocol. Answers can only raise it, never lower it.
        </Text>
      </ScrollView>
      <View style={{ padding: 20, gap: 8 }}>
        <PrimaryButton label={anyAnswered ? 'Send answers & track' : 'Track the ambulance'} loading={sending}
          onPress={anyAnswered ? send : goTrack} />
      </View>
    </SafeAreaView>
  )
}
