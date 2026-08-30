import { useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuth } from '../../contexts/AuthContext'
import { haptics } from '../../lib/haptics'
import { ShellScroll } from '../../components/AppShell'

interface Props { navigation: any }

export function DoctorHospitalsScreen({}: Props) {
  const { theme: t } = useTheme()
  const { user, doctorProfile, switchHospital } = useAuth()
  const [switching, setSwitching] = useState<string | null>(null)

  async function handleSwitch(hospitalId: string) {
    if (hospitalId === doctorProfile?.hospitalId) return
    haptics.tap()
    setSwitching(hospitalId)
    await switchHospital(hospitalId)
    setSwitching(null)
  }

  return (
      <ShellScroll>
        <Text style={{ fontSize: 22, fontWeight: '800', color: t.textPrimary, letterSpacing: -0.5, marginBottom: 4 }}>Hospitals</Text>
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
