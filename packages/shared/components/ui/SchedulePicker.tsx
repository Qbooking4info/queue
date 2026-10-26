import { useEffect, useState } from 'react'
import { View, TextInput, TouchableOpacity } from 'react-native'
import { Text } from './Typography'
import { useTheme } from '../../contexts/ThemeContext'
import { haptics } from '../../lib/haptics'
import { clampPerPeriod, MAX_PER_PERIOD, type CarePlanPeriod } from '../../lib/carePlanReminders'

/**
 * When a task happens, in the three things that are actually separate:
 *
 *   How often  -- daily, weekly or monthly
 *   Frequency  -- how many times within that: once daily, 3 times daily
 *   Duration   -- how long it runs: 1 week, 3 weeks, or until the plan ends
 *
 * They were one fixed menu before, which could only say what it had a button
 * for: "twice a week" was unsayable, and duration belonged to the whole plan,
 * so "antibiotics twice daily for 1 week" inside a twelve-week recovery plan
 * had nowhere to go.
 *
 * Every row works the same way: tap a common value, or type the number. The
 * suggestions cover nearly every real plan and the field covers the rest. Both
 * clamp rather than reject, so a typo never blocks anyone.
 */

const PERIODS: { key: CarePlanPeriod; label: string; adverb: string; noun: string }[] = [
  { key: 'daily',   label: 'Daily',   adverb: 'daily',   noun: 'day' },
  { key: 'weekly',  label: 'Weekly',  adverb: 'weekly',  noun: 'week' },
  { key: 'monthly', label: 'Monthly', adverb: 'monthly', noun: 'month' },
]

/** Counts worth a single tap. Anything else is typed. */
const SUGGESTED: Record<CarePlanPeriod, number[]> = {
  daily: [1, 2, 3, 4],
  weekly: [1, 2, 3, 5],
  monthly: [1, 2, 4, 8],
  once: [1],
}

/** Durations worth a single tap, in weeks. Null is the "Ongoing" chip. */
const WEEKS: (number | null)[] = [1, 2, 3, 4, 8, 12, null]

const MAX_WEEKS = 52

export const periodAdverb = (c: CarePlanPeriod) => PERIODS.find(p => p.key === c)?.adverb ?? 'daily'
export const periodNoun = (c: CarePlanPeriod) => PERIODS.find(p => p.key === c)?.noun ?? 'day'

/** "Once daily", "3 times weekly" -- how the choice reads back. */
export function frequencyLabel(cadence: CarePlanPeriod, timesPerPeriod: number): string {
  if (cadence === 'once') return 'Once, on a date'
  const n = Math.max(1, timesPerPeriod)
  return n === 1 ? `Once ${periodAdverb(cadence)}` : `${n} times ${periodAdverb(cadence)}`
}

export function durationLabel(weeks: number | null): string {
  if (weeks == null) return 'Ongoing'
  return weeks === 1 ? 'For 1 week' : `For ${weeks} weeks`
}

export interface Schedule {
  cadence: CarePlanPeriod
  timesPerPeriod: number
  /** Null means it runs as long as the plan does. */
  durationWeeks: number | null
}

export function SchedulePicker({ value, onChange, compact, showDuration = true }: {
  value: Schedule
  onChange: (next: Schedule) => void
  /** Tighter type and padding, for a row inside a longer form. */
  compact?: boolean
  /** Off where the plan already sets the duration for every task. */
  showDuration?: boolean
}) {
  const { theme: t } = useTheme()
  const { cadence, timesPerPeriod, durationWeeks } = value
  const maxTimes = MAX_PER_PERIOD[cadence] ?? 1

  // Each field holds what is being typed, which may be mid-edit and invalid --
  // "" while the old number is deleted, say. The committed value stays with the
  // parent, so a half-typed number never reaches the plan.
  const [timesDraft, setTimesDraft] = useState(String(timesPerPeriod))
  const [weeksDraft, setWeeksDraft] = useState(durationWeeks == null ? '' : String(durationWeeks))
  useEffect(() => { setTimesDraft(String(timesPerPeriod)) }, [timesPerPeriod])
  useEffect(() => { setWeeksDraft(durationWeeks == null ? '' : String(durationWeeks)) }, [durationWeeks])

  const set = (patch: Partial<Schedule>) => onChange({ ...value, ...patch })

  function pickPeriod(next: CarePlanPeriod) {
    haptics.tap()
    // Carry the count over, but not past the new period's ceiling: 12 a day is
    // a plan, 12 a week is more than the ceiling allows.
    set({ cadence: next, timesPerPeriod: clampPerPeriod(next, timesPerPeriod) })
  }

  function commitTimes() {
    const n = parseInt(timesDraft.replace(/[^0-9]/g, ''), 10)
    const next = clampPerPeriod(cadence, Number.isNaN(n) ? timesPerPeriod : n)
    setTimesDraft(String(next))
    if (next !== timesPerPeriod) set({ timesPerPeriod: next })
  }

  function commitWeeks() {
    const raw = weeksDraft.replace(/[^0-9]/g, '')
    // An empty field means ongoing, which is the same as tapping that chip.
    if (!raw) { if (durationWeeks != null) set({ durationWeeks: null }); return }
    const next = Math.min(MAX_WEEKS, Math.max(1, parseInt(raw, 10)))
    setWeeksDraft(String(next))
    if (next !== durationWeeks) set({ durationWeeks: next })
  }

  const fs = compact ? 12 : 13
  const pv = compact ? 7 : 9
  const ph = compact ? 11 : 14

  const chip = (on: boolean) => ({
    paddingHorizontal: ph, paddingVertical: pv, borderRadius: 99, borderWidth: 1,
    borderColor: on ? t.accentBorder : t.cardBorder,
    backgroundColor: on ? t.accentBg : t.inputBg,
  })
  const chipText = (on: boolean) => ({ fontSize: fs, fontWeight: '700' as const, color: on ? t.accent : t.textMuted })
  const field = {
    minWidth: 78, textAlign: 'center' as const,
    paddingHorizontal: ph, paddingVertical: pv - 1,
    borderRadius: 99, borderWidth: 1,
    borderColor: t.inputBorder, backgroundColor: t.inputBg,
    color: t.textPrimary, fontSize: fs, fontWeight: '700' as const,
  }
  const Label = ({ children }: { children: string }) => (
    <Text style={{ fontSize: fs, fontWeight: '700', color: t.textPrimary }}>{children}</Text>
  )

  return (
    <View style={{ gap: 12 }}>
      <View style={{ gap: 7 }}>
        <Label>How often</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {PERIODS.map(p => {
            const on = cadence === p.key
            return (
              <TouchableOpacity key={p.key} onPress={() => pickPeriod(p.key)}
                accessibilityRole="button" accessibilityState={{ selected: on }}
                style={chip(on)}>
                <Text style={chipText(on)}>{p.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <View style={{ gap: 7 }}>
        <Label>Frequency</Label>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {SUGGESTED[cadence].filter(n => n <= maxTimes).map(n => {
            const on = timesPerPeriod === n
            return (
              <TouchableOpacity key={n} onPress={() => { haptics.tap(); set({ timesPerPeriod: n }) }}
                accessibilityRole="button" accessibilityState={{ selected: on }}
                accessibilityLabel={frequencyLabel(cadence, n)}
                style={chip(on)}>
                <Text style={chipText(on)}>
                  {n === 1 ? `Once ${periodAdverb(cadence)}` : `${n} times ${periodAdverb(cadence)}`}
                </Text>
              </TouchableOpacity>
            )
          })}
          <TextInput
            value={timesDraft}
            onChangeText={v => setTimesDraft(v.replace(/[^0-9]/g, '').slice(0, 2))}
            onBlur={commitTimes} onSubmitEditing={commitTimes}
            keyboardType="number-pad" returnKeyType="done" maxLength={2}
            accessibilityLabel={`Or type how many times a ${periodNoun(cadence)}, up to ${maxTimes}`}
            placeholder="or type" placeholderTextColor={t.textMuted}
            style={field}
          />
        </View>
      </View>

      {showDuration && (
        <View style={{ gap: 7 }}>
          <Label>Duration</Label>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
            {WEEKS.map(w => {
              const on = durationWeeks === w
              return (
                <TouchableOpacity key={String(w)} onPress={() => { haptics.tap(); set({ durationWeeks: w }) }}
                  accessibilityRole="button" accessibilityState={{ selected: on }}
                  accessibilityLabel={durationLabel(w)}
                  style={chip(on)}>
                  <Text style={chipText(on)}>{w == null ? 'Ongoing' : w === 1 ? '1 week' : `${w} weeks`}</Text>
                </TouchableOpacity>
              )
            })}
            <TextInput
              value={weeksDraft}
              onChangeText={v => setWeeksDraft(v.replace(/[^0-9]/g, '').slice(0, 2))}
              onBlur={commitWeeks} onSubmitEditing={commitWeeks}
              keyboardType="number-pad" returnKeyType="done" maxLength={2}
              accessibilityLabel={`Or type how many weeks, up to ${MAX_WEEKS}. Leave empty for ongoing.`}
              placeholder="weeks" placeholderTextColor={t.textMuted}
              style={field}
            />
          </View>
        </View>
      )}

      <Text style={{ fontSize: 12, color: t.textMuted }}>
        {frequencyLabel(cadence, timesPerPeriod)}
        {showDuration ? ` · ${durationLabel(durationWeeks).toLowerCase()}` : ''}
      </Text>
    </View>
  )
}
