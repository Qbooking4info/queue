import { useState, useCallback } from 'react'
import { View, ActivityIndicator, RefreshControl, Linking } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import {
  Screen, AppBar, Body, Card, Row, Hair, Notice, Btn, Empty, Mono, type PillTone,
} from '@queue/shared/components/q'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'

// dispatcher_alerts and dispatch_attempts (Coverage screen) have RLS enabled with
// zero policies -- unlike transport_requests, which hospital_admins/clinic_admins
// can read directly (see the RLS policy check that shaped this screen), a direct
// query here returns silently empty. Both routed through the API instead, same as
// every write this app already makes.
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

interface AlertRow {
  id: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  kind: string
  message: string
  created_at: string
  acknowledged_at: string | null
  request: {
    id: string; booking_ref: string; triage_level: number | null
    symptom_description: string | null; pickup_address: string | null
    contact_phone: string; caller_patient_name: string | null; failure_reason: string | null
  } | null
  ack: { full_name: string } | null
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 } as const
const KIND_LABEL: Record<string, string> = { no_unit_available: 'No ambulance found', tracking_stale: 'Crew position went stale' }

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const h = Math.floor(mins / 60)
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`
}

interface Props { navigation: any }

export function AmbulanceAlertsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const [alerts, setAlerts] = useState<AlertRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const severityTrio = (s: AlertRow['severity']) =>
    s === 'critical' ? { text: t.danger, bg: t.dangerSubtle, border: t.dangerBorder }
    : s === 'high'   ? t.statusProgress
    : s === 'medium' ? t.statusBusy
    : { text: t.textMuted, bg: t.statusNeutral.bg, border: t.statusNeutral.border }

  const load = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) return
      const res = await fetch(`${API_URL}/api/ambulances/alerts`, { headers: { Authorization: `Bearer ${jwt}` } })
      const body = await res.json()
      if (res.ok) setAlerts(body.alerts ?? [])
    } catch {
      /* silent -- a failed background load leaves the last-known state on screen */
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function acknowledge(id: string) {
    setBusyId(id)
    haptics.tap()
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const jwt = session?.access_token
      if (!jwt) throw new Error('Not authenticated')
      const res = await fetch(`${API_URL}/api/ambulances/alerts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ alertId: id }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        Alert.alert('Could not acknowledge', body?.error ?? 'Try again.')
        return
      }
      await load()
    } catch {
      Alert.alert('Could not acknowledge', 'Check your connection and try again.')
    } finally {
      setBusyId(null)
    }
  }

  const sorted = [...alerts].sort((a, b) => {
    const ackA = a.acknowledged_at ? 1 : 0, ackB = b.acknowledged_at ? 1 : 0
    if (ackA !== ackB) return ackA - ackB
    const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    if (sev !== 0) return sev
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
  const openCritical = sorted.filter(a => !a.acknowledged_at && a.severity === 'critical').length

  return (
    <Screen>
      <AppBar
        title="Dispatcher alerts"
        sub="No-unit searches and stale crews"
        onBack={() => navigation.goBack()}
      />

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={t.q.primary} />
        </View>
      ) : (
        <Body refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load() }}
            tintColor={t.q.primary} colors={[t.q.primary]} />
        }>
          {openCritical > 0 && (
            <Notice tone="red" icon="warning">
              {openCritical} unacknowledged critical {openCritical === 1 ? 'alert' : 'alerts'} — a
              high-acuity request went unserved.
            </Notice>
          )}

          {!sorted.length ? (
            <Card style={{ marginTop: 12 }}>
              <Empty
                icon="checkmark-done-outline"
                title="No alerts"
                body="Every transport request so far has found a unit."
              />
            </Card>
          ) : (
            <Card>
              {sorted.map((a, i) => {
                const done = !!a.acknowledged_at
                const tone: PillTone = done ? 'neutral'
                  : a.severity === 'critical' || a.severity === 'high' ? 'red'
                  : a.severity === 'medium' ? 'amber' : 'neutral'
                return (
                  <View key={a.id}>
                    {i > 0 && <Hair />}
                    <Row
                      icon={a.kind === 'tracking_stale' ? 'cellular-outline' : 'alert-circle-outline'}
                      iconTone={tone}
                      tint={!done && (a.severity === 'critical' || a.severity === 'high')}
                      dim={done}
                      title={KIND_LABEL[a.kind] ?? a.kind}
                      sub={[
                        a.request?.booking_ref,
                        a.request?.caller_patient_name,
                        a.request?.triage_level != null ? `P${a.request.triage_level}` : null,
                        ago(a.created_at),
                      ].filter(Boolean).join(' · ')}
                      pill={done ? 'Resolved' : a.severity}
                      pillTone={tone}
                      pillSolid={!done && a.severity === 'critical'}
                    />

                    <View style={{ paddingHorizontal: 14, paddingBottom: 12, gap: 10 }}>
                      <Text style={{ fontSize: 12.5, lineHeight: 18, color: t.q.ink70 }}>{a.message}</Text>

                      {!!a.request?.pickup_address && (
                        <Text numberOfLines={1} style={{ fontSize: 12, color: t.q.ink60 }}>
                          {a.request.pickup_address}
                        </Text>
                      )}

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        {!!a.request?.contact_phone && (
                          <Btn
                            label="Call the caller" variant="secondary" small icon="call-outline"
                            onPress={() => Linking.openURL(`tel:${a.request!.contact_phone}`).catch(() => {})}
                          />
                        )}
                        {done ? (
                          <Mono size={11} color={t.q.ink60}>
                            {`Acknowledged${a.ack?.full_name ? ' by ' + a.ack.full_name : ''} · ${ago(a.acknowledged_at!)}`}
                          </Mono>
                        ) : (
                          <Btn
                            label="Acknowledge" small icon="checkmark"
                            loading={busyId === a.id}
                            onPress={() => acknowledge(a.id)}
                          />
                        )}
                      </View>
                    </View>
                  </View>
                )
              })}
            </Card>
          )}
        </Body>
      )}
    </Screen>
  )
}
