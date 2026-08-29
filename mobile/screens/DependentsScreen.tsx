import { useState, useCallback } from 'react'
import { View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, Modal, Pressable } from 'react-native'
import { Alert } from '../contexts/AlertContext'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth }  from '../contexts/AuthContext'
import {
  getLinkedDependents, lookupPatientByCode, linkDependent, unlinkDependent,
  type LinkedDependent, type ManagedByCaretaker,
} from '../lib/api'

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
  const { user }     = useAuth()

  const [managing,  setManaging]  = useState<LinkedDependent[]>([])
  const [managedBy, setManagedBy] = useState<ManagedByCaretaker | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [unlinking, setUnlinking] = useState<string | null>(null)

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
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={t.textMuted} />
        </TouchableOpacity>
        <Text style={[s.title, { color: t.textPrimary }]}>Dependents</Text>
        <TouchableOpacity onPress={() => openLink('caretaker')}
          style={[s.addBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
          <Text style={[s.addBtnText, { color: t.accent }]}>+ Link by ID</Text>
        </TouchableOpacity>
      </View>

      {/* Link-by-ID Modal */}
      <Modal visible={linkOpen} animationType="slide" transparent onRequestClose={() => setLinkOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setLinkOpen(false)} />
        <View style={[s.sheet, { backgroundColor: t.cardBg }]}>
          <View style={[s.sheetHandle, { backgroundColor: t.inputBorder }]} />
          <Text style={[s.sheetTitle, { color: t.textPrimary }]}>
            {linkMode === 'dependent' ? 'Add a caretaker' : "Link a dependent's account"}
          </Text>

          {step === 'code' ? (
            <>
              <Text style={[s.helpText, { color: t.textMuted }]}>
                {linkMode === 'dependent'
                  ? "Ask your caretaker for their 6-character Patient ID (shown on their profile) and enter it here."
                  : 'Ask them for their 6-character Patient ID (shown on their profile) and enter it here.'}
              </Text>
              <Text style={[s.fieldLabel, { color: t.textMuted }]}>Patient ID</Text>
              <TextInput
                value={code} onChangeText={v => setCode(v.toUpperCase())}
                placeholder="e.g. K7M3QX" placeholderTextColor={t.textMuted}
                autoCapitalize="characters" maxLength={6}
                style={[s.input, { backgroundColor: t.inputBg, borderColor: t.inputBorder, color: t.textPrimary,
                  fontFamily: 'monospace', fontSize: 18, letterSpacing: 3, textAlign: 'center' }]}
              />
              {!!error && <Text style={s.errorText}>{error}</Text>}
              <TouchableOpacity onPress={handleLookup} disabled={busy}
                style={[s.saveBtn, { backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}>
                <Text style={s.saveBtnText}>{busy ? 'Looking up…' : 'Look Up'}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[s.helpText, { color: t.textMuted }]}>
                Found <Text style={{ fontWeight: '700', color: t.textPrimary }}>{resolvedName}</Text>. What's your relationship to them?
              </Text>
              <View style={s.pillRow}>
                {RELATIONSHIPS.map(r => (
                  <TouchableOpacity key={r.value} onPress={() => setRelationship(r.value)}
                    style={[s.pill, { flexDirection: 'row', alignItems: 'center', gap: 4, borderColor: relationship === r.value ? t.accent : t.cardBorder, backgroundColor: relationship === r.value ? t.accentBg : t.inputBg }]}>
                    <Ionicons name={RELATION_ICONS[r.value]} size={12} color={relationship === r.value ? t.accent : t.textMuted} />
                    <Text style={[s.pillText, { color: relationship === r.value ? t.accent : t.textMuted, fontWeight: relationship === r.value ? '700' : '400' }]}>
                      {r.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {!!error && <Text style={s.errorText}>{error}</Text>}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
                <TouchableOpacity onPress={() => { setStep('code'); setError('') }}
                  style={[s.backBtn, { borderColor: t.cardBorder, backgroundColor: t.inputBg }]}>
                  <Text style={[s.backBtnText, { color: t.textMuted }]}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleConfirmLink} disabled={busy}
                  style={[s.saveBtn, { flex: 1, marginTop: 0, backgroundColor: t.accent, opacity: busy ? 0.6 : 1 }]}>
                  <Text style={s.saveBtnText}>{busy ? 'Linking…' : 'Confirm & Link'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          <View style={{ height: 10 }} />
        </View>
      </Modal>

      {loading ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {/* Managed by -- shown only when this account is itself a linked dependent */}
          {managedBy && (
            <View style={[s.managedByCard, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
              <Text style={[s.managedByLabel, { color: t.accent }]}>MANAGED BY</Text>
              <Text style={[s.depName, { color: t.textPrimary, marginTop: 4 }]}>{managedBy.caretaker.full_name}</Text>
              <Text style={[s.depMeta, { color: t.textMuted }]}>{managedBy.relationship}</Text>
              {canSelfUnlink ? (
                <TouchableOpacity onPress={confirmUnlinkSelf} disabled={unlinking === managedBy.linkId}
                  style={[s.unlinkBtn, { borderColor: 'rgba(255,92,92,0.4)', backgroundColor: 'rgba(255,92,92,0.07)', marginTop: 12 }]}>
                  {unlinking === managedBy.linkId
                    ? <ActivityIndicator color="#FF5C5C" size="small" />
                    : <Text style={s.unlinkBtnText}>Unlink my account</Text>}
                </TouchableOpacity>
              ) : (
                <Text style={[s.helpText, { color: t.textMuted, marginTop: 10, marginBottom: 0 }]}>
                  You can unlink your own account once you turn 18.
                </Text>
              )}
            </View>
          )}

          {/* No caretaker yet -- every patient has the option to add one, not just minors */}
          {!managedBy && (
            <View style={[s.noCaretakerRow, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Text style={[s.noCaretakerText, { color: t.textMuted }]}>No caretaker linked</Text>
              <TouchableOpacity onPress={() => openLink('dependent')}
                style={[s.addBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                <Text style={[s.addBtnText, { color: t.accent }]}>+ Add a caretaker</Text>
              </TouchableOpacity>
            </View>
          )}

          {managing.length === 0 && !managedBy ? (
            <View style={[s.emptyCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
              <Ionicons name="people-outline" size={40} color={t.textMuted} style={{ marginBottom: 12, opacity: 0.4 }} />
              <Text style={[s.emptyTitle, { color: t.textPrimary }]}>No dependents yet</Text>
              <Text style={[s.emptySub, { color: t.textMuted }]}>
                Link a family member's account so you can book and manage appointments on their behalf.
              </Text>
              <TouchableOpacity onPress={() => openLink('caretaker')}
                style={[s.emptyAddBtn, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                <Text style={[s.emptyAddBtnText, { color: t.accent }]}>+ Link by ID</Text>
              </TouchableOpacity>
            </View>
          ) : managing.length > 0 && (
            <>
              <Text style={[s.countText, { color: t.textMuted }]}>{managing.length} dependent{managing.length !== 1 ? 's' : ''}</Text>
              {managing.map(d => (
                <View key={d.linkId} style={[s.depCard, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
                  <View style={[s.depAvatar, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
                    <Ionicons name={RELATION_ICONS[d.relationship] ?? 'person-outline'} size={22} color={t.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.depName, { color: t.textPrimary }]}>{d.dependent.full_name}</Text>
                    <Text style={[s.depMeta, { color: t.textMuted }]}>{d.relationship}</Text>
                  </View>
                  {unlinking === d.linkId
                    ? <ActivityIndicator color={t.accent} size="small" />
                    : (
                      <TouchableOpacity onPress={() => confirmUnlink(d.linkId, d.dependent.full_name)}>
                        <Text style={[s.unlinkLink]}>Unlink</Text>
                      </TouchableOpacity>
                    )}
                </View>
              ))}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:           { flex: 1 },
  header:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14 },
  title:          { fontSize: 17, fontWeight: '800', letterSpacing: -0.4 },
  addBtn:         { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1 },
  addBtnText:     { fontSize: 12, fontWeight: '700' },
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:          { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 30 },
  sheetHandle:    { width: 40, height: 4, borderRadius: 99, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:     { fontSize: 18, fontWeight: '800', letterSpacing: -0.5, marginBottom: 10 },
  helpText:       { fontSize: 12, lineHeight: 18, marginBottom: 14 },
  fieldLabel:     { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  input:          { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  pillRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  pill:           { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1 },
  pillText:       { fontSize: 12 },
  errorText:      { color: '#F87171', fontSize: 12, marginTop: 8 },
  saveBtn:        { borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 18 },
  saveBtnText:    { color: '#fff', fontSize: 14, fontWeight: '700' },
  backBtn:        { borderRadius: 14, padding: 14, alignItems: 'center', borderWidth: 1, paddingHorizontal: 22 },
  backBtnText:    { fontSize: 14, fontWeight: '700' },
  emptyCard:      { borderRadius: 20, borderWidth: 1, padding: 36, alignItems: 'center' },
  emptyTitle:     { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptySub:       { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  emptyAddBtn:    { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 99, borderWidth: 1 },
  emptyAddBtnText:{ fontSize: 13, fontWeight: '700' },
  countText:      { fontSize: 11, marginBottom: 12 },
  depCard:        { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, padding: 14, marginBottom: 8, borderWidth: 1 },
  depAvatar:      { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  depName:        { fontSize: 14, fontWeight: '700' },
  depMeta:        { fontSize: 11, marginTop: 2, textTransform: 'capitalize' },
  unlinkLink:     { fontSize: 12, fontWeight: '700', color: '#FF5C5C' },
  managedByCard:  { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 20 },
  managedByLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  unlinkBtn:      { borderRadius: 14, padding: 12, alignItems: 'center', borderWidth: 1 },
  unlinkBtnText:  { color: '#FF5C5C', fontSize: 13, fontWeight: '700' },
  noCaretakerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 20 },
  noCaretakerText:{ fontSize: 12 },
})
