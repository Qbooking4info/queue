import { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { haptics } from '../lib/haptics'
import { fmtLocalDate } from '../lib/format'

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

interface Props {
  value: string | null
  onChange: (date: string) => void
  minDate?: string
  maxDate?: string
  theme: any
}

/**
 * A real month-grid calendar (as opposed to the chip-row-of-next-N-days
 * picker used elsewhere, e.g. RescheduleModal) -- for a follow-up booked
 * weeks or months out, scrolling a flat list of daily chips to find a date
 * gets unwieldy fast; a calendar lets a doctor jump straight to "the 2nd
 * Tuesday of next month" the way they'd actually think about it.
 */
export function CalendarPicker({ value, onChange, minDate, maxDate, theme: t }: Props) {
  const today = fmtLocalDate(new Date())
  const floor = minDate ?? today
  const initial = value ? new Date(value + 'T00:00:00') : new Date(floor + 'T00:00:00')
  const [viewYear,  setViewYear]  = useState(initial.getFullYear())
  const [viewMonth, setViewMonth] = useState(initial.getMonth())

  const firstOfMonth = new Date(viewYear, viewMonth, 1)
  const startWeekday = firstOfMonth.getDay()
  const daysInMonth  = new Date(viewYear, viewMonth + 1, 0).getDate()

  const cells: (string | null)[] = [
    ...Array(startWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => fmtLocalDate(new Date(viewYear, viewMonth, i + 1))),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const floorMonth = minDate ? new Date(minDate + 'T00:00:00') : new Date(floor + 'T00:00:00')
  const canGoPrev = viewYear > floorMonth.getFullYear() || (viewYear === floorMonth.getFullYear() && viewMonth > floorMonth.getMonth())
  const ceilingMonth = maxDate ? new Date(maxDate + 'T00:00:00') : null
  const canGoNext = !ceilingMonth || viewYear < ceilingMonth.getFullYear() || (viewYear === ceilingMonth.getFullYear() && viewMonth < ceilingMonth.getMonth())

  function goMonth(delta: number) {
    haptics.tap()
    let y = viewYear, m = viewMonth + delta
    if (m < 0) { m = 11; y -= 1 }
    if (m > 11) { m = 0; y += 1 }
    setViewYear(y); setViewMonth(m)
  }

  return (
    <View>
      <View style={st.header}>
        <TouchableOpacity onPress={() => goMonth(-1)} disabled={!canGoPrev} hitSlop={8} accessibilityLabel="Previous month">
          <Ionicons name="chevron-back" size={18} color={canGoPrev ? t.textPrimary : t.textMuted} style={{ opacity: canGoPrev ? 1 : 0.3 }} />
        </TouchableOpacity>
        <Text style={[st.headerLabel, { color: t.textPrimary }]}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={() => goMonth(1)} disabled={!canGoNext} hitSlop={8} accessibilityLabel="Next month">
          <Ionicons name="chevron-forward" size={18} color={canGoNext ? t.textPrimary : t.textMuted} style={{ opacity: canGoNext ? 1 : 0.3 }} />
        </TouchableOpacity>
      </View>

      <View style={st.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text key={i} style={[st.weekday, { color: t.textMuted }]}>{w}</Text>
        ))}
      </View>

      <View style={st.grid}>
        {cells.map((iso, i) => {
          if (!iso) return <View key={i} style={st.cell} />
          const disabled = (minDate && iso < minDate) || (maxDate && iso > maxDate)
          const isToday    = iso === today
          const isSelected = iso === value
          const day = parseInt(iso.slice(-2), 10)
          return (
            <View key={i} style={st.cell}>
              <TouchableOpacity
                disabled={!!disabled}
                onPress={() => { haptics.tap(); onChange(iso) }}
                accessibilityLabel={iso}
                style={[
                  st.dayBtn,
                  isSelected ? { backgroundColor: t.accent } : isToday ? { borderWidth: 1, borderColor: t.accentBorder } : null,
                ]}>
                <Text style={{
                  fontSize: 13, fontWeight: isSelected ? '800' : '600',
                  color: disabled ? t.textMuted : isSelected ? '#fff' : t.textPrimary,
                  opacity: disabled ? 0.3 : 1,
                }}>{day}</Text>
              </TouchableOpacity>
            </View>
          )
        })}
      </View>
    </View>
  )
}

const st = StyleSheet.create({
  header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 10 },
  headerLabel: { fontSize: 14, fontWeight: '800' },
  weekRow:     { flexDirection: 'row' },
  weekday:     { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700', marginBottom: 4 },
  grid:        { flexDirection: 'row', flexWrap: 'wrap' },
  cell:        { width: `${100 / 7}%`, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 2 },
  dayBtn:      { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
})
