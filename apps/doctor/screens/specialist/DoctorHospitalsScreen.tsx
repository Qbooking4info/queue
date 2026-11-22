import { useEffect, useState } from 'react'
import { View, Clipboard, ActivityIndicator } from 'react-native'
import QRCode from 'react-native-qrcode-svg'
import { Text } from '@queue/shared/components/ui/Typography'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import { getMyDoctorClinics, switchMyActiveClinic, type DoctorClinicOption } from '@queue/shared/lib/api'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Btn, Empty, Pill, qs,
} from '@queue/shared/components/q'

interface Props { navigation: { goBack: () => void; canGoBack?: () => boolean } }

export function DoctorHospitalsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user, doctorProfile, switchHospital } = useAuth()
  const [switching, setSwitching] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Clinics assigned to this doctor at the currently-active hospital -- a
  // doctor may be assigned to several, but only one is active at a time
  // (doctor_clinics, 20260903000001).
  const [clinics, setClinics] = useState<DoctorClinicOption[]>([])
  const [activeClinicId, setActiveClinicId] = useState<string | null>(null)
  const [clinicSwitching, setClinicSwitching] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    if (!doctorProfile?.hospitalId) { setClinics([]); setActiveClinicId(null); return }
    getMyDoctorClinics().then(r => {
      if (!alive || !r) return
      setClinics(r.clinics)
      setActiveClinicId(r.activeClinicId)
    })
    return () => { alive = false }
  }, [doctorProfile?.hospitalId])

  async function handleSwitch(hospitalId: string) {
    if (hospitalId === doctorProfile?.hospitalId) return
    haptics.tap()
    setSwitching(hospitalId)
    await switchHospital(hospitalId)
    setSwitching(null)
  }

  async function handleClinicSwitch(clinicId: string) {
    if (clinicId === activeClinicId) return
    haptics.tap()
    setClinicSwitching(clinicId)
    const err = await switchMyActiveClinic(clinicId)
    if (!err) setActiveClinicId(clinicId)
    setClinicSwitching(null)
  }

  function copyCode() {
    if (!user?.doctor_code) return
    Clipboard.setString(user.doctor_code)
    haptics.success(); setCopied(true); setTimeout(() => setCopied(false), 1500)
  }

  const linked = doctorProfile?.linkedHospitals ?? []
  const activeHospitalName = linked.find(h => h.hospitalId === doctorProfile?.hospitalId)?.hospitalName

  return (
    <Screen>
      <AppBar title="Hospitals" sub="Linked hospitals and your Doctor ID"
        onBack={navigation.canGoBack?.() ? () => navigation.goBack() : undefined} />

      <Body>
        {/* A hospital admin either scans this or types the code underneath it.
            The QR panel keeps a white ground whatever the palette -- a scanner
            needs the contrast, and an inverted code does not read. */}
        <Card style={{ marginTop: 12 }}>
          <View style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
            <CardLabel>Your Doctor ID</CardLabel>
            <View style={{
              marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: t.q.line,
              backgroundColor: t.q.field, paddingVertical: 18, alignItems: 'center', gap: 14,
            }}>
              {!!user?.doctor_code && (
                <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#FFFFFF' }}>
                  <QRCode value={user.doctor_code} size={148} color="#0B1114" backgroundColor="#FFFFFF" />
                </View>
              )}
              <Text selectable style={[{ fontSize: 28, fontWeight: '800', letterSpacing: 6, color: t.q.ink }, qs.naira]}>
                {user?.doctor_code ?? '—'}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <Btn grow label={copied ? 'Copied' : 'Copy ID'} variant="secondary"
                icon={copied ? 'checkmark' : 'copy-outline'} onPress={copyCode} />
            </View>
            <Text style={{ fontSize: 12, lineHeight: 17, color: t.q.ink60, marginTop: 10 }}>
              A hospital admin scans this, or types the code, in Staff & doctors to add you to their queue.
            </Text>
          </View>
        </Card>

        <SectionHead title={`Linked hospitals · ${linked.length}`} />
        {linked.length === 0 ? (
          <Card>
            <Empty
              icon="business-outline"
              title="Not linked to any hospital yet"
              body="You can still take direct video consults and home visits — see Settings & fees. To work a hospital's queue, give them the Doctor ID above." />
          </Card>
        ) : (
          <Card>
            {linked.map((h, i) => {
              const active = h.hospitalId === doctorProfile?.hospitalId
              return (
                <View key={h.hospitalId}>
                  {i > 0 && <Hair />}
                  <Row
                    icon="business-outline"
                    iconTone={active ? 'teal' : 'neutral'}
                    title={h.hospitalName}
                    sub={active ? "Active — you see this hospital's queue" : 'Tap to make active'}
                    tint={active}
                    right={switching === h.hospitalId
                      ? <ActivityIndicator size="small" color={t.q.primary} />
                      : active
                        ? <Pill label="Active here" tone="teal" onTint />
                        : <Btn label="Set active" variant="secondary" small onPress={() => handleSwitch(h.hospitalId)} />}
                    onPress={active || switching !== null ? undefined : () => handleSwitch(h.hospitalId)} />
                </View>
              )
            })}
          </Card>
        )}

        {clinics.length >= 2 && (
          <>
            <SectionHead title={`Clinics at ${activeHospitalName ?? 'this hospital'}`} />
            <Card>
              {clinics.map((c, i) => {
                const active = c.clinicId === activeClinicId
                return (
                  <View key={c.clinicId}>
                    {i > 0 && <Hair />}
                    <Row
                      icon="medical-outline"
                      iconTone={active ? 'teal' : 'neutral'}
                      title={c.clinicName}
                      sub={active ? 'Active here' : 'Tap to make active'}
                      tint={active}
                      right={clinicSwitching === c.clinicId
                        ? <ActivityIndicator size="small" color={t.q.primary} />
                        : active
                          ? <Pill label="Active" tone="teal" onTint />
                          : undefined}
                      onPress={active || clinicSwitching !== null ? undefined : () => handleClinicSwitch(c.clinicId)} />
                  </View>
                )
              })}
            </Card>
            <View style={{ paddingHorizontal: 20, paddingTop: 10 }}>
              <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
                You are assigned to more than one clinic here. Only one can be active at a time — that is
                the one whose queue and referrals you see.
              </Text>
            </View>
          </>
        )}
      </Body>
    </Screen>
  )
}
