import { useCallback, useState } from 'react'
import { View, ActivityIndicator, RefreshControl, KeyboardAvoidingView, Platform } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { Alert } from '@queue/shared/contexts/AlertContext'
import { supabase } from '@queue/shared/lib/supabase'
import { haptics } from '@queue/shared/lib/haptics'
import { fmtDate } from '@queue/shared/lib/format'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Seg, Chip,
  Field, Btn, Empty, Mono, Notice, Initials, type PillTone,
} from '@queue/shared/components/q'

interface Props { navigation: any }

type Tab = 'open' | 'done'

interface OrderRow {
  id: string
  test_name: string
  specimen: string | null
  instructions: string | null
  urgency: 'routine' | 'urgent' | 'stat'
  status: 'ordered' | 'collected' | 'resulted' | 'cancelled'
  created_at: string
  appointment_id: string
  patient: { full_name: string } | { full_name: string }[] | null
  doctor: { full_name: string } | { full_name: string }[] | null
}

function one<T>(x: T | T[] | null): T | null {
  return (Array.isArray(x) ? x[0] : x) ?? null
}

const URGENCY: Record<string, { label: string; tone: PillTone }> = {
  stat:    { label: 'Immediately', tone: 'red' },
  urgent:  { label: 'Urgent',      tone: 'amber' },
  routine: { label: 'Routine',     tone: 'neutral' },
}

const FLAGS = ['normal', 'low', 'high', 'critical', 'indeterminate'] as const

/**
 * The laboratory desk: tests doctors have ordered here, and where results are
 * filed against them.
 *
 * This is the half that makes ordering a test mean anything. Without it
 * test_orders would fill up and nothing would ever come back, so the patient's
 * Labs tab would be a permanent "waiting on the laboratory".
 *
 * Filing a result closes its order by trigger (20261121000006) — this screen
 * does not set the status itself, so the two can never disagree.
 */
export function LabOrdersScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { staffProfile } = useAuth()
  const hospitalId = staffProfile?.hospitalId

  const [tab, setTab] = useState<Tab>('open')
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  // Result form, per order
  const [filing, setFiling] = useState<OrderRow | null>(null)
  const [analyte, setAnalyte] = useState('')
  const [value, setValue] = useState('')
  const [unit, setUnit] = useState('')
  const [range, setRange] = useState('')
  const [flag, setFlag] = useState<(typeof FLAGS)[number]>('normal')
  const [note, setNote] = useState('')

  const load = useCallback(async (silent = false) => {
    if (!hospitalId) { setLoading(false); return }
    if (!silent) setLoading(true)
    const { data } = await supabase
      .from('test_orders')
      .select(`
        id, test_name, specimen, instructions, urgency, status, created_at, appointment_id,
        patient:users!test_orders_patient_id_fkey(full_name),
        doctor:doctors!test_orders_doctor_id_fkey(full_name)
      `)
      .eq('hospital_id', hospitalId)
      .order('created_at', { ascending: false })
      .limit(100)
    setOrders((data as any[] as OrderRow[]) ?? [])
    setLoading(false)
  }, [hospitalId])

  useFocusEffect(useCallback(() => { load() }, [load]))

  async function markCollected(o: OrderRow) {
    setBusy(o.id)
    const { error } = await supabase.from('test_orders')
      .update({ status: 'collected', collected_at: new Date().toISOString() } as never)
      .eq('id', o.id)
    setBusy(null)
    if (error) { haptics.error(); Alert.alert('Could not update it', error.message); return }
    haptics.success()
    load(true)
  }

  function openFiling(o: OrderRow) {
    setFiling(o)
    // Most tests report one value under the test's own name, so seeding the
    // analyte saves the common case a field.
    setAnalyte(o.test_name)
    setValue(''); setUnit(''); setRange(''); setFlag('normal'); setNote('')
  }

  async function fileResult() {
    if (!filing || !analyte.trim() || !value.trim()) return
    setBusy(filing.id)
    const numeric = Number(value.replace(/[^0-9.\-]/g, ''))
    const { error } = await supabase.from('lab_results').insert({
      test_order_id: filing.id,
      analyte:       analyte.trim(),
      value_text:    value.trim(),
      // Stored alongside the text where the result is a number, so a trend can
      // be drawn later. A culture ("no growth") keeps text alone.
      value_numeric: Number.isFinite(numeric) && /\d/.test(value) ? numeric : null,
      unit:          unit.trim() || null,
      reference_range: range.trim() || null,
      flag,
      note:          note.trim() || null,
    } as never)
    setBusy(null)
    if (error) { haptics.error(); Alert.alert('Could not file it', error.message); return }
    haptics.success()
    setFiling(null)
    load(true)
  }

  const open = orders.filter(o => o.status === 'ordered' || o.status === 'collected')
  const done = orders.filter(o => o.status === 'resulted' || o.status === 'cancelled')
  const list = tab === 'open' ? open : done
  const urgent = open.filter(o => o.urgency !== 'routine')

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <AppBar title="Laboratory" sub={`${open.length} waiting`}
          onBack={navigation?.canGoBack?.() ? () => navigation.goBack() : undefined} />

        <Seg<Tab>
          value={tab} onChange={setTab}
          options={[
            { key: 'open', label: open.length ? `Waiting · ${open.length}` : 'Waiting' },
            { key: 'done', label: 'Filed' },
          ]} />

        {loading ? (
          <ActivityIndicator color={t.q.primary} style={{ marginTop: 40 }} />
        ) : (
          <Body refreshControl={
            <RefreshControl refreshing={refreshing} tintColor={t.q.primary} colors={[t.q.primary]}
              onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false) }} />
          }>
            {tab === 'open' && urgent.length > 0 && (
              <Notice tone={urgent.some(o => o.urgency === 'stat') ? 'red' : 'amber'} icon="alert-circle">
                {urgent.length === 1
                  ? `${urgent[0].test_name} for ${one(urgent[0].patient)?.full_name ?? 'a patient'} was ordered ${URGENCY[urgent[0].urgency].label.toLowerCase()}.`
                  : `${urgent.length} tests are ordered urgently or immediately.`}
              </Notice>
            )}

            {list.length === 0 ? (
              <Card>
                <Empty
                  icon="flask-outline"
                  title={tab === 'open' ? 'Nothing waiting' : 'Nothing filed yet'}
                  body={tab === 'open'
                    ? 'Tests a doctor orders at a consultation appear here for collection and reporting.'
                    : 'Results you file, and cancelled orders, stay here.'} />
              </Card>
            ) : list.map(o => {
              const u = URGENCY[o.urgency] ?? URGENCY.routine
              const patient = one(o.patient)?.full_name ?? 'Patient'
              const doctor = one(o.doctor)?.full_name
              const isFiling = filing?.id === o.id
              return (
                <Card key={o.id} style={{ marginTop: 12 }}>
                  <Row
                    leading={<Initials name={patient} size={40} />}
                    title={o.test_name}
                    sub={[patient, doctor ? `ordered by ${doctor}` : null, fmtDate(o.created_at.slice(0, 10))]
                      .filter(Boolean).join(' · ')}
                    pill={o.status === 'resulted' ? 'Filed'
                      : o.status === 'cancelled' ? 'Cancelled'
                      : o.status === 'collected' ? 'Sample taken' : u.label}
                    pillTone={o.status === 'resulted' ? 'green'
                      : o.status === 'cancelled' ? 'neutral'
                      : o.status === 'collected' ? 'teal' : u.tone}
                    pillSolid={o.status !== 'resulted' && o.urgency === 'stat'} />

                  {!!o.instructions && (
                    <>
                      <Hair />
                      <View style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                        <Text style={{ fontSize: 13, lineHeight: 19, color: t.q.ink70 }}>{o.instructions}</Text>
                      </View>
                    </>
                  )}

                  {isFiling ? (
                    <>
                      <Hair />
                      <View style={{ padding: 14, gap: 12 }}>
                        <CardLabel>File a result</CardLabel>
                        <Field label="What was measured" value={analyte} onChangeText={setAnalyte}
                          placeholder="e.g. Haemoglobin" />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Field label="Result" value={value} onChangeText={setValue} placeholder="12.4" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Field label="Unit" value={unit} onChangeText={setUnit} placeholder="g/dL" />
                          </View>
                        </View>
                        <Field label="Normal range" value={range} onChangeText={setRange} placeholder="12.0 – 15.0" />
                        <View style={{ gap: 8 }}>
                          <CardLabel>How to read it</CardLabel>
                          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {FLAGS.map(f => (
                              <Chip key={f} label={f} on={flag === f}
                                onPress={() => { haptics.tap(); setFlag(f) }} />
                            ))}
                          </View>
                          <Text style={{ fontSize: 11.5, lineHeight: 16, color: t.q.ink60 }}>
                            The patient's app colours the result on this, so it has to be right — it does not
                            compare the value to the range itself.
                          </Text>
                        </View>
                        <Field label="Note (optional)" value={note} onChangeText={setNote}
                          placeholder="Anything the doctor should know" />
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <Btn grow label="Cancel" variant="secondary" onPress={() => setFiling(null)} />
                          <Btn grow label="File result" loading={busy === o.id}
                            disabled={!analyte.trim() || !value.trim()} onPress={fileResult} />
                        </View>
                      </View>
                    </>
                  ) : o.status === 'ordered' || o.status === 'collected' ? (
                    <>
                      <Hair />
                      <View style={{ flexDirection: 'row', gap: 10, padding: 14 }}>
                        {o.status === 'ordered' && (
                          <Btn label="Sample taken" variant="secondary" loading={busy === o.id}
                            onPress={() => markCollected(o)} />
                        )}
                        <Btn grow label="File result" onPress={() => openFiling(o)} />
                      </View>
                    </>
                  ) : null}
                </Card>
              )
            })}
          </Body>
        )}
      </Screen>
    </KeyboardAvoidingView>
  )
}
