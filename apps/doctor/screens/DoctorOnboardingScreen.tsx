import { useEffect, useState } from 'react'
import { View, ActivityIndicator, Clipboard } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth }  from '@queue/shared/contexts/AuthContext'
import { haptics }  from '@queue/shared/lib/haptics'
import {
  Screen, AppBar, Body, Card, CardLabel, Hair, SectionHead, Btn, BottomBar, qs,
} from '@queue/shared/components/q'

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
  const [copied, setCopied] = useState(false)

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

  function copyCode() {
    if (!user?.doctor_code) return
    Clipboard.setString(user.doctor_code)
    haptics.success(); setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const STEPS = [
    { title: 'A hospital links you', body: 'They enter your Doctor ID under Staff & doctors.' },
    { title: 'Their queue appears on Home', body: 'You can be linked to several hospitals.' },
    { title: 'Set your direct fees', body: 'Optional: video consults and home visits patients book themselves.' },
  ]

  return (
    <Screen>
      <AppBar />

      <Body>
        <View style={{ paddingHorizontal: 20, paddingTop: 8, alignItems: 'flex-start' }}>
          <View style={{
            width: 56, height: 56, borderRadius: 16, backgroundColor: t.q.sel,
            alignItems: 'center', justifyContent: 'center', marginBottom: 14,
          }}>
            <Ionicons name="checkmark-circle-outline" size={28} color={t.q.primary} />
          </View>
          <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: '800', letterSpacing: -0.7, color: t.q.ink }}>
            You're all set up
          </Text>
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60, marginTop: 8 }}>
            Your doctor account is ready. The last step is linking it to the hospital or clinic you
            practise at — their admin does that from their Queue dashboard.
          </Text>
        </View>

        <Card style={{ marginTop: 18 }}>
          <View style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
            <CardLabel>Your Doctor ID</CardLabel>
            <View style={{
              marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: t.q.line,
              backgroundColor: t.q.field, paddingVertical: 18, minHeight: 64,
              alignItems: 'center', justifyContent: 'center',
            }}>
              {user?.doctor_code ? (
                <View style={{ alignItems: 'center', gap: 14 }}>
                  {/* White ground whatever the palette: a scanner needs the
                      contrast, and an inverted code does not read. */}
                  <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF' }}>
                    <QRCode value={user.doctor_code} size={132} color="#0B1114" backgroundColor="#FFFFFF" />
                  </View>
                  <Text selectable style={[{ fontSize: 28, fontWeight: '800', letterSpacing: 6, color: t.q.ink }, qs.naira]}>
                    {user.doctor_code}
                  </Text>
                </View>
              ) : (
                <ActivityIndicator color={t.q.primary} />
              )}
            </View>
            <View style={{ marginTop: 10 }}>
              <Btn label={copied ? 'Copied' : 'Copy ID'} variant="secondary"
                icon={copied ? 'checkmark' : 'copy-outline'} onPress={copyCode} />
            </View>
            <Text style={{ fontSize: 12, lineHeight: 17, color: t.q.ink60, marginTop: 10 }}>
              A hospital admin scans this, or types the code, to link you to their queue.
            </Text>
          </View>
        </Card>

        <SectionHead title="What happens next" />
        <Card>
          {STEPS.map((s, i) => (
            <View key={s.title}>
              {i > 0 && <Hair />}
              <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
                <View style={{
                  width: 24, height: 24, borderRadius: 12, backgroundColor: t.q.sel,
                  alignItems: 'center', justifyContent: 'center', marginTop: 1,
                }}>
                  <Text style={{ fontSize: 11.5, fontWeight: '800', color: t.q.primary }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={{ fontSize: 14.5, fontWeight: '600', color: t.q.ink }}>{s.title}</Text>
                  <Text style={{ fontSize: 12.5, lineHeight: 18, color: t.q.ink60 }}>{s.body}</Text>
                </View>
              </View>
            </View>
          ))}
        </Card>

        <View style={{ paddingHorizontal: 16, paddingTop: 18 }}>
          <Btn label="Sign out" variant="ghost" onPress={() => { void signOut() }} />
        </View>
      </Body>

      <BottomBar>
        <Btn grow label="I've been linked — check again" loading={checking} onPress={handleCheckAgain} />
      </BottomBar>
    </Screen>
  )
}
