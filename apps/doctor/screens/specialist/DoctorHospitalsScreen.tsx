import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { haptics } from '@queue/shared/lib/haptics'
import { ShellScroll } from '@queue/shared/components/AppShell'
import { getMyDoctorClinics, switchMyActiveClinic, type DoctorClinicOption } from '@queue/shared/lib/api'

interface Props { navigation: { goBack: () => void; canGoBack?: () => boolean } }

export function DoctorHospitalsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user, doctorProfile, switchHospital } = useAuth()
  const [switching, setSwitching] = useState<string | null>(null)

  // Clinics assigned to this doctor at the currently-active hospital -- a
  // doctor may be assigned to several, but only one is active at a time
  // (doctor_clinics, 20260903000001). Only worth showing/fetching once the
  // doctor actually has an active hospital to have clinics at.
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

  const activeHospitalName = doctorProfile?.linkedHospitals.find(h => h.hospitalId === doctorProfile.hospitalId)?.hospitalName

  return (
      <ShellScroll>
        {/* Hospitals is pushed as its own stack screen above the tab bar (not a tab
            itself), so without this there is no way back to Dashboard at all --
            no header, no tab bar, nothing but the browser's own back button, which
            doesn't sync with this in-memory navigation stack on web. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          {navigation.canGoBack?.() ? (
            <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
              <Ionicons name="arrow-back" size={20} color={t.textPrimary} />
            </TouchableOpacity>
          ) : null}
          <Text style={{ fontSize: 22, fontWeight: '800', color: t.textPrimary, letterSpacing: -0.5 }}>Hospitals</Text>
        </View>
        <Text style={{ fontSize: 12, color: t.textMuted, marginBottom: 20 }}>
          Manage the hospitals and clinics you're linked to. Only one can be active at a time —
          that's the one whose queue and referrals you see.
        </Text>

        {(doctorProfile?.linkedHospitals ?? []).length === 0 ? (
          <View style={{ backgroundColor: t.cardBg, borderColor: t.cardBorder, borderWidth: 1, borderRadius: 16, padding: 20, marginBottom: 20, alignItems: 'center' }}>
            <Ionicons name="business-outline" size={32} color={t.textMuted} style={{ opacity: 0.4, marginBottom: 10 }} />
            <Text style={{ fontSize: 13, fontWeight: '700', color: t.textPrimary, marginBottom: 4, textAlign: 'center' }}>
              Not linked to any hospital yet
            </Text>
            <Text style={{ fontSize: 12, color: t.textMuted, textAlign: 'center' }}>
              You can still accept direct patient bookings — see Settings. To also work with a
              hospital's queue, share your Doctor ID below with their admin.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10, marginBottom: 20 }}>
            {doctorProfile!.linkedHospitals.map(h => {
              const active = h.hospitalId === doctorProfile?.hospitalId
              return (
                <TouchableOpacity key={h.hospitalId} disabled={active || switching !== null}
                  onPress={() => handleSwitch(h.hospitalId)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    padding: 16, borderRadius: 14, borderWidth: 1,
                    borderColor: active ? t.accentBorder : t.cardBorder,
                    backgroundColor: active ? t.accentBg : t.cardBg,
                  }}>
                  <View>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: active ? t.accent : t.textPrimary }}>{h.hospitalName}</Text>
                    {active && <Text style={{ fontSize: 11, color: t.accent, marginTop: 2 }}>Active — you'll see this hospital's queue</Text>}
                  </View>
                  {switching === h.hospitalId ? (
                    <ActivityIndicator size="small" color={t.accent} />
                  ) : active ? (
                    <Ionicons name="checkmark-circle" size={20} color={t.accent} />
                  ) : (
                    <Text style={{ fontSize: 12, fontWeight: '700', color: t.textMuted }}>Switch</Text>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {clinics.length >= 2 && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: t.textPrimary, marginBottom: 4 }}>
              Clinics at {activeHospitalName ?? 'this hospital'}
            </Text>
            <Text style={{ fontSize: 12, color: t.textMuted, marginBottom: 12 }}>
              You're assigned to more than one clinic here. Only one can be active at a time.
            </Text>
            <View style={{ gap: 10 }}>
              {clinics.map(c => {
                const active = c.clinicId === activeClinicId
                return (
                  <TouchableOpacity key={c.clinicId} disabled={active || clinicSwitching !== null}
                    onPress={() => handleClinicSwitch(c.clinicId)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      padding: 16, borderRadius: 14, borderWidth: 1,
                      borderColor: active ? t.accentBorder : t.cardBorder,
                      backgroundColor: active ? t.accentBg : t.cardBg,
                    }}>
                    <View>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: active ? t.accent : t.textPrimary }}>{c.clinicName}</Text>
                      {active && <Text style={{ fontSize: 11, color: t.accent, marginTop: 2 }}>Active here</Text>}
                    </View>
                    {clinicSwitching === c.clinicId ? (
                      <ActivityIndicator size="small" color={t.accent} />
                    ) : active ? (
                      <Ionicons name="checkmark-circle" size={20} color={t.accent} />
                    ) : (
                      <Text style={{ fontSize: 12, fontWeight: '700', color: t.textMuted }}>Switch</Text>
                    )}
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )}

        <View style={{ backgroundColor: t.cardBg, borderColor: t.cardBorder, borderWidth: 1, borderRadius: 16, padding: 16 }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: t.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Your Doctor ID
          </Text>
          <View style={{ backgroundColor: t.inputBg, borderColor: t.inputBorder, borderWidth: 1, borderRadius: 10, padding: 14, marginBottom: 8, alignItems: 'center' }}>
            <Text selectable style={{ fontSize: 24, fontFamily: 'monospace', fontWeight: '800', letterSpacing: 4, color: t.textPrimary }}>{user?.doctor_code ?? '—'}</Text>
          </View>
          <Text style={{ fontSize: 11, color: t.textMuted }}>
            Share this with a hospital admin to get linked — they'll enter it in their dashboard's
            "Link Existing Doctor" flow. Tap and hold to copy.
          </Text>
        </View>
      </ShellScroll>
  )
}
