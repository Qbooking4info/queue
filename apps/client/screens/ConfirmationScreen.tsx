import { View } from 'react-native'
import { Text } from '@queue/shared/components/ui/Typography'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '@queue/shared/contexts/ThemeContext'
import { addToGoogleCalendar } from '@queue/shared/lib/calendar'
import {
  Screen, AppBar, Body, Card, Journey, Notice, SectionHead, DetailRow,
  Btn, BottomBar, Mono,
} from '@queue/shared/components/q'

interface Props { navigation: any; route: any }

export function ConfirmationScreen({ navigation, route }: Props) {
  const { theme: t } = useTheme()

  const {
    hospital,
    doctor,          // null for physical, or virtual with no preference
    bookingRef,
    approvalStatus,  // 'auto_approved' | 'pending_approval'
    selectedDate,
    startTime,
    urgency,
    bookingType,     // 'virtual' | 'physical' | 'home_visit'
    directBooking,   // true for a direct-to-doctor booking (no hospital involved)
  } = route.params ?? {}

  const isPending = approvalStatus === 'pending_approval'
  const isVirtual = bookingType === 'virtual'
  const isHomeVisit = bookingType === 'home_visit'
  const doctorName = doctor?.full_name ?? doctor?.name ?? null
  const reviewer = directBooking ? 'the doctor' : 'the hospital'

  function goHome() {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Home' } }] })
  }
  function goBookings() {
    navigation.reset({ index: 0, routes: [{ name: 'MainTabs', params: { screen: 'Appointments' } }] })
  }

  // The same rail the visit carries from here on. A booking awaiting review has
  // not passed "Booked" yet -- showing it further along would promise a place
  // in a queue nobody has agreed to give.
  const steps = ['Booked', 'Paid', 'Checked in', 'In the queue', 'Called', 'Seen']

  const next: string[] = directBooking
    ? [
        `${doctorName ?? 'The doctor'} reviews your request`,
        'You get a notification once they confirm, or suggest another time',
        isVirtual
          ? 'The call link appears on the appointment when the time comes'
          : 'They come to the address you gave, at the confirmed time',
      ]
    : isVirtual
      ? isPending
        ? ['The hospital reviews your request', 'You get a notification when it is approved', 'A doctor is confirmed for your session']
        : [
            doctorName ? `Your video visit with ${doctorName} is confirmed` : 'The hospital assigns a doctor for your session',
            'Keep your phone on during your window — the doctor calls you',
          ]
      : [
          `Arrive at ${hospital?.name ?? 'the hospital'}${startTime ? ` around ${String(startTime).slice(0, 5)}` : ''}`,
          'Show your queue pass at the front desk to check in',
          'Watch your number — we call you when it is your turn',
        ]

  return (
    <Screen>
      <AppBar title={isPending ? 'Request sent' : 'You are booked'} sub={bookingRef ?? undefined} />

      <Body>
        <View style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20, gap: 8 }}>
          <View style={{
            width: 64, height: 64, borderRadius: 32,
            backgroundColor: isPending ? t.q.amberBg : t.q.greenBg,
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Ionicons
              name={isPending ? 'hourglass-outline' : 'checkmark'}
              size={30}
              color={isPending ? t.q.amber : t.q.green}
            />
          </View>
          <Text style={{ fontSize: 24, fontWeight: '800', letterSpacing: -0.6, color: t.q.ink, textAlign: 'center' }}>
            {isPending ? 'Request sent' : 'You are booked'}
          </Text>
          <Text style={{ fontSize: 13.5, lineHeight: 20, color: t.q.ink60, textAlign: 'center' }}>
            {isPending
              ? `${reviewer.charAt(0).toUpperCase() + reviewer.slice(1)} will review your request and let you know.`
              : [hospital?.name, doctorName, selectedDate].filter(Boolean).join(' · ')}
          </Text>
        </View>

        {!isPending && <Journey steps={steps} activeIndex={0} />}

        {isPending && (
          <Notice tone="amber" icon="hourglass-outline">
            Nothing is charged while this is under review. If {reviewer} declines, there is nothing to pay.
          </Notice>
        )}

        <Card>
          <DetailRow label="Reference" value={bookingRef ?? '—'} mono />
          <DetailRow label="Type" value={isVirtual ? 'Video consultation' : isHomeVisit ? 'Home visit' : 'In person'} />
          {!directBooking && <DetailRow label="Hospital" value={hospital?.name ?? '—'} />}
          <DetailRow label="Doctor" value={doctorName ?? (isVirtual ? 'Hospital assigns' : 'Assigned on arrival')} />
          <DetailRow label="Date" value={selectedDate ?? '—'} />
          <DetailRow
            label="Priority"
            value={urgency ? urgency.charAt(0).toUpperCase() + urgency.slice(1) : 'Routine'}
            last
          />
        </Card>

        <SectionHead title="What happens next" />
        <Card pad>
          {next.map((line, i) => (
            <View key={line} style={{ flexDirection: 'row', gap: 12, paddingVertical: 7 }}>
              <Mono size={13} weight="700" color={t.q.primary}>{i + 1}</Mono>
              <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 19, color: t.q.ink70 }}>{line}</Text>
            </View>
          ))}
        </Card>

        {!!selectedDate && /^\d{4}-\d{2}-\d{2}$/.test(selectedDate) && (
          <View style={{ paddingHorizontal: 16, paddingTop: 14 }}>
            <Btn
              label="Add to Google Calendar" variant="secondary" small icon="calendar-outline"
              onPress={() => addToGoogleCalendar({
                title: `${isVirtual ? 'Video visit' : 'Hospital visit'}${doctorName ? ` with ${doctorName}` : ''}`,
                date: selectedDate,
                time: startTime ?? null,
                location: isVirtual ? 'Queue app (video)' : hospital?.name,
                details: `Booking ${bookingRef ?? ''} · Queue`,
              }).catch(() => {})}
            />
          </View>
        )}
      </Body>

      <BottomBar>
        <Btn label="Home" variant="secondary" onPress={goHome} />
        <Btn grow label="View booking" onPress={goBookings} />
      </BottomBar>
    </Screen>
  )
}
