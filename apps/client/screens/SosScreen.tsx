import { useState } from 'react'
import { View, Pressable, Linking } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { getFreshFix, geocodePickup } from '@queue/shared/lib/fresh-location'
import { supabase } from '@queue/shared/lib/supabase'
import { requestAmbulance } from '@queue/shared/lib/ambulance-api'
import { haptics } from '@queue/shared/lib/haptics'
import { HoldButton } from '@queue/shared/components/ui/v3'
import {
  Screen, AppBar, Body, Card, CardLabel, Field, Notice, Btn, BottomBar, IconBtn,
} from '@queue/shared/components/q'

// "Dispatch first": one hold sends the request with the caller's location.
// Triage is asked while the crew is being found, never before. Until the server
// can accept triage answers after the fact, an SOS dispatches as triage 2 / ALS
// -- the safe default that never under-sends a vehicle.
const WHO = ['Me', 'Family member', 'Someone else'] as const
const RELATIONSHIP: Record<typeof WHO[number], 'self' | 'relative' | 'bystander'> = {
  'Me': 'self', 'Family member': 'relative', 'Someone else': 'bystander',
}

interface Props { navigation: any }

export function SosScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
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
        ? 'Queue cannot see your location. Type where you are below, allow location in Settings, or call 112 or 767 now.'
        : 'We could not get your location. Type where you are below, or call 112 or 767 now.')
      setHoldKey(k => k + 1)
      return
    }
    await dispatch(located.fix)
  }

  // Typed-address fallback. The words the caller typed go to the crew as the
  // pickup address; the geocoded point only steers dispatch to the right area.
  async function sendTyped() {
    haptics.heavy()
    const address = typedAddress.trim()
    setState('locating')
    const { data: { session } } = await supabase.auth.getSession()
    const point = session ? await geocodePickup(address, session.access_token) : null
    if (!point) {
      setState('error')
      setError('We could not find that place. Add the street and area (for example "12 Allen Ave, Ikeja"), or call 112 or 767 now.')
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
        ...(typed ? {
          pickupAddress: typed,
          pickupNotes: 'GPS unavailable: location typed by caller, pin is approximate. Call the caller to confirm.',
        } : {}),
      })
      navigation.replace('SosTriage', { requestId: req.id })
    } catch (e) {
      setState('error')
      setError(e instanceof Error ? e.message : 'The request did not go through.')
      setHoldKey(k => k + 1)
    }
  }

  const busy = state === 'locating' || state === 'sending'

  return (
    // The one screen that keeps a colour of its own. Everything else on the
    // emergency path is ordinary canvas with red accents; this is the page
    // somebody opens in a panic, so the whole surface says what it is.
    <Screen style={{ backgroundColor: t.q.redBg }}>
      <AppBar
        title="Emergency SOS"
        onBack={undefined}
        right={<IconBtn name="close" label="Close" color={t.q.red} onPress={() => navigation.goBack()} />}
      />

      <Body>
        <View style={{ paddingHorizontal: 20, paddingBottom: 14 }}>
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink70 }}>
            We find the nearest ambulance crew and share your location with them. If someone is not
            breathing, call 112 now as well.
          </Text>
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 8 }}>
          <CardLabel>Who needs help?</CardLabel>
        </View>
        <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16 }}>
          {WHO.map(w => {
            const on = w === who
            return (
              <Pressable
                key={w}
                onPress={() => { haptics.tap(); setWho(w) }}
                accessibilityRole="radio" accessibilityState={{ selected: on }}
                style={{
                  flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center',
                  paddingHorizontal: 6, borderRadius: 14,
                  backgroundColor: on ? t.q.red : t.q.surface,
                  borderWidth: 1, borderColor: on ? t.q.red : t.q.line,
                }}>
                <Text style={{ fontSize: 13, fontWeight: on ? '700' : '500', color: on ? '#FFFFFF' : t.q.ink, textAlign: 'center' }}>
                  {w}
                </Text>
              </Pressable>
            )
          })}
        </View>

        <View style={{ alignItems: 'center', gap: 14, paddingTop: 28, paddingHorizontal: 24 }}>
          {busy ? (
            <View style={{ alignItems: 'center', gap: 8, paddingVertical: 56 }}>
              <Text accessibilityLiveRegion="polite" style={{ fontSize: 22, fontWeight: '800', color: t.q.red }}>
                {state === 'locating' ? 'Finding your location…' : 'Sending SOS…'}
              </Text>
              <Text style={{ fontSize: 14, color: t.q.ink70 }}>
                {state === 'locating' ? 'This takes a few seconds' : 'Sharing your location with nearby crews'}
              </Text>
            </View>
          ) : (
            <HoldButton key={holdKey} label="SOS" onComplete={send} />
          )}
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink70, textAlign: 'center', maxWidth: 320 }}>
            Hold for two seconds. Letting go early sends nothing.
          </Text>
        </View>

        {state === 'error' && (
          <>
            <Notice tone="red">{error}</Notice>
            {noFix && (
              <Card pad style={{ gap: 10 }}>
                <Field
                  label="Where are you?"
                  value={typedAddress}
                  onChangeText={setTypedAddress}
                  placeholder="Street, area or landmark"
                  autoCapitalize="words"
                />
                <Btn
                  label="Send SOS to this place"
                  variant="danger"
                  disabled={typedAddress.trim().length < 3}
                  onPress={sendTyped}
                />
              </Card>
            )}
            {needsSettings && (
              <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
                <Btn label="Open settings" variant="secondary" small onPress={() => Linking.openSettings()} />
              </View>
            )}
          </>
        )}
      </Body>

      <BottomBar>
        <Btn grow label="Call 112" variant="danger" icon="call"
          onPress={() => Linking.openURL('tel:112').catch(() => {})} />
        <Btn grow label="Call 767" variant="secondary" icon="call-outline"
          onPress={() => Linking.openURL('tel:767').catch(() => {})} />
      </BottomBar>
    </Screen>
  )
}
