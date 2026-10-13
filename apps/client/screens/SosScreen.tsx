import { useState } from 'react'
import { View, TouchableOpacity, Linking, ScrollView } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { getFreshFix } from '@queue/shared/lib/fresh-location'
import { requestAmbulance } from '@queue/shared/lib/ambulance-api'
import { haptics } from '@queue/shared/lib/haptics'
import { HoldButton } from '@queue/shared/components/ui/v3'

// v3.1 "dispatch first": one hold sends the request with the caller's location.
// Triage is asked while the crew is being found, never before. Until the server can
// accept triage answers after the fact, an SOS dispatches as triage 2 / ALS -- the
// safe default that never under-sends a vehicle.
const WHO = ['Me', 'Family member', 'Someone else'] as const
const RELATIONSHIP: Record<typeof WHO[number], 'self' | 'relative' | 'bystander'> = { 'Me': 'self', 'Family member': 'relative', 'Someone else': 'bystander' }

const RED_DEEP = '#7F1D1D'

interface Props { navigation: any }

export function SosScreen({ navigation }: Props) {
  const { user } = useAuth()
  const [who, setWho] = useState<typeof WHO[number]>('Me')
  const [state, setState] = useState<'idle' | 'locating' | 'sending' | 'error'>('idle')
  const [needsSettings, setNeedsSettings] = useState(false)
  const [error, setError] = useState('')
  const [holdKey, setHoldKey] = useState(0)

  async function send() {
    haptics.heavy()
    setNeedsSettings(false)
    // A reading taken now, not LocationContext's: that one is captured once when
    // the app opens and could put the pickup kilometres from the patient.
    setState('locating')
    const located = await getFreshFix()
    if (!located.ok) {
      setState('error')
      setNeedsSettings(located.reason === 'permission_denied')
      setError(located.reason === 'permission_denied'
        ? 'Queue needs location permission to send a crew to you. Allow it in Settings, or call 112 or 767 now.'
        : "We couldn't get your location. Turn on location (GPS) and try again, or call 112 or 767 now.")
      setHoldKey(k => k + 1)
      return
    }
    const coords = located.fix
    setState('sending')
    try {
      const { request: req } = await requestAmbulance({
        requestType: 'emergency',
        triageLevel: 2,
        requiredTier: 'ALS',
        lat: coords.latitude,
        lng: coords.longitude,
        contactPhone: user?.phone ?? undefined,
        requesterRelationship: RELATIONSHIP[who],
        symptomDescription: 'SOS',
      })
      navigation.replace('SosTriage', { requestId: req.id })
    } catch (e) {
      setState('error')
      setError(e instanceof Error ? e.message : 'The request did not go through.')
      setHoldKey(k => k + 1)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FFF5F5' }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Close"
            style={{ width: 48, height: 48, borderRadius: 99, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#FECACA', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="close" size={20} color={RED_DEEP} />
          </TouchableOpacity>
          <Text accessibilityRole="header" style={{ fontSize: 18, fontWeight: '800', color: RED_DEEP }}>Emergency SOS</Text>
        </View>

        <View style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: RED_DEEP }}>Who needs help?</Text>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
            {WHO.map(w => {
              const sel = w === who
              return (
                <TouchableOpacity key={w} onPress={() => { haptics.tap(); setWho(w) }} accessibilityRole="radio" accessibilityState={{ selected: sel }}
                  style={{ flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
                    backgroundColor: sel ? RED_DEEP : '#FFFFFF', borderWidth: sel ? 0 : 1, borderColor: '#FECACA' }}>
                  <Text style={{ fontSize: 13, fontWeight: sel ? '700' : '500', color: sel ? '#FFFFFF' : RED_DEEP, textAlign: 'center' }}>{w}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <View style={{ alignItems: 'center', gap: 12, marginTop: 8 }}>
          {state === 'locating' || state === 'sending' ? (
            <View style={{ alignItems: 'center', gap: 10, paddingVertical: 60 }}>
              <Text style={{ fontSize: 22, fontWeight: '800', color: RED_DEEP }}>{state === 'locating' ? 'Finding your location…' : 'Sending SOS…'}</Text>
              <Text style={{ fontSize: 14, color: RED_DEEP }}>{state === 'locating' ? 'This takes a few seconds' : 'Sharing your location with nearby crews'}</Text>
            </View>
          ) : (
            <HoldButton key={holdKey} label="SOS" onComplete={send} />
          )}
          <Text style={{ fontSize: 14, color: RED_DEEP, textAlign: 'center', lineHeight: 20, maxWidth: 320 }}>
            Hold for 2 seconds. Letting go early sends nothing. We share your location as soon as it sends.
          </Text>
          {state === 'error' && (
            <View accessibilityRole="alert" style={{ alignSelf: 'stretch', backgroundColor: '#FEE2E2', borderRadius: 12, padding: 12 }}>
              <Text style={{ fontSize: 14, color: RED_DEEP, lineHeight: 20 }}>{error}</Text>
              {needsSettings && (
                <TouchableOpacity onPress={() => Linking.openSettings()} accessibilityRole="button" style={{ marginTop: 8, minHeight: 44, justifyContent: 'center' }}>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: RED_DEEP, textDecorationLine: 'underline' }}>Open settings</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        <View style={{ marginTop: 'auto', flexDirection: 'row', gap: 8 }}>
          {[['112', 'Call 112'], ['767', 'Lagos 767']].map(([num, label]) => (
            <TouchableOpacity key={num} onPress={() => Linking.openURL(`tel:${num}`)} accessibilityRole="button" accessibilityLabel={label}
              style={{ flex: 1, height: 52, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#B91C1C', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: '#B91C1C' }}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
