// Personal details collected at sign-up in every Queue app: title, gender, date of
// birth, country and state. One component so the four apps ask the same way.
import { useState } from 'react'
import { View, TouchableOpacity, Modal, FlatList } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text, TextInput } from './Typography'
import { DateOfBirthSelect } from './DateOfBirthSelect'
import { useTheme } from '../../contexts/ThemeContext'
import { haptics } from '../../lib/haptics'

export const TITLES = ['Mr', 'Mrs', 'Ms', 'Miss', 'Dr', 'Prof', 'Chief', 'Engr'] as const
export const GENDERS = [{ value: 'female', label: 'Female' }, { value: 'male', label: 'Male' }, { value: 'prefer_not_to_say', label: 'Prefer not to say' }] as const
export const COUNTRIES = ['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'Cameroon', 'Benin', 'United Kingdom', 'United States', 'Canada', 'Other'] as const
export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo',
  'Ekiti', 'Enugu', 'FCT – Abuja', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
]

export interface ProfileValues { title: string; gender: string; dob: string; country: string; state: string }
export const EMPTY_PROFILE: ProfileValues = { title: '', gender: '', dob: '', country: 'Nigeria', state: '' }

/** First missing field as a sentence, or null when complete. */
export function profileProblem(v: ProfileValues, opts: { requireDob?: boolean } = {}): string | null {
  if (!v.title) return 'Choose your title.'
  if (!v.gender) return 'Choose your gender.'
  if (opts.requireDob !== false && !v.dob) return 'Enter your date of birth.'
  if (!v.country) return 'Choose your country.'
  if (!v.state.trim()) return v.country === 'Nigeria' ? 'Choose your state.' : 'Enter your state or region.'
  return null
}

function Chips<T extends string>({ options, value, onChange, label }: { options: { value: T; label: string }[]; value: string; onChange: (v: T) => void; label: string }) {
  const { theme: t } = useTheme()
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityLabel={label}>
      {options.map(o => {
        const on = o.value === value
        return (
          <TouchableOpacity key={o.value} onPress={() => { haptics.tap(); onChange(o.value) }} accessibilityRole="radio" accessibilityState={{ checked: on }}
            style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 99, justifyContent: 'center', borderWidth: 1,
              borderColor: on ? t.accent : t.inputBorder, backgroundColor: on ? t.accent : t.inputBg }}>
            <Text style={{ fontSize: 14, fontWeight: '600', color: on ? (t.id === 'forest' ? '#081416' : '#FFFFFF') : t.textSecondary }}>{o.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function Select({ value, placeholder, options, onChange, label }: { value: string; placeholder: string; options: readonly string[]; onChange: (v: string) => void; label: string }) {
  const { theme: t } = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <>
      <TouchableOpacity onPress={() => { haptics.tap(); setOpen(true) }} accessibilityRole="button" accessibilityLabel={`${label}: ${value || 'not chosen'}`}
        style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.inputBg, paddingHorizontal: 14,
          flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ flex: 1, fontSize: 15, color: value ? t.textPrimary : t.textMuted }}>{value || placeholder}</Text>
        <Ionicons name="chevron-down" size={18} color={t.textMuted} />
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: t.canvasBg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%', paddingBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16 }}>
              <Text style={{ flex: 1, fontSize: 17, fontWeight: '800', color: t.textPrimary }}>{label}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={22} color={t.textPrimary} />
              </TouchableOpacity>
            </View>
            <FlatList data={options as string[]} keyExtractor={o => o} contentContainerStyle={{ paddingHorizontal: 16 }}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => { haptics.tap(); onChange(item); setOpen(false) }} accessibilityRole="button"
                  style={{ minHeight: 50, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: t.cardBorder }}>
                  <Text style={{ flex: 1, fontSize: 15, color: t.textPrimary, fontWeight: item === value ? '700' : '400' }}>{item}</Text>
                  {item === value && <Ionicons name="checkmark" size={18} color={t.accent} />}
                </TouchableOpacity>
              )} />
          </View>
        </View>
      </Modal>
    </>
  )
}

export function ProfileFields({ value, onChange, showDob = true, labelStyle }: {
  value: ProfileValues; onChange: (v: ProfileValues) => void; showDob?: boolean; labelStyle?: any
}) {
  const { theme: t } = useTheme()
  const set = (patch: Partial<ProfileValues>) => onChange({ ...value, ...patch })
  const L = ({ children }: { children: string }) => (
    <Text style={[{ fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', color: t.textMuted, marginBottom: 8 }, labelStyle]}>{children}</Text>
  )
  return (
    <View style={{ gap: 16 }}>
      <View><L>Title</L><Chips label="Title" options={TITLES.map(x => ({ value: x, label: x }))} value={value.title} onChange={v => set({ title: v })} /></View>
      <View><L>Gender</L><Chips label="Gender" options={GENDERS as any} value={value.gender} onChange={v => set({ gender: v })} /></View>
      {showDob && <View><L>Date of birth</L><DateOfBirthSelect value={value.dob} onChange={d => set({ dob: d })} maxYear={new Date().getFullYear()} /></View>}
      <View><L>Country</L><Select label="Country" placeholder="Choose country" options={COUNTRIES} value={value.country} onChange={c => set({ country: c, state: c === value.country ? value.state : '' })} /></View>
      <View>
        <L>{value.country === 'Nigeria' ? 'State' : 'State / region'}</L>
        {value.country === 'Nigeria'
          ? <Select label="State" placeholder="Choose state" options={NIGERIAN_STATES} value={value.state} onChange={st => set({ state: st })} />
          : <TextInput value={value.state} onChangeText={st => set({ state: st })} placeholder="State or region" placeholderTextColor={t.textMuted} accessibilityLabel="State or region"
              style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.inputBg, paddingHorizontal: 14, fontSize: 15, color: t.textPrimary }} />}
      </View>
    </View>
  )
}
