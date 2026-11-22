/**
 * Referral inbox -- every referral written to this doctor, newest first.
 *
 * A referral is an ordinary appointment row with booking_mode 'referral'
 * (POST /api/appointments/refer writes it), carrying the referring doctor,
 * hospital and the clinical reason. They already arrive in the queue and the
 * schedule; what they did not have was a place to be READ as referrals --
 * urgency, who sent them and why -- before the patient is standing in front of
 * you.
 *
 * Accept and Decline are the doctor's own: PATCH /api/appointments/[id] makes
 * one narrow exception to approve/reject being hospital-staff actions, for a
 * referral that names this doctor and is still awaiting a decision. Everything
 * else about who owns a slot is unchanged -- a doctor still cannot approve
 * ordinary bookings into their clinic.
 */
import { useCallback, useState } from 'react'
import { View, RefreshControl } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { SkeletonCard } from '@queue/shared/components/ui/Skeleton'
import { startConversation } from '@queue/shared/lib/chat'
import { decideReferral } from '@queue/shared/lib/api'
import {
  Screen, AppBar, Body, Card, Row, Hair, SectionHead, Chip, Empty, Initials,
  Mono, CardLabel, CardActions, CardAction, Pill, Btn, Field, type PillTone,
} from '@queue/shared/components/q'

interface ReferralRow {
  id: string
  booking_ref: string | null
  appointment_date: string
  start_time: string | null
  type: string
  status: string
  approval_status: string | null
  urgency: string | null
  reason: string | null
  referral_reason: string | null
  created_at: string
  walkin_patient_name: string | null
  referring_hospital_id: string | null
  patient: { full_name: string | null; gender: string | null; date_of_birth: string | null } | null
  referring_hospital: { name: string | null } | null
  referred_by: { full_name: string | null } | null
}

type Filter = 'all' | 'emergency' | 'urgent' | 'routine'

const URGENCY: Record<string, { label: string; tone: PillTone }> = {
  emergency: { label: 'Critical', tone: 'red' },
  urgent:    { label: 'Urgent',   tone: 'amber' },
  routine:   { label: 'Routine',  tone: 'neutral' },
}

function age(dob: string | null | undefined): number | null {
  if (!dob) return null
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return null
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
  return a >= 0 && a < 130 ? a : null
}

function when(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
}

export function ReferralInboxScreen({ navigation }: { navigation: any }) {
  const { theme: t } = useTheme()
  const { doctorProfile } = useAuth()
  const [rows, setRows] = useState<ReferralRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [deciding, setDeciding] = useState<string | null>(null)
  const [declining, setDeclining] = useState<ReferralRow | null>(null)
  const [declineNote, setDeclineNote] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!doctorProfile) { setLoading(false); return }
    if (!silent) setLoading(true)
    const { data } = await supabase
      .from('appointments')
      .select(`
        id, booking_ref, appointment_date, start_time, type, status, approval_status,
        urgency, reason, referral_reason, created_at, walkin_patient_name, referring_hospital_id,
        patient:users!appointments_patient_id_fkey(full_name, gender, date_of_birth),
        referring_hospital:hospitals!appointments_referring_hospital_id_fkey(name),
        referred_by:doctors!appointments_referred_by_doctor_id_fkey(full_name)
      `)
      .eq('doctor_id', doctorProfile.doctorId)
      .eq('booking_mode', 'referral')
      .order('created_at', { ascending: false })
      .limit(100)
    setRows((data as any[] as ReferralRow[]) ?? [])
    setLoading(false)
  }, [doctorProfile])

  useFocusEffect(useCallback(() => { load() }, [load]))

  // Only the hospitals this doctor is actually linked to can be messaged --
  // start_conversation re-checks the relationship server-side, so offering it
  // for a hospital they have no link to would just be a refusal in a modal.
  const linkedIds = new Set((doctorProfile?.linkedHospitals ?? []).map(h => h.hospitalId))

  async function message(hospitalId: string) {
    setBusy(hospitalId)
    const r = await startConversation('hospital', hospitalId)
    setBusy(null)
    if (!r.ok) {
      haptics.error()
      Alert.alert('Messages', r.notReady ? 'Messaging is being switched on. Please check back soon.' : r.error)
      return
    }
    navigation.navigate('Chat', { conversationId: r.data })
  }

  async function decide(r: ReferralRow, decision: { action: 'approve' } | { action: 'reject'; note: string }) {
    setDeciding(r.id)
    const err = await decideReferral(r.id, decision)
    setDeciding(null)
    if (err) { haptics.error(); Alert.alert('That did not work', err); return }
    haptics.success()
    setDeclining(null); setDeclineNote('')
    load(true)
  }

  const pending = rows.filter(r => r.approval_status === 'pending_approval' && r.status !== 'cancelled')
  const shown = rows.filter(r => filter === 'all' || (r.urgency ?? 'routine') === filter)
  const open = shown.filter(r => !['completed', 'cancelled'].includes(r.status))
  const closed = shown.filter(r => ['completed', 'cancelled'].includes(r.status))

  function card(r: ReferralRow, dim = false) {
    const u = URGENCY[r.urgency ?? 'routine'] ?? URGENCY.routine
    const name = r.patient?.full_name ?? r.walkin_patient_name ?? 'Patient'
    const a = age(r.patient?.date_of_birth)
    const from = r.referring_hospital?.name ?? 'Another hospital'
    const awaiting = r.approval_status === 'pending_approval' && r.status !== 'cancelled'
    const canMessage = !!r.referring_hospital_id && linkedIds.has(r.referring_hospital_id)
    return (
      <Card key={r.id} style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingTop: 12 }}>
          <CardLabel style={{ flex: 1 }}>
            {r.booking_ref ? `Referral ${r.booking_ref}` : 'Referral'}
          </CardLabel>
          <Mono size={11} color={t.q.ink60}>{when(r.created_at)}</Mono>
        </View>
        <Row
          leading={<Initials name={name} size={40} tint={r.urgency === 'emergency' ? '#7F1D1D' : undefined} />}
          title={[name, a != null ? `${a}` : null].filter(Boolean).join(', ')}
          sub={[from, r.referred_by?.full_name ? `Dr ${r.referred_by.full_name}` : null].filter(Boolean).join(' · ')}
          pill={u.label}
          pillTone={u.tone}
          pillSolid={r.urgency === 'emergency'}
          dim={dim}
          chevron
          onPress={() => navigation.navigate('PatientDetails', { appointmentId: r.id })}
        />
        {!!(r.referral_reason || r.reason) && (
          <>
            <Hair />
            <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
              <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink }}>
                {r.referral_reason || r.reason}
              </Text>
            </View>
          </>
        )}
        <Hair />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
          <Mono size={12} color={t.q.ink60}>
            {new Date(r.appointment_date + 'T00:00:00').toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short' })}
            {r.start_time ? ` · ${r.start_time.slice(0, 5)}` : ''}
          </Mono>
          <View style={{ flex: 1 }} />
          {awaiting
            ? <Pill label="Needs your answer" tone="amber" />
            : r.status === 'cancelled'
              ? <Pill label="Declined" tone="red" />
              : r.status === 'completed'
                ? <Pill label="Seen" tone="neutral" />
                : <Pill label="Booked in" tone="green" />}
        </View>
        {/* Only on a referral still waiting for an answer, and only on one
            addressed to this doctor -- which is every row this inbox shows. */}
        {awaiting && (
          declining?.id === r.id ? (
            <View style={{ padding: 14, gap: 10 }}>
              <Field label="Why are you declining?" value={declineNote} onChangeText={setDeclineNote}
                placeholder="The referring doctor sees this" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Btn grow label="Keep it" variant="secondary"
                  onPress={() => { setDeclining(null); setDeclineNote('') }} />
                <Btn grow label="Decline" variant="danger"
                  disabled={!declineNote.trim() || deciding === r.id}
                  onPress={() => decide(r, { action: 'reject', note: declineNote.trim() })} />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, padding: 14 }}>
              <Btn grow label="Accept" loading={deciding === r.id}
                onPress={() => decide(r, { action: 'approve' })} />
              <Btn label="Decline" variant="secondary"
                onPress={() => { setDeclining(r); setDeclineNote('') }} />
            </View>
          )
        )}

        <CardActions>
          <CardAction first label="Open patient"
            onPress={() => navigation.navigate('PatientDetails', { appointmentId: r.id })} />
          {canMessage && (
            <CardAction label={busy === r.referring_hospital_id ? 'Opening…' : 'Message them'}
              onPress={() => message(r.referring_hospital_id as string)} />
          )}
        </CardActions>
      </Card>
    )
  }

  return (
    <Screen>
      <AppBar
        large
        title="Referral inbox"
        sub={doctorProfile
          ? (pending.length ? `${pending.length} waiting on you` : `${rows.length} referral${rows.length === 1 ? '' : 's'}`)
          : 'Not linked to a hospital'} />

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}>
        {(['all', 'emergency', 'urgent', 'routine'] as Filter[]).map(f => (
          <Chip key={f} on={filter === f} onPress={() => { haptics.tap(); setFilter(f) }}
            label={f === 'all' ? 'All' : URGENCY[f].label} />
        ))}
      </View>

      {loading ? (
        <View style={{ paddingHorizontal: 16, gap: 12 }}><SkeletonCard /><SkeletonCard /></View>
      ) : (
        <Body refreshControl={
          <RefreshControl refreshing={refreshing} tintColor={t.q.primary} colors={[t.q.primary]}
            onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false) }} />
        }>
          {shown.length === 0 ? (
            <Card style={{ marginTop: 12 }}>
              <Empty
                icon="file-tray-outline"
                title={rows.length === 0 ? 'No referrals yet' : 'None at this urgency'}
                body={rows.length === 0
                  ? 'When another doctor refers a patient to you by name, the referral and its clinical reason land here.'
                  : 'Try another filter.'} />
            </Card>
          ) : (
            <>
              {open.map(r => card(r))}
              {closed.length > 0 && (
                <>
                  <SectionHead title={`Closed · ${closed.length}`} />
                  {closed.map(r => card(r, true))}
                </>
              )}
            </>
          )}
        </Body>
      )}
    </Screen>
  )
}
