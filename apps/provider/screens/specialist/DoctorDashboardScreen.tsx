import { useCallback, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { todayLocalDate } from '@queue/shared/lib/format'
import { ShellScroll } from '@queue/shared/components/AppShell'
import { getMyDoctorStats } from '@queue/shared/lib/api'

interface Props { navigation: any }

export function DoctorDashboardScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user, doctorProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [todayCount, setTodayCount] = useState(0)
  const [pendingDirect, setPendingDirect] = useState(0)
  const [monthCompleted, setMonthCompleted] = useState(0)
  const [avgConsultSecs, setAvgConsultSecs] = useState<number | null>(null)

  useFocusEffect(useCallback(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      const today = todayLocalDate()
      const monthStart = today.slice(0, 7) + '-01'

      const queries = [
        supabase.from('appointments').select('*', { count: 'exact', head: true })
          .eq('doctor_user_id', user?.id ?? '').eq('status', 'pending').eq('approval_status', 'pending_review'),
        supabase.from('appointments').select('*', { count: 'exact', head: true })
          .eq('doctor_user_id', user?.id ?? '').eq('status', 'completed').gte('appointment_date', monthStart),
      ]
      if (doctorProfile) {
        queries.push(
          supabase.from('appointments').select('*', { count: 'exact', head: true })
            .eq('doctor_id', doctorProfile.doctorId).eq('appointment_date', today).neq('status', 'cancelled'),
        )
      }

      const [results, stats] = await Promise.all([
        Promise.all(queries),
        doctorProfile ? getMyDoctorStats() : Promise.resolve(null),
      ])
      if (cancelled) return
      setPendingDirect(results[0].count ?? 0)
      setMonthCompleted(results[1].count ?? 0)
      setTodayCount(doctorProfile ? (results[2]?.count ?? 0) : 0)
      setAvgConsultSecs(stats?.avgConsultSecs ?? null)
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user?.id, doctorProfile]))

  const firstName = (doctorProfile?.fullName ?? user?.full_name ?? '').split(' ')[0] || 'there'

  return (
      <ShellScroll>
        <Text style={{ fontSize: 24, fontWeight: '800', color: t.textPrimary, letterSpacing: -0.5, marginBottom: 4 }}>
          Welcome, Dr. {firstName}
        </Text>
        <Text style={{ fontSize: 13, color: t.textMuted, marginBottom: 24 }}>
          Here's what's happening across your practice.
        </Text>

        {loading ? (
          <ActivityIndicator color={t.accent} style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <StatCard theme={t} icon="list-outline" label="Today's patients" value={todayCount}
                onPress={() => navigation.navigate('Queue')} disabled={!doctorProfile} />
              <StatCard theme={t} icon="hourglass-outline" label="Pending requests" value={pendingDirect}
                onPress={() => navigation.navigate('Appointments')} highlight={pendingDirect > 0} />
              <StatCard theme={t} icon="checkmark-done-outline" label="Completed this month" value={monthCompleted}
                onPress={() => navigation.navigate('Appointments')} />
              {doctorProfile && (
                <StatCard theme={t} icon="time-outline" label="Avg. consult time"
                  value={avgConsultSecs == null ? '—' : `${Math.round(avgConsultSecs / 60)}m`}
                  onPress={() => navigation.navigate('Queue')} />
              )}
            </View>

            {!doctorProfile && (
              <View style={{ backgroundColor: t.accentBg, borderColor: t.accentBorder, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 16 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.accent, marginBottom: 4 }}>Not linked to a hospital yet</Text>
                <Text style={{ fontSize: 12, color: t.textSecondary, marginBottom: 10 }}>
                  You can still accept direct virtual consults and home visits from patients. Turn those on in Settings,
                  or share your Doctor ID with a hospital to also see their queue here.
                </Text>
                <TouchableOpacity onPress={() => { haptics.tap(); navigation.navigate('Hospitals') }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: t.accent }}>View your Doctor ID →</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap' }}>
              <QuickLink theme={t} icon="calendar-outline" label="Review appointments" onPress={() => navigation.navigate('Appointments')} />
              <QuickLink theme={t} icon="settings-outline" label="Edit settings & fees" onPress={() => navigation.navigate('Settings')} />
              <QuickLink theme={t} icon="business-outline" label="Manage hospitals" onPress={() => navigation.navigate('Hospitals')} />
            </View>
          </>
        )}
      </ShellScroll>
  )
}

function StatCard({ theme: t, icon, label, value, onPress, highlight, disabled }: {
  theme: any; icon: keyof typeof Ionicons.glyphMap; label: string; value: number | string
  onPress: () => void; highlight?: boolean; disabled?: boolean
}) {
  return (
    <TouchableOpacity disabled={disabled} onPress={() => { haptics.tap(); onPress() }}
      style={{
        flex: 1, minWidth: 140, backgroundColor: highlight ? t.accentBg : t.cardBg,
        borderColor: highlight ? t.accentBorder : t.cardBorder, borderWidth: 1,
        borderRadius: 16, padding: 16, opacity: disabled ? 0.5 : 1,
      }}>
      <Ionicons name={icon} size={18} color={highlight ? t.accent : t.textMuted} style={{ marginBottom: 10 }} />
      <Text style={{ fontSize: 24, fontWeight: '800', color: highlight ? t.accent : t.textPrimary }}>{value}</Text>
      <Text style={{ fontSize: 11, color: t.textMuted, marginTop: 2 }}>{label}</Text>
    </TouchableOpacity>
  )
}

function QuickLink({ theme: t, icon, label, onPress }: {
  theme: any; icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void
}) {
  return (
    <TouchableOpacity onPress={() => { haptics.tap(); onPress() }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: t.cardBg, borderColor: t.cardBorder, borderWidth: 1,
        borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14,
      }}>
      <Ionicons name={icon} size={15} color={t.accent} />
      <Text style={{ fontSize: 12, fontWeight: '600', color: t.textPrimary }}>{label}</Text>
    </TouchableOpacity>
  )
}
