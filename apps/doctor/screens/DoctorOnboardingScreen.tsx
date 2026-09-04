import { useEffect, useState } from 'react'
import { View, Text, ScrollView, ActivityIndicator, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { haptics }  from '@queue/shared/lib/haptics'
import { Button } from '@queue/shared/components/ui/Button'

// Where a doctor lands between signing up and being linked to a hospital. That gap is
// structural, not a bug: `doctors.hospital_id` is NOT NULL, so no row can exist for a
// doctor with no hospital, and only a hospital admin can create one (via their
// dashboard's "Link Existing Doctor" flow, keyed on the Doctor ID shown here).
//
// Before this screen existed, that gap dropped a freshly registered doctor straight onto
// the "This account is not a doctor" lock screen -- the same dead end hospital
// registration used to hit.
export function DoctorOnboardingScreen() {
  const { theme: t } = useTheme()
  const { user, refreshProfile, signOut } = useAuth()
  const [checking, setChecking] = useState(false)

  // The `users` row is inserted by signUp() *after* the auth state change has already
  // fired the profile load, so on the first render right after registering, `user` (and
  // with it doctor_code) is still null. One refresh on mount picks it up.
  useEffect(() => {
    if (!user) void refreshProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleCheckAgain() {
    haptics.tap()
    setChecking(true)
    // If an admin has linked this account in the meantime, refreshProfile populates
    // doctorProfile and AppNavigator swaps this stack out for the real app.
    await refreshProfile()
    setChecking(false)
  }

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: t.canvasBg }]}>
      <ScrollView contentContainerStyle={s.scroll}>

        <View style={[s.iconWrap, { backgroundColor: t.accentBgMid, borderColor: t.accentBorder }]}>
          <Ionicons name="checkmark-circle-outline" size={30} color={t.accent} />
        </View>

        <Text style={[s.title, { color: t.textPrimary }]}>You're all set up</Text>
        <Text style={[s.sub, { color: t.textMuted }]}>
          Your doctor account is ready. The last step is linking it to the hospital or
          clinic you practise at — their admin does that from their Queue dashboard.
        </Text>

        <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[s.cardLabel, { color: t.textMuted }]}>Your Doctor ID</Text>
          <View style={[s.codeBox, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
            {user?.doctor_code ? (
              <Text selectable style={[s.code, { color: t.textPrimary }]}>{user.doctor_code}</Text>
            ) : (
              <ActivityIndicator color={t.accent} />
            )}
          </View>
          <Text style={[s.help, { color: t.textMuted }]}>
            Share this with your hospital's admin. They'll enter it in their dashboard's
            "Link Existing Doctor" flow. Tap and hold to copy.
          </Text>
        </View>

        <View style={[s.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
          <Text style={[s.cardTitle, { color: t.textPrimary }]}>What happens next</Text>
          {[
            'Send your Doctor ID to your hospital admin.',
            'They link it — you can be linked to more than one hospital.',
            'Come back here and tap "I\'ve been linked" to load your queue.',
          ].map((line, i) => (
            <View key={line} style={s.stepRow}>
              <View style={[s.stepNum, { backgroundColor: t.accentBg, borderColor: t.accentBorder }]}>
                <Text style={[s.stepNumText, { color: t.accent }]}>{i + 1}</Text>
              </View>
              <Text style={[s.stepText, { color: t.textMuted }]}>{line}</Text>
            </View>
          ))}
        </View>

        <Button label="I've been linked — check again" onPress={handleCheckAgain} loading={checking} size="lg" style={{ marginTop: t.spacing.sm }} />

        <Button label="Sign out" onPress={() => { void signOut() }} variant="outline" size="lg" style={{ marginTop: t.spacing.md }} />

      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  safe:        { flex: 1 },
  scroll:      { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 32 },
  iconWrap:    { width: 64, height: 64, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title:       { fontSize: 24, fontWeight: '900', letterSpacing: -0.8 },
  sub:         { fontSize: 13, lineHeight: 19, marginTop: 6, marginBottom: 22 },
  card:        { borderRadius: 18, borderWidth: 1, padding: 18, marginBottom: 14 },
  cardLabel:   { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  cardTitle:   { fontSize: 14, fontWeight: '800', marginBottom: 12 },
  codeBox:     { borderWidth: 1, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 10, minHeight: 60, justifyContent: 'center' },
  code:        { fontSize: 24, fontFamily: 'monospace', fontWeight: '800', letterSpacing: 4 },
  help:        { fontSize: 11, lineHeight: 16 },
  stepRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  stepNum:     { width: 22, height: 22, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { fontSize: 11, fontWeight: '800' },
  stepText:    { flex: 1, fontSize: 12, lineHeight: 18 },
})
