/**
 * A gallery of the v4 kit, on fixtures only -- no auth, no network, no
 * navigation. It exists so the design system can be looked at (and compared
 * against the handoff HTML) without signing into the app and steering a real
 * patient into a real queue, and so the doctor, hospital and ambulance
 * redesigns have a reference for what the components already do.
 *
 * Mount it from an app's index.ts to inspect it:
 *   registerRootComponent(KitPreview)
 */
import { useState } from 'react'
import { View } from 'react-native'
import { Text } from '../ui/Typography'
import { ThemeProvider, useTheme, V4_PALETTES } from '../../contexts/ThemeContext'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import {
  Screen, AppBar, Body, Card, CardLabel, CardActions, CardAction, SectionHead,
  Row, Hair, Pill, Mono, Btn, SearchField, IconBtn, Initials, Empty, Journey,
  Seg, Chip, Notice, Stat, StatStrip, BigFigure, DetailRow, BottomBar, Field, NUMS,
} from './index'

function Gallery() {
  const { theme: t, mode, toggleTheme } = useTheme()
  const [seg, setSeg] = useState<'upcoming' | 'past'>('upcoming')
  const [chips, setChips] = useState<string[]>(['Open now'])
  const toggle = (c: string) => setChips(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])

  return (
    <Screen>
      <AppBar large title="Kit preview" right={
        <IconBtn name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'} label="Toggle theme" onPress={toggleTheme} />
      } />
      <Body>
        <SearchField placeholder="Search doctor, specialty or clinic…" />

        <SectionHead title="The journey" />
        <Journey steps={['Booked', 'Paid', 'Checked in', 'In the queue', 'Called', 'Seen']} activeIndex={3} />
        <Journey steps={['Booked', 'Paid', 'Checked in', 'In the queue', 'Called', 'Seen']} activeIndex={1} blockingIndex={1} />

        <SectionHead title="Figures" />
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 18, paddingHorizontal: 20, paddingBottom: 12 }}>
          <BigFigure label="Your number" value={17} />
          <View style={{ borderLeftWidth: 1, borderLeftColor: t.q.line, paddingLeft: 16, paddingBottom: 8 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: t.q.ink60 }}>Ahead of you</Text>
            <Text style={[{ fontSize: 30, lineHeight: 34, fontWeight: '800', color: t.q.primary }, NUMS]}>3</Text>
          </View>
        </View>
        <StatStrip>
          <Stat label="Ahead of you" value={3} note="1 brought forward" />
          <Stat label="Your wait" value="40–55" unit="min" note="median 13 min over 18 seen" />
          <Stat label="As of" value="12:04" note="updating live" last />
        </StatStrip>

        <SectionHead title="Notices" />
        <Notice tone="amber">This session ends at 14:00. At today&apos;s pace the queue runs about 25 minutes past it.</Notice>
        <Notice tone="red">Not paid yet. Pay before 11:00 to keep your arrival window.</Notice>
        <Notice tone="green">Refunded ₦7,750 to your wallet at 09:14.</Notice>

        <SectionHead title="Segmented & chips" />
        <Seg value={seg} onChange={setSeg} options={[{ key: 'upcoming', label: 'Upcoming' }, { key: 'past', label: 'Past' }]} />
        <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 10, flexWrap: 'wrap' }}>
          {['Open now', 'Offers virtual care', 'Accepts HMO'].map(c => (
            <Chip key={c} label={c} on={chips.includes(c)} onPress={() => toggle(c)} />
          ))}
        </View>

        <SectionHead title="Rows & pills" />
        <Card>
          <Row icon="business-outline" title="Lagos Island General" sub="Dr A. Adeyemi · 12:00 · you 17"
            pill="Checked in" pillTone="teal" tint chevron onPress={() => {}} />
          <Hair />
          <Row icon="calendar-outline" title="Chidi · LUTH Paediatrics" sub="Thu 19 · 09:00"
            pill="Awaiting approval" pillTone="amber" pillSolid chevron onPress={() => {}} />
          <Hair />
          <Row icon="videocam-outline" title="Video · Dr F. Ogunleye" sub="Fri 20 · 18:30"
            pill="Confirmed" pillTone="green" chevron onPress={() => {}} />
          <Hair />
          <Row icon="flask-outline" title="Full blood count (FBC)" sub="Normal · 12 Oct"
            pill="Normal" pillTone="green" chevron onPress={() => {}} />
          <Hair />
          <Row icon="warning-outline" iconTone="red" title="Reddington · Dermatology" sub="Mon 23 · not paid yet"
            pill="Pay to hold" pillTone="amber" pillSolid chevron onPress={() => {}} />
          <CardActions>
            <CardAction first label="Book new" />
            <CardAction label="Reschedule" />
          </CardActions>
        </Card>

        <SectionHead title="The queue (compact rows)" />
        <Card>
          <Row compact number={13} title="Seen" pill="Done" pillTone="green" dim />
          <Hair />
          <Row compact number={14} title="In with the doctor" pill="Now" pillTone="teal" />
          <Hair />
          <Row compact number={15} title="Brought forward" pill="Emergency" pillTone="red" pillSolid />
          <Hair />
          <Row compact number={17} title="You" pill="Checked in" pillTone="teal" tint />
          <Hair />
          <Row compact number={18} title="Not arrived" pill="Exp. 12:40" pillTone="neutral" dim />
        </Card>

        <SectionHead title="Detail card" />
        <Card>
          <View style={{ padding: 14, paddingBottom: 6 }}><CardLabel>Visit</CardLabel></View>
          <DetailRow label="Hospital" value="Lagos Island General" />
          <DetailRow label="Clinic" value="General outpatient" />
          <DetailRow label="Arrive" value="Today 12:00" />
          <DetailRow label="Reference" value="QB-20481" mono last />
        </Card>

        <SectionHead title="Person" />
        <Card>
          <Row leading={<Initials name="Dr A. Adeyemi" tint="#7C2D12" />} title="Dr A. Adeyemi"
            sub="Ask about results, medicines or follow-up" right={<Btn label="Message" variant="secondary" small />} />
        </Card>

        <SectionHead title="Fields" />
        <View style={{ paddingHorizontal: 16, gap: 14 }}>
          <Field label="Phone or email" placeholder="+234 812 345 6789" />
          <Field label="Member ID" placeholder="" error="Passwords don't match yet" />
        </View>

        <SectionHead title="Buttons" />
        <View style={{ paddingHorizontal: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn label="Move me later" variant="secondary" />
            <Btn label="I'm here" grow />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn label="Cancel SOS" variant="danger" grow />
            <Btn label="Loading" loading grow />
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Btn label="Download PDF" variant="secondary" small icon="download-outline" />
            <Btn label="View details" variant="ghost" small />
            <Btn label="Disabled" small disabled />
          </View>
        </View>

        <SectionHead title="Empty state" />
        <Card>
          <Empty icon="calendar-outline" title="No upcoming visit"
            body="Book a hospital visit, see a doctor online, or browse by specialty."
            action="Book a visit" />
        </Card>

        <View style={{ height: 20 }} />
        <View style={{ paddingHorizontal: 20 }}>
          <Mono size={11} color={t.q.ink60}>palette {t.id} · mode {mode}</Mono>
        </View>
      </Body>
      <BottomBar meta={
        <>
          <Mono size={12} color={t.q.primary}>Now 14</Mono>
          <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
          <Mono size={12}>You 17</Mono>
          <Text style={{ marginHorizontal: 7, color: t.q.ink60 }}>·</Text>
          <Mono size={12}>3 ahead</Mono>
        </>
      }>
        <Btn label="Move me later" variant="secondary" />
        <Btn label="I'm here" grow />
      </BottomBar>
    </Screen>
  )
}

export function KitPreview() {
  return (
    <SafeAreaProvider>
      <ThemeProvider palettes={V4_PALETTES} defaultMode="light">
        <Gallery />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
