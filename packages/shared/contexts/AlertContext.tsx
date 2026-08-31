import { useState, useCallback, useEffect, ReactNode } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useTheme } from './ThemeContext'

export interface AlertButton {
  text?: string
  onPress?: () => void
  style?: 'default' | 'cancel' | 'destructive'
}

interface AlertState { title: string; message?: string; buttons: AlertButton[] }

let showAlertImpl: ((title: string, message?: string, buttons?: AlertButton[]) => void) | null = null

// Drop-in replacement for react-native's `Alert` -- react-native-web's own Alert.alert
// is a complete no-op (`static alert() {}`, see
// node_modules/react-native-web/dist/exports/Alert/index.js), so every confirmation
// dialog and every error/success message in this app was silently doing nothing on
// web: buttons never rendered, onPress never fired, no error surfaced. This renders a
// real themed modal on every platform (not just web), so behaviour is identical
// everywhere rather than diverging by platform. Same call signature as RN's Alert.alert
// (title, message?, buttons?) -- every existing call site works unchanged, only the
// import source changes (`from 'react-native'` -> `from '../contexts/AlertContext'`).
export const Alert = {
  alert(title: string, message?: string, buttons?: AlertButton[]) {
    if (showAlertImpl) showAlertImpl(title, message, buttons)
    else console.warn('[Alert.alert] called before AlertProvider mounted:', title, message)
  },
}

export function AlertProvider({ children }: { children: ReactNode }) {
  const { theme: t } = useTheme()
  const [state, setState] = useState<AlertState | null>(null)

  const show = useCallback((title: string, message?: string, buttons?: AlertButton[]) => {
    setState({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] })
  }, [])

  useEffect(() => { showAlertImpl = show; return () => { showAlertImpl = null } }, [show])

  function press(btn: AlertButton) {
    setState(null)
    btn.onPress?.()
  }

  return (
    <>
      {children}
      <Modal visible={!!state} transparent animationType="fade" onRequestClose={() => setState(null)}>
        <View style={st.overlay}>
          <View style={[st.card, { backgroundColor: t.cardBg, borderColor: t.cardBorder }]}>
            <Text style={[st.title, { color: t.textPrimary }]}>{state?.title}</Text>
            {!!state?.message && <Text style={[st.message, { color: t.textMuted }]}>{state.message}</Text>}
            <View style={st.buttonRow}>
              {state?.buttons.map((btn, i) => (
                <TouchableOpacity key={i} onPress={() => press(btn)}
                  style={[st.button, { borderColor: t.cardBorder }]}>
                  <Text style={[st.buttonText, {
                    color: btn.style === 'destructive' ? '#FF5C5C' : btn.style === 'cancel' ? t.textMuted : t.accent,
                    fontWeight: btn.style === 'cancel' ? '600' : '800',
                  }]}>
                    {btn.text ?? 'OK'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </>
  )
}

const st = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card:       { width: '100%', maxWidth: 380, borderRadius: 18, borderWidth: 1, padding: 20 },
  title:      { fontSize: 16, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  message:    { fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 18 },
  buttonRow:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  button:     { flexGrow: 1, minWidth: 100, paddingVertical: 11, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  buttonText: { fontSize: 13 },
})
