// "Delete account" for every Queue app (Play Store and App Store both require an
// in-app way to do this). Two steps: explain what happens, then type DELETE.
import { useState } from 'react'
import { View, TouchableOpacity } from 'react-native'
import { Text, TextInput } from './ui/Typography'
import { Card, PrimaryButton } from './ui/v3'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { clearCache } from '../lib/cache'
import { haptics } from '../lib/haptics'
import { deleteAccount } from '../lib/api'

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

export function DeleteAccount({ what = 'your profile, photo and sign-in' }: { what?: string }) {
  const { theme: t } = useTheme()
  const { user, signOut } = useAuth() as any
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function remove() {
    setBusy(true); setError('')
    const { error: e } = await supabase.rpc('delete_my_account')
    if (e) {
      // Until delete_my_account() is deployed, patients use the existing web route.
      const missing = /function .* does not exist|schema cache|Could not find the function/i.test(e.message)
      const { data: { session } } = await supabase.auth.getSession()
      const ok = missing && session?.access_token ? await deleteAccount(API_URL, session.access_token) : false
      if (!ok) {
        setBusy(false); haptics.error()
        setError(missing ? 'Could not delete your account right now. Please contact Queue Support.' : e.message)
        return
      }
    }
    haptics.success()
    await clearCache(user?.id).catch(() => {})
    await signOut()
  }

  if (!open) {
    return (
      <TouchableOpacity onPress={() => { haptics.tap(); setOpen(true) }} accessibilityRole="button"
        style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: t.danger, fontSize: 14, fontWeight: '600' }}>Delete account</Text>
      </TouchableOpacity>
    )
  }
  return (
    <Card style={{ gap: 10, borderColor: t.dangerBorder }}>
      <Text style={{ fontSize: 16, fontWeight: '700', color: t.textPrimary }}>Delete your account?</Text>
      <Text style={{ fontSize: 13, color: t.textSecondary, lineHeight: 19 }}>
        This permanently removes {what}, and cancels upcoming bookings. Visit records hospitals must keep by law
        stay with them, without your name. Wallet balance is not refundable after deletion. This can't be undone.
      </Text>
      <Text style={{ fontSize: 13, color: t.textMuted }}>Type DELETE to confirm</Text>
      <TextInput value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} accessibilityLabel="Type DELETE to confirm"
        style={{ minHeight: 48, borderWidth: 1, borderRadius: 12, borderColor: t.inputBorder, backgroundColor: t.inputBg, paddingHorizontal: 14, fontSize: 15, color: t.textPrimary }} />
      {!!error && <Text accessibilityRole="alert" style={{ fontSize: 13, color: t.danger }}>{error}</Text>}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><PrimaryButton label="Keep account" variant="ghost" height={48} onPress={() => { setOpen(false); setTyped(''); setError('') }} /></View>
        <View style={{ flex: 1 }}><PrimaryButton label="Delete" variant="danger" height={48} loading={busy} disabled={typed.trim() !== 'DELETE'} onPress={remove} /></View>
      </View>
    </Card>
  )
}
