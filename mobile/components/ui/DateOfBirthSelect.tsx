import { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, Pressable, StyleSheet, Platform } from 'react-native'
import { Picker } from '@react-native-picker/picker'
import { useTheme } from '../../contexts/ThemeContext'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

interface DatePart { year: number; month: number; day: number }

function daysInMonth(month: number, year: number): number {
  return new Date(year, month, 0).getDate()
}

function clamp(part: DatePart): DatePart {
  return { ...part, day: Math.min(part.day, daysInMonth(part.month, part.year)) }
}

function parse(value: string): DatePart | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

function format(part: DatePart): string {
  return `${part.year}-${String(part.month).padStart(2, '0')}-${String(part.day).padStart(2, '0')}`
}

interface Props {
  value:        string
  onChange:     (v: string) => void
  placeholder?: string
  maxYear?:     number
  minYear?:     number
}

// Android's Picker has a native dropdown mode (tap → anchored OS menu), so it's
// rendered directly inline. iOS's Picker only ever renders as an always-visible
// wheel — there's no closed/collapsed state — so on iOS it's gated behind a
// compact pressable field that reveals the wheels in a sheet, matching the
// platform's native date-picker convention (e.g. UIDatePicker in compact mode).
export function DateOfBirthSelect({ value, onChange, placeholder = 'Select date of birth', maxYear, minYear }: Props) {
  const { theme: t } = useTheme()
  const now      = new Date()
  const topYear  = maxYear ?? now.getFullYear()
  const bottomYear = minYear ?? topYear - 100
  const years    = Array.from({ length: topYear - bottomYear + 1 }, (_, i) => topYear - i)

  const parsed   = parse(value)
  const fallback: DatePart = { year: topYear - 25, month: now.getMonth() + 1, day: now.getDate() }
  const current  = parsed ?? fallback

  const [open, setOpen]   = useState(false)
  const [draft, setDraft] = useState<DatePart>(current)

  function openPicker() {
    setDraft(current)
    setOpen(true)
  }

  function confirm() {
    onChange(format(draft))
    setOpen(false)
  }

  if (Platform.OS === 'android') {
    const days = Array.from({ length: daysInMonth(current.month, current.year) }, (_, i) => i + 1)
    function update(next: Partial<DatePart>) {
      onChange(format(clamp({ ...current, ...next })))
    }
    return (
      <View style={s.androidRow}>
        <View style={[s.androidField, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
          <Picker selectedValue={current.day} onValueChange={v => update({ day: Number(v) })}
            mode="dropdown" dropdownIconColor={t.textMuted} style={{ color: t.textPrimary }}>
            {days.map(d => <Picker.Item key={d} label={String(d)} value={d} />)}
          </Picker>
        </View>
        <View style={[s.androidField, { flex: 1.4, backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
          <Picker selectedValue={current.month} onValueChange={v => update({ month: Number(v) })}
            mode="dropdown" dropdownIconColor={t.textMuted} style={{ color: t.textPrimary }}>
            {MONTHS.map((label, i) => <Picker.Item key={label} label={label} value={i + 1} />)}
          </Picker>
        </View>
        <View style={[s.androidField, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
          <Picker selectedValue={current.year} onValueChange={v => update({ year: Number(v) })}
            mode="dropdown" dropdownIconColor={t.textMuted} style={{ color: t.textPrimary }}>
            {years.map(y => <Picker.Item key={y} label={String(y)} value={y} />)}
          </Picker>
        </View>
      </View>
    )
  }

  const displayLabel = parsed
    ? `${String(parsed.day).padStart(2, '0')} ${MONTHS[parsed.month - 1]} ${parsed.year}`
    : placeholder

  return (
    <>
      <TouchableOpacity onPress={openPicker}
        style={[s.field, { backgroundColor: t.inputBg, borderColor: t.inputBorder }]}>
        <Text style={[s.fieldText, { color: parsed ? t.textPrimary : t.textMuted }]}>{displayLabel}</Text>
        <Text style={[s.chevron, { color: t.textMuted }]}>▾</Text>
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={s.overlay} onPress={() => setOpen(false)} />
        <View style={[s.sheet, { backgroundColor: t.cardBg }]}>
          <View style={[s.handle, { backgroundColor: t.inputBorder }]} />
          <Text style={[s.title, { color: t.textPrimary }]}>Date of birth</Text>

          <View style={s.wheelRow}>
            <Picker style={s.wheel} itemStyle={{ color: t.textPrimary, fontSize: 18 }}
              selectedValue={draft.day} onValueChange={v => setDraft(p => clamp({ ...p, day: Number(v) }))}>
              {Array.from({ length: daysInMonth(draft.month, draft.year) }, (_, i) => i + 1)
                .map(d => <Picker.Item key={d} label={String(d)} value={d} />)}
            </Picker>
            <Picker style={[s.wheel, { flex: 1.3 }]} itemStyle={{ color: t.textPrimary, fontSize: 18 }}
              selectedValue={draft.month} onValueChange={v => setDraft(p => clamp({ ...p, month: Number(v) }))}>
              {MONTHS.map((label, i) => <Picker.Item key={label} label={label} value={i + 1} />)}
            </Picker>
            <Picker style={s.wheel} itemStyle={{ color: t.textPrimary, fontSize: 18 }}
              selectedValue={draft.year} onValueChange={v => setDraft(p => clamp({ ...p, year: Number(v) }))}>
              {years.map(y => <Picker.Item key={y} label={String(y)} value={y} />)}
            </Picker>
          </View>

          <TouchableOpacity onPress={confirm} style={[s.confirmBtn, { backgroundColor: t.accent }]}>
            <Text style={s.confirmText}>Confirm</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  )
}

const s = StyleSheet.create({
  field:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11 },
  fieldText:   { fontSize: 14 },
  chevron:     { fontSize: 12 },
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet:       { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 28 },
  handle:      { width: 40, height: 4, borderRadius: 99, alignSelf: 'center', marginBottom: 16 },
  title:       { fontSize: 16, fontWeight: '800', marginBottom: 4, textAlign: 'center' },
  wheelRow:    { flexDirection: 'row' },
  wheel:       { flex: 1 },
  confirmBtn:  { borderRadius: 14, padding: 14, alignItems: 'center', marginTop: 8 },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  androidRow:  { flexDirection: 'row', gap: 8 },
  androidField:{ flex: 1, borderWidth: 1, borderRadius: 12, overflow: 'hidden', justifyContent: 'center' },
})
