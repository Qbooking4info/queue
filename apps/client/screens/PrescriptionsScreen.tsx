import { useState, useCallback } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { getCompletedAppointments } from '@queue/shared/lib/api'
import { fmtDate } from '@queue/shared/lib/format'
import {
  getMyPrescriptions, getMyTestOrders, getResultsFor, prescriptionLine, flagTone,
  type Prescription, type TestOrder, type LabResult,
} from '@queue/shared/lib/clinical-orders'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Seg, Empty,
  Mono, Pill, Notice,
} from '@queue/shared/components/q'

interface Props { navigation: any }

type Tab = 'medicines' | 'labs' | 'diagnoses'

/**
 * Prescriptions and labs.
 *
 * The medicines tab reads the real `prescriptions` rows where they exist and
 * falls back to the free text a doctor wrote before those existed, so a
 * patient's history does not develop a hole at the date the table was added.
 */
export function PrescriptionsScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user } = useAuth()
  const [appts, setAppts] = useState<any[]>([])
  const [drugs, setDrugs] = useState<Prescription[]>([])
  const [orders, setOrders] = useState<TestOrder[]>([])
  const [results, setResults] = useState<Record<string, LabResult[]>>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('medicines')

  const load = useCallback(async () => {
    // No signed-in user means there is nothing to load and never will be;
    // returning without clearing `loading` leaves a spinner for ever.
    if (!user) { setLoading(false); return }
    setLoading(true)
    const [completed, rx, tests] = await Promise.all([
      getCompletedAppointments(user.id),
      getMyPrescriptions().catch(() => []),
      getMyTestOrders().catch(() => []),
    ])
    setAppts(completed)
    setDrugs(rx)
    setOrders(tests)
    setResults(await getResultsFor(tests.map(o => o.id)).catch(() => ({})))
    setLoading(false)
  }, [user])

  useFocusEffect(useCallback(() => { load() }, [load]))

  const withNotes = appts.filter(a => a.doctor_notes || a.prescription)
  const withDiagnosis = appts.filter(a => a.diagnosis)
  const active = drugs.filter(d => d.status !== 'cancelled')
  const resulted = orders.filter(o => o.status === 'resulted')
  const pending = orders.filter(o => o.status === 'ordered' || o.status === 'collected')
  // Anything a patient should not have to scroll to find.
  const flagged = Object.values(results).flat().filter(r => r.flag === 'critical' || r.flag === 'high' || r.flag === 'low')

  return (
    <Screen>
      <AppBar title="Prescriptions & labs" onBack={() => navigation.goBack()} />
      <Seg<Tab>
        value={tab} onChange={setTab}
        options={[
          { key: 'medicines', label: active.length ? `Medicines · ${active.length}` : 'Medicines' },
          { key: 'labs', label: orders.length ? `Labs · ${orders.length}` : 'Labs' },
          { key: 'diagnoses', label: 'Diagnoses' },
        ]}
      />

      {loading ? (
        <ActivityIndicator color={t.q.primary} style={{ marginTop: 40 }} />
      ) : (
        <Body>
          {tab === 'medicines' ? (
            <>
              {active.length > 0 && (
                <>
                  <SectionHead title="Prescribed to you" />
                  <Card>
                    {active.map((p, i) => (
                      <View key={p.id}>
                        {i > 0 && <Hair />}
                        <Row
                          icon="medkit-outline"
                          iconTone={p.status === 'dispensed' ? 'green' : 'teal'}
                          title={p.drug_name}
                          sub={[prescriptionLine(p), fmtDate(p.created_at.slice(0, 10))].filter(Boolean).join(' · ')}
                          pill={p.status === 'dispensed' ? 'Collected' : 'To collect'}
                          pillTone={p.status === 'dispensed' ? 'green' : 'amber'} />
                      </View>
                    ))}
                  </Card>
                  {active.some(p => p.status !== 'dispensed') && (
                    <Notice tone="neutral" icon="information-circle-outline">
                      "To collect" means the pharmacy has not recorded giving it to you yet. If you already
                      have it, nothing is wrong — ask them to mark it.
                    </Notice>
                  )}
                </>
              )}

              <SectionHead title={active.length ? 'Written notes from your visits' : 'From your completed visits'} />
              {withNotes.length === 0 ? (
                <Card>
                  <Empty icon="medkit-outline" title="Nothing written yet"
                    body="Medicines and notes from your completed consultations appear here." />
                </Card>
              ) : (
                withNotes.map(a => (
                  <View key={a.id} style={{ marginBottom: 12 }}>
                    <Card>
                      <Row
                        icon="medkit-outline"
                        title={a.doctor?.full_name ?? 'Doctor'}
                        sub={[a.doctor?.specialty?.name, a.hospital?.name, fmtDate(a.appointment_date)].filter(Boolean).join(' · ')}
                      />
                      <Hair />
                      {!!a.prescription && (
                        <View style={{ padding: 14, paddingBottom: 8 }}>
                          <CardLabel>Prescription</CardLabel>
                          <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink, marginTop: 4 }}>{a.prescription}</Text>
                        </View>
                      )}
                      {!!a.doctor_notes && (
                        <View style={{ padding: 14, paddingTop: a.prescription ? 0 : 14 }}>
                          <CardLabel>Doctor&apos;s notes</CardLabel>
                          <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink, marginTop: 4 }}>{a.doctor_notes}</Text>
                        </View>
                      )}
                    </Card>
                  </View>
                ))
              )}
            </>
          ) : tab === 'labs' ? (
            <>
              {flagged.length > 0 && (
                <Notice tone={flagged.some(r => r.flag === 'critical') ? 'red' : 'amber'} icon="alert-circle">
                  {flagged.length === 1
                    ? `One result is outside the normal range: ${flagged[0].analyte}.`
                    : `${flagged.length} results are outside the normal range.`}
                  {' '}Your doctor sees these too — ask them what they mean for you.
                </Notice>
              )}

              {pending.length > 0 && (
                <>
                  <SectionHead title={`Waiting on the laboratory · ${pending.length}`} />
                  <Card>
                    {pending.map((o, i) => (
                      <View key={o.id}>
                        {i > 0 && <Hair />}
                        <Row
                          compact
                          icon="flask-outline"
                          iconTone={o.urgency === 'stat' ? 'red' : o.urgency === 'urgent' ? 'amber' : 'neutral'}
                          title={o.test_name}
                          sub={`Ordered ${fmtDate(o.created_at.slice(0, 10))}`}
                          pill={o.status === 'collected' ? 'Sample taken' : 'Ordered'}
                          pillTone="neutral" />
                      </View>
                    ))}
                  </Card>
                </>
              )}

              <SectionHead title={resulted.length ? `Results · ${resulted.length}` : 'Results'} />
              {resulted.length === 0 ? (
                <Card>
                  <Empty icon="flask-outline" title="No results yet"
                    body={pending.length
                      ? 'Your results appear here as soon as the laboratory files them.'
                      : 'When a doctor orders a test, it and its result appear here.'} />
                </Card>
              ) : resulted.map(o => (
                <View key={o.id} style={{ marginBottom: 12 }}>
                  <Card>
                    <Row
                      icon="flask-outline" iconTone="green"
                      title={o.test_name}
                      sub={`Ordered ${fmtDate(o.created_at.slice(0, 10))}`}
                      pill="Resulted" pillTone="green" />
                    {(results[o.id] ?? []).map(r => (
                      <View key={r.id}>
                        <Hair />
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: t.q.ink }}>{r.analyte}</Text>
                            {!!r.reference_range && (
                              <Text style={{ fontSize: 12, color: t.q.ink60, marginTop: 2 }}>
                                Normal range {r.reference_range}{r.unit ? ` ${r.unit}` : ''}
                              </Text>
                            )}
                          </View>
                          <Mono size={14} weight="700"
                            color={r.flag === 'critical' ? t.q.red : r.flag === 'high' || r.flag === 'low' ? t.q.amber : t.q.ink}>
                            {r.value_text ?? (r.value_numeric != null ? String(r.value_numeric) : '—')}
                            {r.unit ? ` ${r.unit}` : ''}
                          </Mono>
                          {r.flag !== 'normal' && (
                            <Pill
                              label={r.flag === 'critical' ? 'Critical' : r.flag === 'high' ? 'High' : r.flag === 'low' ? 'Low' : 'Unclear'}
                              tone={flagTone(r.flag)}
                              solid={r.flag === 'critical'} />
                          )}
                        </View>
                        {!!r.note && (
                          <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
                            <Text style={{ fontSize: 12.5, lineHeight: 18, color: t.q.ink70 }}>{r.note}</Text>
                          </View>
                        )}
                      </View>
                    ))}
                  </Card>
                </View>
              ))}
            </>
          ) : (
            <>
              <SectionHead title="Recorded by your doctors" />
              {withDiagnosis.length === 0 ? (
                <Card>
                  <Empty icon="clipboard-outline" title="No diagnoses on file"
                    body="A diagnosis recorded during a completed consultation appears here." />
                </Card>
              ) : (
                withDiagnosis.map(a => (
                  <View key={a.id} style={{ marginBottom: 12 }}>
                    <Card>
                      <Row
                        icon="clipboard-outline"
                        title={a.diagnosis}
                        sub={[a.doctor?.full_name, fmtDate(a.appointment_date)].filter(Boolean).join(' · ')}
                        pill="Reviewed" pillTone="green"
                      />
                      {!!a.doctor_notes && (
                        <>
                          <Hair />
                          <View style={{ padding: 14 }}>
                            <CardLabel>Notes</CardLabel>
                            <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink, marginTop: 4 }}>{a.doctor_notes}</Text>
                          </View>
                        </>
                      )}
                    </Card>
                  </View>
                ))
              )}
            </>
          )}
        </Body>
      )}
    </Screen>
  )
}
