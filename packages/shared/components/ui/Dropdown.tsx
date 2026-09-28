import { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, ScrollView, StyleProp, ViewStyle } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useTheme } from '../../contexts/ThemeContext'

export interface DropdownOption<K extends string = string> {
  key: K
  label: string
  /** Shown under the label in the menu — e.g. a hospital's city. */
  hint?: string
}

/**
 * A compact filter control: a pill showing the current value, opening a list to
 * choose from.
 *
 * The menu is a centred Modal rather than a popover anchored under the trigger.
 * Anchoring needs measure() on the trigger plus manual flip/clamp logic against the
 * screen edges, and gets it wrong on small screens — where these three sit side by
 * side and the right-hand one would overflow. A centred sheet is correct at every
 * width and needs no measurement.
 */
export function Dropdown<K extends string = string>({
  label, value, options, onChange, icon, style, disabled,
}: {
  /** Shown as the menu's heading, and as the accessibility label. */
  label: string
  value: K
  options: DropdownOption<K>[]
  onChange: (key: K) => void
  icon?: React.ComponentProps<typeof Ionicons>['name']
  style?: StyleProp<ViewStyle>
  disabled?: boolean
}) {
  const { theme: t, chipElevation } = useTheme()
  const [open, setOpen] = useState(false)
  const current = options.find(o => o.key === value)

  return (
    <>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? 'none'}`}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[{
          flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 5,
          paddingVertical: 9, paddingHorizontal: 11, borderRadius: 12,
          backgroundColor: t.cardBg, borderWidth: 1, borderColor: t.cardBorder,
          opacity: disabled ? 0.5 : 1,
        }, style]}
      >
        {!!icon && <Ionicons name={icon} size={13} color={t.accent} />}
        {/* flexShrink lets the label ellipsise instead of pushing the chevron out
            of the pill, which is what happens with three of these in one row. */}
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, fontWeight: '600', color: t.textPrimary }}>
          {current?.label ?? '—'}
        </Text>
        <Ionicons name="chevron-down" size={13} color={t.textSecondary} style={{ marginLeft: 'auto' }} />
      </TouchableOpacity>

      {open && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setOpen(false)}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          >
            {/* activeOpacity=1 and a no-op press so a tap inside the card doesn't
                bubble up to the backdrop and close it. */}
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => {}}
              style={[{
                width: '100%', maxWidth: 360, maxHeight: '70%', borderRadius: 20, overflow: 'hidden',
                backgroundColor: t.popover, borderWidth: 1, borderColor: t.popoverBorder,
              }, chipElevation]}
            >
              <Text style={{
                fontSize: 12, fontWeight: '700', letterSpacing: 0.6, color: t.textSecondary,
                paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10, textTransform: 'uppercase',
              }}>
                {label}
              </Text>
              <ScrollView>
                {options.map(o => {
                  const on = o.key === value
                  return (
                    <TouchableOpacity
                      key={o.key}
                      onPress={() => { setOpen(false); onChange(o.key) }}
                      style={{
                        flexDirection: 'row', alignItems: 'center', gap: 10,
                        paddingHorizontal: 18, paddingVertical: 13,
                        backgroundColor: on ? t.accentBg : 'transparent',
                      }}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 15, fontWeight: on ? '700' : '500', color: on ? t.accent : t.textPrimary }}>
                          {o.label}
                        </Text>
                        {!!o.hint && (
                          <Text numberOfLines={1} style={{ fontSize: 11.5, color: t.textSecondary, marginTop: 1 }}>
                            {o.hint}
                          </Text>
                        )}
                      </View>
                      {on && <Ionicons name="checkmark" size={17} color={t.accent} />}
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </>
  )
}
