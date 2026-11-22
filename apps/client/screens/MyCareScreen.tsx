import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { useFocusEffect } from '@react-navigation/native'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { useAuth } from '@queue/shared/contexts/AuthContext'
import { getCompletedAppointments } from '@queue/shared/lib/api'
import { Screen, AppBar, Body, Card, Row, Hair, SectionHead, Empty } from '@queue/shared/components/q'

interface Props { navigation: any }

/**
 * My Records -- the fourth tab in the v4 handoff.
 *
 * The handoff's version opens on a Labs / Medicines / Visits switch and a
 * "Recent results" list. There is no lab-results model (the app's "labs" tab
 * has always rendered diagnoses), so the switch is not drawn and the list
 * shows what the record genuinely holds: what a doctor wrote at a completed
 * visit. A tab called Labs with nothing behind it is worse than no tab.
 */
export function MyCareScreen({ navigation }: Props) {
  const { theme: t } = useTheme()
  const { user, switchedInto } = useAuth() as any
  const who = switchedInto ? user?.full_name?.split(' ')[0] : null
  const [recent, setRecent] = useState<any[]>([])
  const [loaded, setLoaded] = useState(false)

  useFocusEffect(useCallback(() => {
    if (!user) return
    getCompletedAppointments(user.id).then(list => {
      setRecent((list ?? []).filter((a: any) => a.diagnosis || a.doctor_notes).slice(0, 4))
      setLoaded(true)
    })
  }, [user?.id]))

  return (
    <Screen>
      <AppBar large title="My records" />
      <Body>
        <View style={{ paddingHorizontal: 20, paddingBottom: 4 }}>
          <Text style={{ fontSize: 14, lineHeight: 20, color: t.q.ink60 }}>
            {who
              ? `Records, medicines and plans for ${who}.`
              : 'Results, medicines and plans in one place.'}
          </Text>
        </View>

        <SectionHead title="From your visits" />
        <Card>
          {!loaded ? (
            <Row title="Loading your record…" sub="This takes a moment" />
          ) : recent.length === 0 ? (
            <Empty
              icon="document-text-outline"
              title="Nothing recorded yet"
              body="After a completed visit, the diagnosis and your doctor's notes appear here."
            />
          ) : (
            recent.map((a, i) => (
              <View key={a.id}>
                {i > 0 && <Hair />}
                <Row
                  icon="flask-outline"
                  title={a.diagnosis ?? 'Consultation notes'}
                  sub={[
                    a.doctor?.full_name,
                    new Date(a.appointment_date + 'T00:00:00').toLocaleDateString('en-NG', { day: 'numeric', month: 'short' }),
                  ].filter(Boolean).join(' · ')}
                  pill="Reviewed" pillTone="green"
                  chevron
                  onPress={() => navigation.navigate('Prescriptions')}
                />
              </View>
            ))
          )}
        </Card>

        <SectionHead title="Care" />
        <Card>
          <Row icon="checkbox-outline" title="Care plans" sub="Tasks and readings your hospital set"
            chevron onPress={() => navigation.navigate('CarePlans')} />
          <Hair />
          <Row icon="medkit-outline" title="Prescriptions" sub="Medicines, notes and diagnoses"
            chevron onPress={() => navigation.navigate('Prescriptions')} />
          <Hair />
          <Row icon="person-circle-outline" title="Health profile" sub="Blood group, genotype, conditions, allergies"
            chevron onPress={() => navigation.navigate('MedicalHistory')} />
          <Hair />
          <Row icon="calendar-outline" title="Follow-up" sub="Book your next visit around your results"
            chevron onPress={() => navigation.navigate('LabHub')} />
        </Card>

        <SectionHead title="History" />
        <Card>
          <Row icon="time-outline" title="Past visits" sub="Every completed and cancelled visit"
            chevron onPress={() => navigation.navigate('Appointments')} />
          <Hair />
          <Row icon="people-outline" title="Dependents" sub="People whose care you manage"
            chevron onPress={() => navigation.navigate('Dependents')} />
        </Card>
      </Body>
    </Screen>
  )
}
