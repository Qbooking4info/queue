import { useCallback, useEffect, useState } from 'react'
import { View, ActivityIndicator, Modal, Pressable } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import QRCode from 'react-native-qrcode-svg'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { getAppointmentById } from '@queue/shared/lib/api'
import { supabase } from '@queue/shared/lib/supabase'
import { readCache, writeCache } from '@queue/shared/lib/cache'
import { QueuePositionPicker } from '@queue/shared/components/QueuePositionPicker'
import {
  Screen, AppBar, Body, Card, CardLabel, Btn, BottomBar, Empty, Mono, NUMS,
} from '@queue/shared/components/q'
import type { AppointmentWithRelations } from '@queue/shared/lib/api'

interface Props { navigation: any; route: { params: { appointmentId: string } } }

/**
 * The pass itself: one card a patient holds up at the desk. Everything that
 * moves -- position, wait, who is in now -- lives on LiveQueueScreen; this
 * screen is deliberately still, because it is read in a queue by someone
 * holding a phone at arm's length for a stranger to scan.
 */
export function QueuePassScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()
  const { user } = useAuth() as any
  const id = route.params?.appointmentId
  const [appt, setAppt] = useState<AppointmentWithRelations | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [showLate, setShowLate] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    const a = await getAppointmentById(id).catch(() => null)
    if (a) {
      setAppt(a)
      setUpdatedAt(new Date())
      writeCache(user?.id, 'pass:' + id, { a, at: Date.now() })
    }
    setLoading(false)
  }, [id, user?.id])

  useEffect(() => {
    readCache<{ a: AppointmentWithRelations; at: number }>(user?.id, 'pass:' + id).then(c => {
      if (c) { setAppt(p => p ?? c.a); setUpdatedAt(u => u ?? new Date(c.at)); setLoading(false) }
    })
  }, [id, user?.id])

  useEffect(() => {
    load()
    const ch = supabase.channel(`queue-pass-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointments', filter: `id=eq.${id}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, load])

  if (loading) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      </Screen>
    )
  }

  if (!appt) {
    return (
      <Screen>
        <AppBar title="Queue pass" onBack={() => navigation.goBack()} />
        <Card style={{ marginTop: 16 }}>
          <Empty icon="ticket-outline" title="We could not find this visit"
            body="It may have been cancelled or moved."
            action="Back" onAction={() => navigation.goBack()} />
        </Card>
      </Screen>
    )
  }

  const patientCode = (user?.patient_code as string | undefined) ?? '—'
  const checkedIn = appt.status === 'checked_in' || appt.status === 'in_progress'
  const qr = `queue:appt:${appt.id}:${patientCode}`
  const date = new Date(appt.appointment_date + 'T00:00:00')
    .toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <Screen>
      <AppBar title="Queue pass" sub={appt.booking_ref ?? undefined} onBack={() => navigation.goBack()} />

      <Body>
        <Card>
          <View style={{ padding: 16, gap: 4 }}>
            <CardLabel>Show this at the front desk to check in</CardLabel>
          </View>

          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 }}>
            {/* The QR is always drawn on white, in both themes: a scanner
                reading a dark-mode inverted code is a coin flip. */}
            <Pressable
              onPress={() => setShowQr(true)}
              accessibilityRole="button" accessibilityLabel="Enlarge check-in QR code"
              style={{ padding: 8, backgroundColor: '#FFFFFF', borderRadius: 10 }}>
              <QRCode value={qr} size={104} color="#0B1114" backgroundColor="#FFFFFF" />
            </Pressable>

            <View style={{ flex: 1, gap: 10 }}>
              <View>
                <Text style={{ fontSize: 11.5, fontWeight: '700', letterSpacing: 0.58, textTransform: 'uppercase', color: t.q.ink60 }}>
                  Patient ID
                </Text>
                <Mono size={20} weight="700">{patientCode}</Mono>
              </View>
              <View>
                <Text style={{ fontSize: 11.5, fontWeight: '700', letterSpacing: 0.58, textTransform: 'uppercase', color: t.q.ink60 }}>
                  Number
                </Text>
                <Text accessibilityLiveRegion="polite"
                  style={[{ fontSize: 40, lineHeight: 44, fontWeight: '800', letterSpacing: -1.6, color: checkedIn ? t.q.ink : t.q.ink60 }, NUMS]}>
                  {appt.queue_position ?? '—'}
                </Text>
              </View>
            </View>
          </View>

          <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
            <Text style={{ fontSize: 13, lineHeight: 18, color: t.q.ink70 }}>
              {[user?.full_name, appt.hospital?.name, `${date}${appt.start_time ? ' · ' + appt.start_time.slice(0, 5) : ''}`]
                .filter(Boolean).join(' · ')}
            </Text>
            {!checkedIn && (
              <Text style={{ fontSize: 12.5, lineHeight: 18, color: t.q.ink60, marginTop: 6 }}>
                Your number appears once the front desk has checked you in.
              </Text>
            )}
          </View>
        </Card>

        <View style={{ paddingHorizontal: 20, paddingTop: 14, gap: 6 }}>
          <Text style={{ fontSize: 12, lineHeight: 18, color: t.q.ink60 }}>
            This pass works without a connection.
            {updatedAt ? ` Last updated ${updatedAt.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })}.` : ''}
          </Text>
        </View>
      </Body>

      <BottomBar>
        {checkedIn && appt.status !== 'in_progress' && (
          <Btn label="Running late?" variant="secondary" onPress={() => setShowLate(true)} />
        )}
        <Btn grow label="Show full screen" icon="qr-code-outline" onPress={() => setShowQr(true)} />
      </BottomBar>

      {/* Full-screen, always light: the desk scanner needs the brightest,
          highest-contrast surface the phone can give it. */}
      <Modal visible={showQr} transparent animationType="fade" onRequestClose={() => setShowQr(false)}>
        <Pressable
          onPress={() => setShowQr(false)} accessibilityLabel="Close QR code" accessibilityRole="button"
          style={{ flex: 1, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 18, padding: 24 }}>
          <Text style={{ fontSize: 15, color: '#55656B' }}>Show this to the front desk</Text>
          <QRCode value={qr} size={260} color="#0B1114" backgroundColor="#FFFFFF" />
          <Text style={{ fontSize: 28, fontWeight: '800', letterSpacing: 2, color: '#0B1114' }}>{patientCode}</Text>
          <Text style={{ fontSize: 13, color: '#55656B' }}>Tap anywhere to close</Text>
        </Pressable>
      </Modal>

      {showLate && (
        <QueuePositionPicker
          appointmentId={appt.id}
          onClose={() => setShowLate(false)}
          onMoved={() => { setShowLate(false); load() }}
        />
      )}
    </Screen>
  )
}
