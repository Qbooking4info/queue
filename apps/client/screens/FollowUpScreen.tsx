import { useCallback, useState } from 'react'
import { View, ActivityIndicator } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { getCompletedAppointments, getHospitalById } from '@queue/shared/lib/api'
import { toDisplayHospital } from '@queue/shared/lib/adapters'
import { fmtDate } from '@queue/shared/lib/format'
import { haptics } from '@queue/shared/lib/haptics'
import {
  Screen, AppBar, Body, Card, CardLabel, Row, Hair, SectionHead, Empty, Notice, Btn,
} from '@queue/shared/components/q'

interface Props { navigation: any }

/**
 * Follow-up: book your next visit around what the last one found.
 *
 * This is the half of the handoff's "Lab & appointment hub" that the data
 * supports. The lab-results checklist it opens with needs a lab-results model
 * that does not exist, and the calendar it closes with duplicates the booking
 * flow's own date picker -- so this screen shows the visits a follow-up would
 * be FOR, and hands each one to the booking flow with the hospital filled in.
 *
 * Note for later: there is a bookFollowUp() API, but the server checks the
 * caller is the treating doctor, so a patient cannot use it. A patient-side
 * follow-up therefore goes through the ordinary booking flow.
 */
export function FollowUpScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user } = useAuth()
  const [visits, setVisits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState<string | null>(null)

  useFocusEffect(useCallback(() => {
    if (!user) return
    getCompletedAppointments(user.id).then(list => {
      setVisits(list ?? [])
      setLoading(false)
    })
  }, [user?.id]))

  async function rebook(a: any) {
    haptics.tap()
    const hospitalId = a.hospital_id ?? a.hospital?.id
    if (!hospitalId) {
      navigation.navigate('Search')
      return
    }
    setOpening(a.id)
    const raw = await getHospitalById(String(hospitalId))
    setOpening(null)
    navigation.navigate('BookingFlow', {
      hospital: raw ? toDisplayHospital(raw) : undefined,
      bookingType: a.type === 'virtual' ? 'virtual' : 'physical',
    })
  }

  const last = visits[0]

  return (
    <Screen>
      <AppBar title="Follow-up" onBack={() => navigation.goBack()} />

      {loading ? (
        <ActivityIndicator color={t.q.primary} style={{ marginTop: 40 }} />
      ) : (
        <Body>
          {visits.length === 0 ? (
            <Card style={{ marginTop: 16 }}>
              <Empty
                icon="calendar-outline"
                title="No completed visits yet"
                body="Once you have been seen, you can book a follow-up around what the doctor found."
                action="Book a visit"
                onAction={() => navigation.navigate('Search')}
              />
            </Card>
          ) : (
            <>
              {!!last && (
                <>
                  <SectionHead title="Your last visit" />
                  <Card>
                    <Row
                      icon="medical-outline"
                      title={last.doctor?.full_name ?? 'Doctor'}
                      sub={[last.hospital?.name, fmtDate(last.appointment_date)].filter(Boolean).join(' · ')}
                      pill="Seen" pillTone="neutral"
                    />
                    {!!last.diagnosis && (
                      <>
                        <Hair />
                        <View style={{ padding: 14 }}>
                          <CardLabel>Diagnosis</CardLabel>
                          <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink, marginTop: 4 }}>
                            {last.diagnosis}
                          </Text>
                        </View>
                      </>
                    )}
                    {!!last.treatment_plan && (
                      <>
                        <Hair />
                        <View style={{ padding: 14 }}>
                          <CardLabel>Plan</CardLabel>
                          <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink, marginTop: 4 }}>
                            {last.treatment_plan}
                          </Text>
                        </View>
                      </>
                    )}
                  </Card>

                  <Notice tone="teal" icon="information-circle-outline">
                    Booking the same hospital keeps your record together, so the doctor sees what the last
                    visit found.
                  </Notice>

                  <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
                    <Btn
                      label={opening === last.id ? 'Opening…' : 'Book a follow-up'}
                      loading={opening === last.id}
                      onPress={() => rebook(last)}
                    />
                  </View>
                </>
              )}

              {visits.length > 1 && (
                <>
                  <SectionHead title="Earlier visits" />
                  <Card>
                    {visits.slice(1, 8).map((a, i) => (
                      <View key={a.id}>
                        {i > 0 && <Hair />}
                        <Row
                          icon="time-outline" iconTone="neutral"
                          title={a.doctor?.full_name ?? 'Doctor'}
                          sub={[a.diagnosis ?? a.hospital?.name, fmtDate(a.appointment_date)].filter(Boolean).join(' · ')}
                          right={opening === a.id ? <ActivityIndicator size="small" color={t.q.ink60} /> : undefined}
                          chevron={opening !== a.id}
                          onPress={() => rebook(a)}
                        />
                      </View>
                    ))}
                  </Card>
                </>
              )}
            </>
          )}
        </Body>
      )}
    </Screen>
  )
}
