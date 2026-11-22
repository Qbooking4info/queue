/**
 * RouteBoardPreview — every page of the proposed Route Board redesign, in one file.
 *
 * WHAT THIS IS
 *   A self-contained preview of the Route Board design system: the five screens from
 *   reports/route-board-redesign.html, rebuilt to the corrected spec in
 *   reports/route-board-build-plan.html. Nothing here is wired into an app. It imports
 *   nothing from the repo — not ThemeContext, not Typography — so dropping it in cannot
 *   change how any existing screen renders, and deleting it cannot break one.
 *
 * WHY IT IS REACT NATIVE AND NOT WEB REACT
 *   These are the real primitives the four Expo apps are built from, so this is the
 *   implementation, not a picture of it. It also renders in a browser through
 *   react-native-web, which is how the dev servers on 8081-8084 serve it.
 *
 * TO LOOK AT IT
 *   import { RouteBoardPreview } from '@queue/shared/screens/RouteBoardPreview'
 *   and render <RouteBoardPreview /> as a screen. Add it to a navigator temporarily;
 *   do not ship the route.
 *
 * WHAT IT CORRECTS FROM THE 15 NOV MOCKUP (build plan §1)
 *   1. The ambulance screen renders ONLY the fourteen fields ActiveJob actually returns
 *      (crew-api.ts:34). No patient age/sex, no consciousness, no held bay, no caller
 *      name, no gate-code free text, no prior history, no road distance in km — none of
 *      those exist on the job. Every value below maps to a named real field.
 *   2. The two state inks are darkened to clear 4.5:1 on their own tints, and the
 *      "live" teal is board-only: it is 2.31:1 on paper and must never land there.
 *   3. The patient route bar is a derived projection over two records, not a status
 *      column, and it marks the blocking stop rather than pretending six stored states
 *      advance in order.
 *   4. Terminal states end the bar. A cancelled run never renders a half-filled track.
 *
 * TYPEFACE NOTE
 *   Archivo Narrow is not installed in this repo, so the display voice is approximated
 *   with the platform's condensed face where one exists (Android has one, iOS does not)
 *   plus weight, tracking and capitals. Installing the real subset is build-plan phase 1.
 */

import { useState } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet, Platform } from 'react-native'

/* ───────────────────────────────────────────────────────────────────────────
   TOKENS
   One set, two registers. Every colour below is measured in build plan §1;
   the ratios in the comments are real, not asserted.
   ─────────────────────────────────────────────────────────────────────────── */

const BOARD = {
  board:     '#07312F',
  board2:    '#0B4440',
  chalk:     '#EAF2F0',   // 12.39:1 on board — AAA
  chalk60:   '#9CBDB8',   //  6.97:1 on board — AA
  white:     '#FFFFFF',   // 14.10:1 on board — AAA
  live:      '#23B3A4',   //  5.41:1 on board — AA.  ON PAPER IT IS 2.31:1. Board only.
  hair:      'rgba(234,242,240,0.20)',
  hairSoft:  'rgba(234,242,240,0.12)',
}

const light = {
  name:      'paper',
  bg:        '#F4F1EA',
  surface:   '#FFFFFF',
  ink:       '#0B1A19',   // 15.83:1 on paper — AAA
  ink70:     '#33474A',   //  8.70:1 — AAA
  ink60:     '#4A5A58',   //  6.43:1 — AA
  rule:      '#D5CFC2',
  rule2:     '#E6E1D6',
  teal:      '#0F766E',   //  4.85:1 on paper — AA
  red:       '#C8102E',   //  5.22:1 on paper — AA
  redBg:     '#FBE8EA',
  amber:     '#8F4108',   // darkened from #B45309 — build plan §1 finding 2
  amberBg:   '#FBF0D6',
  green:     '#14663C',   // darkened from #1A7F4B — same finding
  greenBg:   '#E3F3E9',
  muted:     '#EDEAE1',
}

const dark = {
  name:      'ink',
  bg:        '#06100F',
  surface:   '#0C1A19',
  ink:       '#E9F1EF',
  ink70:     '#AFC3C0',
  ink60:     '#8A9E9B',
  rule:      'rgba(233,241,239,0.13)',
  rule2:     'rgba(233,241,239,0.08)',
  teal:      '#2BA89C',
  red:       '#F2607A',
  redBg:     'rgba(242,96,122,0.13)',
  amber:     '#E09B4A',
  amberBg:   'rgba(224,155,74,0.13)',
  green:     '#4CC38A',
  greenBg:   'rgba(76,195,138,0.13)',
  muted:     'rgba(233,241,239,0.06)',
}

/* The board never changes between appearances. That is what makes dark mode read as
   the same product rather than an inversion of it. */

const DISPLAY = Platform.select({
  android: 'sans-serif-condensed',
  web: '"Archivo Narrow","Roboto Condensed",system-ui,sans-serif',
  default: undefined, // iOS ships no condensed system face; weight + tracking carry it
})

const MONO = Platform.select({
  android: 'monospace',
  ios: 'Menlo',
  web: '"JetBrains Mono",ui-monospace,"Roboto Mono",monospace',
  default: 'monospace',
})

const NUMS = { fontVariant: ['tabular-nums'] }

/* ───────────────────────────────────────────────────────────────────────────
   PRIMITIVES
   Hairline rules, not cards. Nothing here has a radius or an elevation.
   ─────────────────────────────────────────────────────────────────────────── */

/** A painted capital. The display voice of the whole system. */
function Cap({ children, size = 11, color, track = 0.1, style }) {
  return (
    <Text
      style={[
        { fontFamily: DISPLAY, fontWeight: '700', fontSize: size, color,
          letterSpacing: size * track, textTransform: 'uppercase' },
        style,
      ]}>
      {children}
    </Text>
  )
}

/** Identifiers, times, money, ETAs, queue numbers. Mandatory tabular figures. */
function Mono({ children, size = 12, color, style }) {
  return (
    <Text style={[{ fontFamily: MONO, fontSize: size, color }, NUMS, style]}>
      {children}
    </Text>
  )
}

function Rule({ t, inset = 0 }) {
  return <View style={{ height: 1, backgroundColor: t.rule, marginLeft: inset }} />
}

/** A ruled section header. Replaces the SectionTitle card header. */
function SectionRule({ t, label, trailing }) {
  return (
    <View style={s.sectionRule}>
      <Cap size={10} color={t.ink60}>{label}</Cap>
      <View style={{ flex: 1, height: 1, backgroundColor: t.rule }} />
      {trailing ? <Cap size={10} color={t.ink60}>{trailing}</Cap> : null}
    </View>
  )
}

/** A status mark. Ruled capitals, not a pill. Max one per row (clinical spec). */
function Mark({ t, tone = 'neutral', children }) {
  const map = {
    emergency: [t.red, t.redBg],
    caution:   [t.amber, t.amberBg],
    done:      [t.green, t.greenBg],
    live:      [t.teal, 'transparent'],
    neutral:   [t.ink60, 'transparent'],
  }
  const [fg, bg] = map[tone] ?? map.neutral
  return (
    <View style={[s.mark, { backgroundColor: bg, borderColor: fg }]}>
      <Cap size={9} color={fg}>{children}</Cap>
    </View>
  )
}

/** A figure with the evidence for itself underneath. Replaces KpiCard. */
function Figure({ t, label, value, unit, evidence, tone, flex = 1, last }) {
  return (
    <View style={[s.figure, { borderRightWidth: last ? 0 : 1, borderRightColor: t.rule, flex }]}>
      <Cap size={9} color={t.ink60}>{label}</Cap>
      <View style={s.figureVal}>
        <Text style={{ fontFamily: DISPLAY, fontWeight: '700', fontSize: 21,
                       color: tone ?? t.ink, ...NUMS }}>{value}</Text>
        {unit ? <Cap size={10} color={t.ink60} style={{ marginBottom: 2 }}>{unit}</Cap> : null}
      </View>
      {evidence ? <Text style={[s.evidence, { color: t.ink60 }]}>{evidence}</Text> : null}
    </View>
  )
}

/** A full-width notice band. Tinted fill plus hairlines — never a coloured left bar. */
function Band({ t, tone = 'caution', children }) {
  const map = { caution: [t.amber, t.amberBg], emergency: [t.red, t.redBg], off: [t.ink60, t.muted] }
  const [fg, bg] = map[tone] ?? map.caution
  return (
    <View style={[s.band, { backgroundColor: bg, borderColor: fg }]}>
      <View style={[s.bandDot, { backgroundColor: fg }]} />
      <Text style={[s.bandText, { color: t.ink70 }]}>{children}</Text>
    </View>
  )
}

/* ───────────────────────────────────────────────────────────────────────────
   THE ROUTE BAR  (build plan §3)
   Three registers, one component. Terminal states end the bar; they are never a stop.
   ─────────────────────────────────────────────────────────────────────────── */

function RouteBar({ caption, stops, activeIndex, blockingIndex, terminal }) {
  // A terminal run has no position on the track. Drawing a partial fill for a
  // cancelled job is the worst failure this component can have, because position
  // is what the reader takes in at a glance.
  if (terminal) {
    return (
      <View style={s.route}>
        <Cap size={10} color={BOARD.chalk60}>{caption}</Cap>
        <View style={[s.terminal, { borderColor: BOARD.hair }]}>
          <Cap size={13} color={terminal.tone === 'bad' ? '#FF8DA1' : BOARD.chalk}>
            {terminal.label}
          </Cap>
          {terminal.detail
            ? <Text style={[s.terminalDetail, { color: BOARD.chalk60 }]}>{terminal.detail}</Text>
            : null}
        </View>
      </View>
    )
  }

  const last = stops.length - 1
  // The filled track runs to the centre of the active stop. The 7% insets match the
  // half-width of the first and last stop cells so the line starts and ends under a dot.
  const pct = last > 0 ? (activeIndex / last) * 100 : 0

  return (
    <View style={s.route}>
      <Cap size={10} color={BOARD.chalk60}>{caption}</Cap>
      <View style={s.stops}>
        <View style={s.track}>
          <View style={[s.trackFill, { width: `${pct}%` }]} />
        </View>
        {stops.map((stop, i) => {
          const past = i < activeIndex
          const on = i === activeIndex
          const blocking = i === blockingIndex
          return (
            <View key={stop.key ?? stop.label} style={s.stop}>
              <View
                style={[
                  s.dot,
                  past && s.dotPast,
                  on && s.dotOn,
                  blocking && s.dotBlocking,
                ]}
              />
              <Cap
                size={on ? 10 : 9}
                track={0.045}
                color={on ? BOARD.white : blocking ? '#E7B075' : BOARD.chalk60}
                style={{ textAlign: 'center' }}>
                {stop.label}
              </Cap>
            </View>
          )
        })}
      </View>
    </View>
  )
}

/** Staff register: the bar tracks the session, not a person. Same geometry. */
function SessionBar({ caption, start, end, nowLabel, nowPct, overrunLabel }) {
  return (
    <View style={s.route}>
      <Cap size={10} color={BOARD.chalk60}>{caption}</Cap>
      <View style={s.sessionTrack}>
        <View style={[s.sessionFill, { width: `${nowPct}%` }]} />
        <View style={[s.sessionNow, { left: `${nowPct}%` }]} />
      </View>
      <View style={s.sessionLabels}>
        <Mono size={10} color={BOARD.chalk60}>{start}</Mono>
        <Cap size={10} color={BOARD.white}>{nowLabel}</Cap>
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'baseline' }}>
          <Mono size={10} color={BOARD.chalk60}>{end}</Mono>
          {overrunLabel
            ? <Cap size={10} color="#E7B075">{overrunLabel}</Cap>
            : null}
        </View>
      </View>
    </View>
  )
}

/* ───────────────────────────────────────────────────────────────────────────
   THE BUG  (build plan §4)
   The persistent bar. It never leaves the screen and it is the only thing in the
   thumb zone. `tall` is the ambulance register: 62px targets, read one-handed in a
   moving vehicle.
   ─────────────────────────────────────────────────────────────────────────── */

function RouteBug({ t, facts, primary, secondary, tall }) {
  const h = tall ? 62 : 48
  return (
    <View style={[s.bug, { backgroundColor: BOARD.board, borderTopColor: BOARD.hair }]}>
      <View style={s.bugFacts}>
        {facts.map((f, i) => (
          <View key={f.text} style={s.bugFact}>
            {i > 0 ? <Text style={[s.bugSep, { color: BOARD.chalk60 }]}>·</Text> : null}
            {f.mono
              ? <Mono size={11} color={f.tone === 'live' ? BOARD.live : BOARD.chalk}>{f.text}</Mono>
              : <Cap size={10} color={f.tone === 'live' ? BOARD.live : BOARD.chalk60}>{f.text}</Cap>}
          </View>
        ))}
      </View>
      <View style={s.bugActions}>
        {secondary ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secondary}
            style={({ pressed }) => [
              s.bugSecondary,
              { minHeight: h, borderColor: BOARD.hair },
              // Emil: press feedback only. The state change itself is instant.
              pressed && { transform: [{ scale: 0.97 }] },
            ]}>
            <Cap size={11} color={BOARD.chalk}>{secondary}</Cap>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={primary}
          style={({ pressed }) => [
            s.bugPrimary,
            { minHeight: h, backgroundColor: BOARD.live },
            pressed && { transform: [{ scale: 0.97 }], backgroundColor: '#1C9A8D' },
          ]}>
          <Cap size={tall ? 14 : 12} color="#04201F">{primary}</Cap>
        </Pressable>
      </View>
    </View>
  )
}

/** Shared app masthead. Flat board — not the LinearGradient it replaces. */
function Masthead({ title, context }) {
  return (
    <View style={s.masthead}>
      <Cap size={15} track={0.17} color={BOARD.white}>Queue</Cap>
      <View style={{ flex: 1 }} />
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[s.mastheadTitle, { color: BOARD.white }]} numberOfLines={1}>{title}</Text>
        {context ? <Mono size={10} color={BOARD.chalk60}>{context}</Mono> : null}
      </View>
    </View>
  )
}

function Screen({ children }) {
  // minWidth 0 stops a long unbroken string (a hospital name, an address) from
  // setting the width of the whole screen instead of wrapping inside it.
  return <View style={{ flex: 1, width: '100%', minWidth: 0 }}>{children}</View>
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE 1 — AMBULANCE · DISPATCH
   Built from the fourteen real ActiveJob fields and nothing else. Each block is
   annotated with the field it renders, so a reviewer can check the claim.
   ═══════════════════════════════════════════════════════════════════════════ */

const AMBULANCE_STOPS = [
  { key: 'matched',                label: 'Accepted'  },
  { key: 'en_route_to_patient',    label: 'En route'  },
  { key: 'on_scene',               label: 'On scene'  },
  { key: 'transporting',           label: 'Transport' },
  { key: 'arrived_at_destination', label: 'Arrived'   },
]

// The shape below is ActiveJob + the call_sign that only MyUnit carries.
const JOB = {
  booking_ref: 'QA-4417',
  status: 'on_scene',
  triage_level: 1,
  symptom_description: 'Breathing difficulty, patient upright and speaking in short sentences',
  contact_phone: '+234 802 ••• 4417',
  pickup_address: '14 Glover Road, Ikoyi',
  destination_hospital_name: 'Lagos University Teaching Hospital, Idi-Araba — Accident & Emergency',
  destination_hospital_phone: '+234 1 ••• 2200',
  eta_seconds: 660,
  eta_updated_at: '12:03',
  call_sign: 'LAG-04',          // MyUnit.call_sign
  seconds_since_ping: 18,       // MyUnit.seconds_since_ping — drives the staleness stamp
}

function triageTone(level) {
  if (level == null) return 'neutral'   // triage_level is nullable. Never assume P3.
  if (level <= 2) return 'emergency'
  if (level === 3) return 'caution'
  return 'neutral'
}

function etaText(seconds) {
  // eta_seconds is nullable and can be 0. Both must read as words, not "0 min".
  if (seconds == null) return 'ETA unknown'
  if (seconds < 60) return 'Arriving'
  return `${Math.round(seconds / 60)} min`
}

function AmbulanceDispatch({ t }) {
  const stale = JOB.seconds_since_ping > 120
  const idx = AMBULANCE_STOPS.findIndex(x => x.key === JOB.status)

  return (
    <Screen>
      <View style={{ backgroundColor: BOARD.board }}>
        <Masthead title={`Unit ${JOB.call_sign}`} context={JOB.booking_ref} />
        <RouteBar caption="This run" stops={AMBULANCE_STOPS} activeIndex={idx} />
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 18 }}>
        {stale ? (
          <Band t={t} tone="caution">
            Position last confirmed {JOB.seconds_since_ping}s ago. The ETA below was true at {JOB.eta_updated_at}.
          </Band>
        ) : null}

        {/* pickup_address — the destination is the largest thing on the screen */}
        <View style={s.hero}>
          <Cap size={10} color={t.ink60}>Pick up at</Cap>
          <Text style={[s.heroText, { color: t.ink }]}>{JOB.pickup_address}</Text>
          <View style={s.heroMeta}>
            <Mono size={13} color={t.ink70}>{etaText(JOB.eta_seconds)}</Mono>
            <Text style={{ color: t.ink60 }}>·</Text>
            <Mono size={13} color={t.ink60}>as of {JOB.eta_updated_at}</Mono>
          </View>
        </View>
        <Rule t={t} />

        {/* triage_level + symptom_description — the only clinical data the job carries */}
        <View style={s.block}>
          <View style={s.blockHead}>
            <Cap size={10} color={t.ink60}>Priority</Cap>
            <Mark t={t} tone={triageTone(JOB.triage_level)}>
              {JOB.triage_level == null ? 'Not triaged' : `P${JOB.triage_level}`}
            </Mark>
          </View>
          <Text style={[s.blockBody, { color: t.ink }]} numberOfLines={4}>
            {JOB.symptom_description}
          </Text>
        </View>
        <Rule t={t} />

        {/* destination_hospital_name — long by nature, and no length limit exists on it */}
        <View style={s.block}>
          <Cap size={10} color={t.ink60}>Taking to</Cap>
          <Text style={[s.blockBody, { color: t.ink, fontWeight: '600' }]} numberOfLines={3}>
            {JOB.destination_hospital_name}
          </Text>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [s.inlineAction, { borderColor: t.rule },
                                     pressed && { transform: [{ scale: 0.97 }] }]}>
            <Cap size={10} color={t.teal}>Change destination</Cap>
          </Pressable>
        </View>
        <Rule t={t} />

        {/* contact_phone + destination_hospital_phone — the only two numbers on the job */}
        <SectionRule t={t} label="Calls" />
        {[
          { label: 'Patient contact', value: JOB.contact_phone },
          { label: 'Receiving hospital', value: JOB.destination_hospital_phone },
        ].map((row, i, arr) => (
          <View key={row.label}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Call ${row.label}`}
              style={({ pressed }) => [s.callRow, pressed && { backgroundColor: t.muted }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Cap size={9} color={t.ink60}>{row.label}</Cap>
                <Mono size={14} color={t.ink}>{row.value}</Mono>
              </View>
              <View style={[s.callBtn, { borderColor: t.teal }]}>
                <Cap size={11} color={t.teal}>Call</Cap>
              </View>
            </Pressable>
            {i < arr.length - 1 ? <Rule t={t} inset={16} /> : null}
          </View>
        ))}
        <Rule t={t} />

        <Text style={[s.footnote, { color: t.ink60 }]}>
          Everything on this screen comes from ActiveJob (crew-api.ts:34) plus MyUnit.call_sign.
          Patient age, consciousness, a held bay, caller notes and road distance are not on the
          job — build plan §1, finding 1.
        </Text>
      </ScrollView>

      <RouteBug
        t={t}
        tall
        facts={[
          { text: `P${JOB.triage_level}`, mono: true },
          { text: etaText(JOB.eta_seconds), mono: true, tone: 'live' },
        ]}
        primary="Transporting"
        secondary="Can't take it"
      />
    </Screen>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE 2 — PATIENT · IN THE QUEUE
   The bar here is a projection over two records (build plan §3), not a column.
   ═══════════════════════════════════════════════════════════════════════════ */

const PATIENT_STOPS = [
  { key: 'booked',     label: 'Booked'       },
  { key: 'paid',       label: 'Paid'         },
  { key: 'checked_in', label: 'Checked in'   },
  { key: 'queued',     label: 'In the queue' },
  { key: 'called',     label: 'Called'       },
  { key: 'seen',       label: 'Seen'         },
]

/**
 * The mapping finding 3 asked for. Appointment status and payment state are two
 * different records, so the bar is derived here in one place rather than at each
 * call site. Returns the active index and, when the next stop is something the
 * patient must act on, the index to mark as blocking.
 */
function projectPatientRoute({ status, paid, hasQueuePosition }) {
  if (status === 'cancelled' || status === 'no_show') {
    return { terminal: { label: status === 'cancelled' ? 'Visit cancelled' : 'Recorded as no-show',
                         detail: 'Book again from the home screen.', tone: 'bad' } }
  }
  if (status === 'completed')   return { activeIndex: 5 }
  if (status === 'in_progress') return { activeIndex: 4 }
  if (status === 'checked_in')  return { activeIndex: hasQueuePosition ? 3 : 2 }
  // Booked. Unpaid is the one case that blocks, so it is marked rather than hidden.
  if (!paid) return { activeIndex: 0, blockingIndex: 1 }
  return { activeIndex: 1 }
}

const QUEUE_ROWS = [
  { n: 13, who: 'Seen',                 mark: 'Done',       tone: 'done',      dim: true },
  { n: 14, who: 'In with the doctor',   mark: 'Now',        tone: 'live' },
  { n: 15, who: 'Brought forward',      mark: 'Emergency',  tone: 'emergency' },
  { n: 16, who: 'Waiting',              mark: 'Checked in', tone: 'neutral' },
  { n: 17, who: 'You',                  mark: 'Checked in', tone: 'neutral',   me: true },
  { n: 18, who: 'Not arrived',          mark: 'Exp. 12:40', tone: 'neutral',   dim: true },
]

function PatientQueue({ t }) {
  const route = projectPatientRoute({ status: 'checked_in', paid: true, hasQueuePosition: true })

  return (
    <Screen>
      <View style={{ backgroundColor: BOARD.board }}>
        <Masthead title="Lagos Island General" context="Gen. Outpatient" />
        <RouteBar
          caption="Your visit"
          stops={PATIENT_STOPS}
          activeIndex={route.activeIndex}
          blockingIndex={route.blockingIndex}
          terminal={route.terminal}
        />
        {/* The standing: the number is the point, so it is the biggest thing here */}
        <View style={s.standing}>
          <View>
            <Cap size={10} color={BOARD.chalk60}>Your number</Cap>
            <Text style={[s.standingBig, { color: BOARD.white }]}>17</Text>
          </View>
          <View style={[s.standingSide, { borderLeftColor: BOARD.hair }]}>
            <Cap size={10} color={BOARD.chalk60}>Now serving</Cap>
            <Text style={[s.standingSmall, { color: BOARD.live }]}>14</Text>
          </View>
        </View>
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 18 }}>
        <View style={[s.figures, { borderBottomColor: t.rule }]}>
          <Figure t={t} label="Ahead of you" value="3" evidence="1 brought forward" />
          <Figure t={t} label="Your wait" value="40–55" unit="min" evidence="median 13 min over 18 seen" />
          <Figure t={t} label="As of" value="12:04" evidence="updating live" last />
        </View>

        <Band t={t} tone="caution">
          This session ends at 14:00. At today's pace the queue runs about 25 minutes past it.
        </Band>

        <SectionRule t={t} label="The queue" />
        {QUEUE_ROWS.map((r, i) => (
          <View key={r.n}>
            <View style={[s.qRow, r.me && { backgroundColor: t.name === 'paper' ? '#E4EFED' : 'rgba(43,168,156,0.12)' }]}>
              <Text style={[s.qNum, { color: r.me ? t.teal : r.dim ? t.ink60 : t.ink }]}>{r.n}</Text>
              <Text
                style={[s.qWho, { color: r.dim ? t.ink60 : t.ink, fontWeight: r.me ? '700' : '400' }]}
                numberOfLines={1}>
                {r.who}
              </Text>
              <Mark t={t} tone={r.tone}>{r.mark}</Mark>
            </View>
            {i < QUEUE_ROWS.length - 1 ? <Rule t={t} inset={16} /> : null}
          </View>
        ))}
        <Rule t={t} />
      </ScrollView>

      <RouteBug
        t={t}
        facts={[
          { text: 'Now 14', mono: true, tone: 'live' },
          { text: 'You 17', mono: true },
          { text: '3 ahead', mono: true },
        ]}
        primary="I'm here"
        secondary="Move me later"
      />
    </Screen>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE 3 — PATIENT · BOOK A VISIT
   The same bar carries the booking's own stops, so a three-page flow shows its
   whole length up front. The button names what is missing instead of sitting dead.
   ═══════════════════════════════════════════════════════════════════════════ */

const BOOKING_STOPS = [
  { key: 'hospital', label: 'Hospital' },
  { key: 'visit',    label: 'Your visit' },
  { key: 'confirm',  label: 'Confirm' },
]

const DOCTORS = [
  { name: 'Dr A. Adeyemi',  sub: 'General outpatient · next slot 12:40', fee: '₦7,500', picked: true },
  { name: 'Dr N. Okonkwo',  sub: 'General outpatient · next slot 14:10', fee: '₦7,500' },
  { name: 'First available', sub: 'Assigned when you arrive',            fee: '₦6,000' },
]

function PatientBooking({ t }) {
  const [picked, setPicked] = useState(0)

  return (
    <Screen>
      <View style={{ backgroundColor: BOARD.board }}>
        <Masthead title="Book a visit" context="Step 2 of 3" />
        <RouteBar caption="Booking" stops={BOOKING_STOPS} activeIndex={1} />
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 18 }}>
        <SectionRule t={t} label="Who you will see" />
        {DOCTORS.map((d, i) => {
          const on = i === picked
          return (
            <View key={d.name}>
              <Pressable
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                // Emil frequency rule: this is a once-per-booking action, but the
                // selection itself must still be instant. No animation on the swap.
                onPress={() => setPicked(i)}
                style={({ pressed }) => [
                  s.pickRow,
                  on && { backgroundColor: t.name === 'paper' ? '#E4EFED' : 'rgba(43,168,156,0.1)' },
                  pressed && { backgroundColor: t.muted },
                ]}>
                <View style={[s.radio, { borderColor: on ? t.teal : t.rule },
                                        on && { backgroundColor: t.teal }]} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[s.pickName, { color: t.ink }]} numberOfLines={1}>{d.name}</Text>
                  <Text style={[s.pickSub, { color: t.ink60 }]} numberOfLines={1}>{d.sub}</Text>
                </View>
                <Mono size={13} color={t.ink}>{d.fee}</Mono>
              </Pressable>
              {i < DOCTORS.length - 1 ? <Rule t={t} inset={16} /> : null}
            </View>
          )
        })}
        <Rule t={t} />

        <SectionRule t={t} label="When" />
        <View style={s.whenRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.pickName, { color: t.ink }]}>Today, 12:40</Text>
            <Text style={[s.pickSub, { color: t.ink60 }]}>You would be number 17</Text>
          </View>
          <Mark t={t} tone="live">Selected</Mark>
        </View>
        <Rule t={t} inset={16} />
        <View style={s.whenRow}>
          <View style={{ flex: 1 }}>
            <Text style={[s.pickName, { color: t.ink }]}>Tomorrow, 09:00</Text>
            <Text style={[s.pickSub, { color: t.ink60 }]}>Queue opens 08:00</Text>
          </View>
        </View>
        <Rule t={t} />

        <SectionRule t={t} label="Total" />
        {[['Consultation', '₦7,500'], ['Booking fee', '₦250']].map(([k, v]) => (
          <View key={k} style={s.totalRow}>
            <Text style={[s.pickSub, { color: t.ink70, flex: 1 }]}>{k}</Text>
            <Mono size={13} color={t.ink70}>{v}</Mono>
          </View>
        ))}
        <Rule t={t} inset={16} />
        <View style={s.totalRow}>
          <Cap size={11} color={t.ink} style={{ flex: 1 }}>Total</Cap>
          <Mono size={15} color={t.ink} style={{ fontWeight: '600' }}>₦7,750</Mono>
        </View>
        <Rule t={t} />
      </ScrollView>

      {/* The bug names what is missing rather than sitting dead and grey. */}
      <RouteBug
        t={t}
        facts={[{ text: 'Add who the visit is for to continue', tone: 'live' }]}
        primary="Choose who it's for"
      />
    </Screen>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE 4 — DOCTOR · THIS SESSION
   The bar tracks the session, not one patient. One primary action.
   ═══════════════════════════════════════════════════════════════════════════ */

const CONSULT_ROWS = [
  { n: 15, name: 'F. Balogun, 34',  sub: 'Chest pain · brought forward', mark: 'Emergency',  tone: 'emergency' },
  { n: 16, name: 'S. Eze, 29',      sub: 'Waited 41 min',                mark: 'Checked in', tone: 'neutral' },
  { n: 17, name: 'O. Danjuma, 52',  sub: 'Waited 28 min · follow-up',    mark: 'Checked in', tone: 'neutral' },
  { n: 18, name: 'A. Yakubu, 8',    sub: 'Dependent · guardian present', mark: 'Checked in', tone: 'neutral' },
  { n: 19, name: 'M. Lawal, 61',    sub: 'Back from lab 11:49',          mark: 'Returned',   tone: 'caution' },
]

const SEEN_ROWS = [
  { n: 13, name: 'I. Adeleke, 38',  sub: '11:51 · 9 min · prescription sent' },
  { n: 12, name: 'B. Oyelaran, 71', sub: '11:38 · 14 min · care plan updated' },
  { n: 11, name: 'K. Ibrahim, 25',  sub: '11:22 · 11 min · sent to lab' },
]

function DoctorSession({ t }) {
  const [sel, setSel] = useState(0)

  return (
    <Screen>
      <View style={{ backgroundColor: BOARD.board }}>
        <Masthead title="Dr A. Adeyemi" context="08:00–14:00" />
        <SessionBar
          caption="Session"
          start="08:00" end="14:00"
          nowLabel="Now 12:04" nowPct={68} overrunLabel="+25 over"
        />
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 18 }}>
        <View style={[s.figures, { borderBottomColor: t.rule }]}>
          <Figure t={t} label="Seen" value="11" evidence="median 13 min" />
          <Figure t={t} label="Waiting" value="6" evidence="1 emergency" />
          <Figure t={t} label="Overrun" value="+25" unit="min" evidence="at today's pace" tone={t.amber} last />
        </View>

        <Band t={t} tone="caution">
          Number 15 was brought forward as an emergency by the front desk at 11:58.
        </Band>

        <SectionRule t={t} label="Up next" trailing="6 waiting" />
        {CONSULT_ROWS.map((r, i) => (
          <View key={r.n}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: i === sel }}
              // Emil frequency rule: 40–80 of these per sitting. No animation, no
              // skeleton, no layout shift — a re-render in the same frame.
              onPress={() => setSel(i)}
              style={({ pressed }) => [
                s.consultRow,
                i === sel && { backgroundColor: t.name === 'paper' ? '#E4EFED' : 'rgba(43,168,156,0.1)' },
                pressed && { backgroundColor: t.muted },
              ]}>
              <Text style={[s.qNum, { color: i === sel ? t.teal : t.ink60 }]}>{r.n}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.pickName, { color: t.ink }]} numberOfLines={1}>{r.name}</Text>
                <Text style={[s.pickSub, { color: t.ink60 }]} numberOfLines={1}>{r.sub}</Text>
              </View>
              <Mark t={t} tone={r.tone}>{r.mark}</Mark>
            </Pressable>
            {i < CONSULT_ROWS.length - 1 ? <Rule t={t} inset={16} /> : null}
          </View>
        ))}
        <Rule t={t} />

        <SectionRule t={t} label="Seen today" trailing="11" />
        {SEEN_ROWS.map((r, i) => (
          <View key={r.n}>
            <View style={s.consultRow}>
              <Text style={[s.qNum, { color: t.ink60 }]}>{r.n}</Text>
              <View style={{ flex: 1, minWidth: 0 }}>
                {/* A finished consultation is muted, never struck through — it is
                    not a cancelled one. */}
                <Text style={[s.pickName, { color: t.ink60 }]} numberOfLines={1}>{r.name}</Text>
                <Text style={[s.pickSub, { color: t.ink60 }]} numberOfLines={1}>{r.sub}</Text>
              </View>
              <Mark t={t} tone="done">Done</Mark>
            </View>
            {i < SEEN_ROWS.length - 1 ? <Rule t={t} inset={16} /> : null}
          </View>
        ))}
        <Rule t={t} />
      </ScrollView>

      <RouteBug
        t={t}
        facts={[
          { text: 'In room 14', mono: true, tone: 'live' },
          { text: 'Seen 11', mono: true },
          { text: '+25 min', mono: true },
        ]}
        primary="Call number 15"
        secondary="End"
      />
    </Screen>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE 5 — FRONT DESK · LIVE QUEUE
   The densest of the four. Patients who have arrived but hold no number sit in
   their own band, above people who have not turned up — the ordering bug this
   design makes visible rather than hiding.
   ═══════════════════════════════════════════════════════════════════════════ */

const DESK_BANDS = [
  {
    label: 'Numbered · Dr Adeyemi',
    rows: [
      { n: '14', name: 'In with the doctor', sub: '', mark: 'Now', tone: 'live' },
      { n: '15', name: 'F. Balogun', sub: 'Moved by you, 11:58', mark: 'Emergency', tone: 'emergency' },
      { n: '16', name: 'S. Eze', sub: 'Waited 41 min', mark: 'Checked in', tone: 'neutral' },
    ],
  },
  {
    label: 'Arrived · no doctor yet',
    rows: [
      { n: '—', name: 'G. Abiola', sub: 'Walked in 11:21 · waited 43 min', mark: 'Assign', tone: 'caution' },
      { n: '—', name: 'T. Mohammed', sub: 'Walked in 11:35 · waited 29 min', mark: 'Assign', tone: 'caution' },
    ],
  },
  {
    label: 'Not arrived',
    rows: [
      { n: '—', name: 'C. Nwosu', sub: 'Expected 12:40', mark: 'Expected', tone: 'neutral', dim: true },
      { n: '—', name: 'H. Suleiman', sub: 'Expected 13:10 · paid', mark: 'Expected', tone: 'neutral', dim: true },
    ],
  },
]

function FrontDeskQueue({ t }) {
  return (
    <Screen>
      <View style={{ backgroundColor: BOARD.board }}>
        <Masthead title="Front desk" context="12:04" />
        <SessionBar
          caption="Today"
          start="08:00" end="18:00"
          nowLabel="Now 12:04" nowPct={42}
        />
      </View>

      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 18 }}>
        <View style={[s.figures, { borderBottomColor: t.rule }]}>
          <Figure t={t} label="Waiting" value="17" evidence="longest 58 min" />
          <Figure t={t} label="Unassigned" value="4" evidence="need a doctor" tone={t.amber} />
          <Figure t={t} label="Emergencies" value="1" evidence="brought forward" tone={t.red} last />
        </View>

        {/* The offline band the build plan's worst-case table calls for. */}
        <Band t={t} tone="off">
          Offline since 12:02. Showing the last good queue — check-ins will send when the
          network returns.
        </Band>

        {DESK_BANDS.map(band => (
          <View key={band.label}>
            <SectionRule t={t} label={band.label} trailing={String(band.rows.length)} />
            {band.rows.map((r, i) => (
              <View key={r.name}>
                <View style={s.consultRow}>
                  <Text style={[s.qNum, { color: r.n === '—' ? t.ink60 : t.ink }]}>{r.n}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[s.pickName, { color: r.dim ? t.ink60 : t.ink }]} numberOfLines={1}>
                      {r.name}
                    </Text>
                    {r.sub
                      ? <Text style={[s.pickSub, { color: t.ink60 }]} numberOfLines={1}>{r.sub}</Text>
                      : null}
                  </View>
                  <Mark t={t} tone={r.tone}>{r.mark}</Mark>
                </View>
                {i < band.rows.length - 1 ? <Rule t={t} inset={16} /> : null}
              </View>
            ))}
            <Rule t={t} />
          </View>
        ))}
      </ScrollView>

      <RouteBug
        t={t}
        facts={[
          { text: 'Offline', mono: false },
          { text: 'Waiting 17', mono: true },
          { text: 'Unassigned 4', mono: true },
        ]}
        primary="Check someone in"
        secondary="Assign"
      />
    </Screen>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   THE GALLERY
   Five pages, both appearances. The page switch is deliberately unanimated:
   it is the action a reviewer performs most, which is Emil's rule exactly.
   ═══════════════════════════════════════════════════════════════════════════ */

const PAGES = [
  { key: 'ambulance', tab: 'Ambulance', render: t => <AmbulanceDispatch t={t} /> },
  { key: 'queue',     tab: 'In queue',  render: t => <PatientQueue t={t} /> },
  { key: 'booking',   tab: 'Book',      render: t => <PatientBooking t={t} /> },
  { key: 'doctor',    tab: 'Doctor',    render: t => <DoctorSession t={t} /> },
  { key: 'desk',      tab: 'Front desk',render: t => <FrontDeskQueue t={t} /> },
]

/** On web, #doctor / #desk / #dark etc. open straight to that page, so a reviewer
 *  can be sent a link to one screen. Guarded for native, where there is no location. */
function initialFromHash() {
  if (typeof window === 'undefined' || !window.location) return { page: 0, dark: false }
  const h = String(window.location.hash || '').replace('#', '').toLowerCase()
  const parts = h.split(',')
  const i = PAGES.findIndex(p => p.key === parts[0])
  return { page: i < 0 ? 0 : i, dark: parts.includes('dark') }
}

export function RouteBoardPreview() {
  const start = initialFromHash()
  const [page, setPage] = useState(start.page)
  const [isDark, setIsDark] = useState(start.dark)
  const t = isDark ? dark : light

  return (
    // width/overflow are defensive: they stop any one wide child from setting the
    // width of the whole tree, which react-native-web will otherwise allow.
    <View style={{ flex: 1, width: '100%', overflow: 'hidden', backgroundColor: t.bg }}>
      {/* Preview chrome. Not part of the design system — it exists so all five
          pages and both appearances are reachable from one screen. */}
      <View style={[s.chrome, { width: '100%', backgroundColor: BOARD.board2, borderBottomColor: BOARD.hair }]}>
        {/* A wrapping row rather than a horizontal ScrollView: preview chrome should
            not own a horizontal scroll gesture that fights the page's vertical one.
            It wraps to a second line on a narrow phone, which is fine for chrome. */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
          {PAGES.map((p, i) => (
            <Pressable
              key={p.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: i === page }}
              onPress={() => setPage(i)}
              style={[s.tab, i === page && { backgroundColor: BOARD.live }]}>
              <Cap size={10} color={i === page ? '#04201F' : BOARD.chalk60}>{p.tab}</Cap>
            </Pressable>
          ))}
          <View style={{ width: 10 }} />
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: isDark }}
            accessibilityLabel="Toggle dark appearance"
            onPress={() => setIsDark(v => !v)}
            style={[s.tab, { borderWidth: 1, borderColor: BOARD.hair }]}>
            <Cap size={10} color={BOARD.chalk}>{isDark ? 'Ink' : 'Paper'}</Cap>
          </Pressable>
        </View>
      </View>

      {PAGES[page].render(t)}
    </View>
  )
}

export default RouteBoardPreview

/* ───────────────────────────────────────────────────────────────────────────
   STYLES
   No radius on structural surfaces. No elevation anywhere. Hairlines only.
   ─────────────────────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  // masthead
  masthead: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16,
              paddingTop: 13, paddingBottom: 11, gap: 9 },
  mastheadTitle: { fontFamily: DISPLAY, fontWeight: '700', fontSize: 13,
                   letterSpacing: 0.3, textTransform: 'uppercase' },

  // route bar
  route: { paddingHorizontal: 16, paddingBottom: 15, paddingTop: 3 },
  stops: { flexDirection: 'row', marginTop: 11, position: 'relative' },
  track: { position: 'absolute', top: 6, left: '7%', right: '7%', height: 2,
           backgroundColor: BOARD.hair },
  trackFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BOARD.chalk },
  stop: { flex: 1, alignItems: 'center', gap: 7, minWidth: 0, paddingHorizontal: 2 },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: BOARD.board,
         borderWidth: 2, borderColor: BOARD.chalk60 },
  dotPast: { backgroundColor: BOARD.chalk, borderColor: BOARD.chalk },
  dotOn: { width: 14, height: 14, borderRadius: 7, backgroundColor: BOARD.live,
           borderColor: '#FFFFFF' },
  dotBlocking: { borderColor: '#E7B075', backgroundColor: BOARD.board },
  terminal: { marginTop: 11, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 14, gap: 3 },
  terminalDetail: { fontSize: 12, lineHeight: 16 },

  // session bar
  sessionTrack: { height: 2, backgroundColor: BOARD.hair, marginTop: 13, position: 'relative' },
  sessionFill: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BOARD.chalk },
  sessionNow: { position: 'absolute', top: -5, width: 2, height: 12, backgroundColor: BOARD.live },
  sessionLabels: { flexDirection: 'row', justifyContent: 'space-between',
                   alignItems: 'baseline', marginTop: 9 },

  // standing
  standing: { flexDirection: 'row', alignItems: 'flex-end', gap: 15,
              paddingHorizontal: 16, paddingBottom: 17 },
  standingBig: { fontFamily: DISPLAY, fontWeight: '700', fontSize: 84, lineHeight: 78,
                 ...NUMS },
  standingSide: { borderLeftWidth: 1, paddingLeft: 15, paddingBottom: 7 },
  standingSmall: { fontFamily: DISPLAY, fontWeight: '700', fontSize: 32, lineHeight: 34, ...NUMS },

  // figures
  figures: { flexDirection: 'row', borderBottomWidth: 1 },
  figure: { paddingVertical: 10, paddingHorizontal: 12, minWidth: 0 },
  figureVal: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginTop: 2 },
  evidence: { fontSize: 9.5, lineHeight: 13, marginTop: 3 },

  // bands and sections
  band: { flexDirection: 'row', gap: 10, alignItems: 'flex-start',
          paddingVertical: 11, paddingHorizontal: 15,
          borderTopWidth: 1, borderBottomWidth: 1 },
  bandDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  bandText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  sectionRule: { flexDirection: 'row', alignItems: 'center', gap: 9,
                 paddingHorizontal: 15, paddingTop: 14, paddingBottom: 6 },

  // marks
  // No alignSelf: every caller is a row with alignItems:'center', and 'flex-start'
  // pulled the mark to the top of the row instead of its vertical centre.
  mark: { borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },

  // ambulance
  hero: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 13, gap: 4 },
  heroText: { fontFamily: DISPLAY, fontWeight: '700', fontSize: 30, lineHeight: 34,
              textTransform: 'uppercase', letterSpacing: -0.2 },
  heroMeta: { flexDirection: 'row', gap: 7, alignItems: 'baseline', marginTop: 4 },
  block: { paddingHorizontal: 16, paddingVertical: 13, gap: 5 },
  blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  blockBody: { fontSize: 15, lineHeight: 21 },
  inlineAction: { borderWidth: 1, alignSelf: 'flex-start', paddingHorizontal: 10,
                  minHeight: 44, justifyContent: 'center', marginTop: 6 },
  callRow: { flexDirection: 'row', alignItems: 'center', gap: 12,
             paddingHorizontal: 16, minHeight: 62 },
  callBtn: { borderWidth: 1, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  footnote: { fontSize: 11, lineHeight: 16, paddingHorizontal: 16, paddingTop: 14 },

  // queue rows
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 11,
          paddingHorizontal: 15, minHeight: 48 },
  qNum: { fontFamily: DISPLAY, fontWeight: '700', fontSize: 17, width: 28, ...NUMS },
  qWho: { flex: 1, minWidth: 0, fontSize: 13.5 },

  // pick rows
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 12,
             paddingHorizontal: 15, minHeight: 56 },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2 },
  pickName: { fontSize: 14, fontWeight: '600' },
  pickSub: { fontSize: 11.5, lineHeight: 15, marginTop: 1 },
  whenRow: { flexDirection: 'row', alignItems: 'center', gap: 12,
             paddingHorizontal: 15, minHeight: 52 },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 12,
              paddingHorizontal: 15, minHeight: 36 },
  consultRow: { flexDirection: 'row', alignItems: 'center', gap: 11,
                paddingHorizontal: 15, minHeight: 52 },

  // the bug
  bug: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 9, paddingBottom: 12, gap: 9 },
  bugFacts: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap' },
  bugFact: { flexDirection: 'row', alignItems: 'baseline' },
  bugSep: { marginHorizontal: 7, fontSize: 11 },
  bugActions: { flexDirection: 'row', gap: 8 },
  bugSecondary: { borderWidth: 1, paddingHorizontal: 16, justifyContent: 'center',
                  alignItems: 'center' },
  bugPrimary: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 },

  // preview chrome
  chrome: { borderBottomWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  tab: { paddingHorizontal: 12, minHeight: 34, justifyContent: 'center', alignItems: 'center' },
})
