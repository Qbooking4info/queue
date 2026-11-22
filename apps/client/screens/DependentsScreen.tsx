import { useState, useCallback } from 'react'
import { View, ActivityIndicator, Modal, Pressable, KeyboardAvoidingView } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Field, Chip, Btn, Empty,
  IconBtn, MONO,
} from '@queue/shared/components/q'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { haptics }  from '@queue/shared/lib/haptics'
import {
  getLinkedDependents, lookupPatientByCode, linkDependent, unlinkDependent,
  type LinkedDependent, type ManagedByCaretaker,
} from '@queue/shared/lib/api'

interface Props { navigation: any }

const RELATIONSHIPS: { label: string; value: string }[] = [
  { label: 'Spouse',  value: 'spouse'  },
  { label: 'Child',   value: 'child'   },
  { label: 'Parent',  value: 'parent'  },
  { label: 'Sibling', value: 'sibling' },
  { label: 'Other',   value: 'other'   },
]

const RELATION_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  spouse: 'heart-outline', child: 'happy-outline', parent: 'people-outline', sibling: 'body-outline', other: 'person-outline',
}

// Matches web/src/lib/dashboard-utils.ts's calcAge exactly.
function calcAge(dob: string | null | undefined): number | null {
  if (!dob) return null
  return Math.floor((Date.now() - new Date(dob).getTime()) / 31_557_600_000)
}

export function DependentsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user, switchToDependent } = useAuth()

  const [managing,  setManaging]  = useState<LinkedDependent[]>([])
  const [managedBy, setManagedBy] = useState<ManagedByCaretaker | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [unlinking, setUnlinking] = useState<string | null>(null)
  const [switching, setSwitching] = useState<string | null>(null)

  // Link-by-ID modal state. linkMode 'caretaker' = this account manages the
  // looked-up account (the original flow, via header's "+ Link by ID"). 'dependent'
  // = the looked-up account becomes THIS account's caretaker, via "+ Add a
  // caretaker" below -- same modal, opposite direction.
  const [linkOpen,     setLinkOpen]     = useState(false)
  const [linkMode,     setLinkMode]     = useState<'caretaker' | 'dependent'>('caretaker')
  const [step,         setStep]         = useState<'code' | 'confirm'>('code')
  const [code,         setCode]         = useState('')
  const [resolvedName, setResolvedName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [busy,         setBusy]         = useState(false)
  const [error,        setError]        = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { managing, managedBy } = await getLinkedDependents()
    setManaging(managing)
    setManagedBy(managedBy)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  function openLink(mode: 'caretaker' | 'dependent' = 'caretaker') {
    setLinkMode(mode)
    setStep('code'); setCode(''); setResolvedName(''); setRelationship(''); setError('')
    setLinkOpen(true)
  }

  async function handleLookup() {
    if (!code.trim()) { setError('Patient ID is required.'); return }
    setBusy(true); setError('')
    const result = await lookupPatientByCode(code, linkMode)
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    if (result.alreadyLinked) {
      setError(linkMode === 'dependent' ? "You're already linked to a caretaker." : 'This account is already linked to a caretaker.')
      return
    }
    setResolvedName(result.fullName)
    setStep('confirm')
  }

  async function handleConfirmLink() {
    if (!relationship) { setError('Please select a relationship.'); return }
    setBusy(true); setError('')
    const result = await linkDependent(code, relationship, linkMode)
    setBusy(false)
    if (!result.ok) { setError(result.error); return }
    setLinkOpen(false)
    load()
  }

  function confirmUnlink(linkId: string, name: string) {
    Alert.alert('Unlink account?', `Stop managing ${name}'s account? They'll need to be re-linked to manage them again.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: () => handleUnlink(linkId) },
    ])
  }

  async function handleUnlink(linkId: string) {
    setUnlinking(linkId)
    await unlinkDependent(linkId)
    setUnlinking(null)
    load()
  }

  async function handleSwitch(dependentId: string) {
    setSwitching(dependentId)
    const err = await switchToDependent(dependentId)
    setSwitching(null)
    if (err) { haptics.error(); Alert.alert('Could not switch', err) }
    else { haptics.success(); navigation.navigate('MainTabs') }
  }

  function confirmUnlinkSelf() {
    if (!managedBy) return
    Alert.alert('Unlink your account?', `Stop being managed by ${managedBy.caretaker.full_name}? You'll manage your own bookings from now on.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unlink', style: 'destructive', onPress: () => handleUnlink(managedBy.linkId) },
    ])
  }

  const myAge = calcAge(user?.date_of_birth)
  const canSelfUnlink = myAge !== null && myAge >= 18

  return (
    <Screen>
      <AppBar
        title="Dependents"
        onBack={() => navigation.goBack()}
        right={<IconBtn name="person-add-outline" label="Link a dependent" onPress={() => openLink('caretaker')} />}
      />

      {/* Link-by-ID sheet */}
      <Modal visible={linkOpen} animationType="slide" transparent onRequestClose={() => setLinkOpen(false)}>
        <Pressable
          accessibilityLabel="Close" accessibilityRole="button"
          onPress={() => setLinkOpen(false)}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }}
        />
        <View style={{
          backgroundColor: t.q.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
          padding: 20, paddingBottom: 30, gap: 14,
        }}>
          <View style={{ width: 40, height: 4, borderRadius: 99, alignSelf: 'center', backgroundColor: t.q.line }} />
          <Text style={{ fontSize: 18, fontWeight: '800', letterSpacing: -0.4, color: t.q.ink }}>
            {linkMode === 'dependent' ? 'Add a caretaker' : 'Link a dependent'}
          </Text>

          {step === 'code' ? (
            <>
              <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink60 }}>
                {linkMode === 'dependent'
                  ? 'Ask your caretaker for the six-character Patient ID on their profile.'
                  : 'Ask them for the six-character Patient ID on their profile.'}
              </Text>
              <Field
                label="Patient ID"
                value={code}
                onChangeText={v => setCode(v.toUpperCase())}
                placeholder="K7M3QX"
                autoCapitalize="characters"
                maxLength={6}
                error={error || undefined}
                style={{ fontFamily: MONO, fontSize: 20, letterSpacing: 4, textAlign: 'center' }}
              />
              <Btn label={busy ? 'Looking up…' : 'Look up'} loading={busy} onPress={handleLookup} />
            </>
          ) : (
            <>
              <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink60 }}>
                Found <Text style={{ fontWeight: '700', color: t.q.ink }}>{resolvedName}</Text>.
                {' '}What is your relationship to them?
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {RELATIONSHIPS.map(r => (
                  <Chip
                    key={r.value}
                    label={r.label}
                    icon={RELATION_ICONS[r.value]}
                    on={relationship === r.value}
                    onPress={() => setRelationship(r.value)}
                  />
                ))}
              </View>
              {!!error && <Text style={{ fontSize: 12.5, color: t.q.red }}>{error}</Text>}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Btn label="Back" variant="secondary" onPress={() => { setStep('code'); setError('') }} />
                <Btn grow label={busy ? 'Linking…' : 'Confirm & link'} loading={busy} onPress={handleConfirmLink} />
              </View>
            </>
          )}
        </View>
      </Modal>

      {loading ? (
        <ActivityIndicator color={t.q.primary} style={{ marginTop: 40 }} />
      ) : (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <Body keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
            <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
              <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60 }}>
                Book and manage care for the people you look after.
              </Text>
            </View>

            <SectionHead title="People you manage" />
            {managing.length === 0 ? (
              <Card>
                <Empty
                  icon="people-outline"
                  title="No dependents yet"
                  body="Link a family member's account so you can book and manage visits for them."
                  action="Link by Patient ID"
                  onAction={() => openLink('caretaker')}
                />
              </Card>
            ) : (
              <Card>
                {managing.map((d, i) => (
                  <View key={d.linkId}>
                    {i > 0 && <Hair />}
                    <Row
                      icon={RELATION_ICONS[d.relationship] ?? 'person-outline'}
                      title={d.dependent.full_name}
                      sub={d.relationship}
                      right={
                        unlinking === d.linkId || switching === d.dependent.id
                          ? <ActivityIndicator color={t.q.primary} size="small" />
                          : <Btn label="Switch" variant="secondary" small onPress={() => handleSwitch(d.dependent.id)} />
                      }
                    />
                    <View style={{ paddingHorizontal: 14, paddingBottom: 10, alignItems: 'flex-end' }}>
                      <Btn
                        label="Unlink"
                        variant="ghost"
                        small
                        onPress={() => confirmUnlink(d.linkId, d.dependent.full_name)}
                      />
                    </View>
                  </View>
                ))}
              </Card>
            )}

            <SectionHead title="Managed by" />
            {managedBy ? (
              <Card>
                <Row
                  icon="shield-checkmark-outline"
                  title={managedBy.caretaker.full_name}
                  sub={managedBy.relationship}
                  right={
                    canSelfUnlink
                      ? <Btn label="Unlink" variant="secondary" small loading={unlinking === managedBy.linkId}
                          onPress={confirmUnlinkSelf} />
                      : undefined
                  }
                />
                {!canSelfUnlink && (
                  <>
                    <Hair />
                    <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                      <Text style={{ fontSize: 12.5, lineHeight: 18, color: t.q.ink60 }}>
                        You can unlink your own account once you turn 18.
                      </Text>
                    </View>
                  </>
                )}
              </Card>
            ) : (
              <Card>
                <Row
                  icon="person-add-outline" iconTone="neutral"
                  title="No caretaker linked"
                  sub="If someone else books for you, add their Patient ID here"
                  right={<Btn label="Add" variant="secondary" small onPress={() => openLink('dependent')} />}
                />
              </Card>
            )}
          </Body>
        </KeyboardAvoidingView>
      )}
    </Screen>
  )
}
