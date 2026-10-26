import { useState } from 'react'
import { View, TouchableOpacity, Linking, ScrollView } from 'react-native'
import { Text, TextInput } from '@queue/shared/components/ui/Typography'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { getFreshFix, geocodePickup } from '@queue/shared/lib/fresh-location'
import { supabase } from '@queue/shared/lib/supabase'
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
  // No GPS fix: the caller can type where they are instead (geocoded, coarse).
  const [noFix, setNoFix] = useState(false)
  const [typedAddress, setTypedAddress] = useState('')
  const [error, setError] = useState('')
  const [holdKey, setHoldKey] = useState(0)

  async function send() {
    haptics.heavy()
    setNeedsSettings(false)
    setNoFix(false)
    // A reading taken now, not LocationContext's: that one is captured once when
    // the app opens and could put the pickup kilometres from the patient.
    setState('locating')
    const located = await getFreshFix()
    if (!located.ok) {
      setState('error')
      setNeedsSettings(located.reason === 'permission_denied')
      setNoFix(true)
      setError(located.reason === 'permission_denied'
        ? "Queue can't see your location. Type where you are below, allow location in Settings, or call 112 or 767 now."
        : "We couldn't get your location. Type where you are below, or call 112 or 767 now.")
      setHoldKey(k => k + 1)
      return
    }
    await dispatch(located.fix)
  }

  // Typed-address fallback. The words the caller typed go to the crew as the pickup
  // address; the geocoded point only steers dispatch to the right area.
  async function sendTyped() {
    haptics.heavy()
    const address = typedAddress.trim()
    setState('locating')
    const { data: { session } } = await supabase.auth.getSession()
    const point = session ? await geocodePickup(address, session.access_token) : null
    if (!point) {
      setState('error')
      setError("We couldn't find that place. Add the street and area (e.g. \"12 Allen Ave, Ikeja\"), or call 112 or 767 now.")
      return
    }
    await dispatch(point, address)
  }

  async function dispatch(coords: { latitude: number; longitude: number }, typed?: string) {
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
        ...(typed ? { pickupAddress: typed, pickupNotes: 'GPS unavailable: location typed by caller, pin is approximate. Call the caller to confirm.' } : {}),
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
              {noFix && (
                <View style={{ marginTop: 10, gap: 8 }}>
                  <TextInput
                    value={typedAddress}
                    onChangeText={setTypedAddress}
                    placeholder="Street, area or landmark"
                    accessibilityLabel="Where are you?"
                    autoCapitalize="words"
                    style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FFFFFF', paddingHorizontal: 12, fontSize: 15, color: RED_DEEP }}
                  />
                  <TouchableOpacity onPress={sendTyped} disabled={typedAddress.trim().length < 3}
                    accessibilityRole="button" accessibilityState={{ disabled: typedAddress.trim().length < 3 }}
                    style={{ minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                      backgroundColor: typedAddress.trim().length < 3 ? '#FCA5A5' : '#B91C1C' }}>
                    <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>Send SOS to this place</Text>
                  </TouchableOpacity>
                </View>
              )}
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
