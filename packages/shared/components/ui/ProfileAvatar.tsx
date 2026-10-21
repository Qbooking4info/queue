// The signed-in user's picture, used in every app's profile header (editable) and
// home header (tap to open profile). Falls back to initials until a photo is set.
import { useState } from 'react'
import { View, Image, TouchableOpacity, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { Text } from './Typography'
import { useAuth } from '../../contexts/AuthContext'
import { Alert } from '../../contexts/AlertContext'
import { pickAndUploadAvatar, pickAndUploadDoctorPhoto } from '../../lib/avatar'
import { haptics } from '../../lib/haptics'

export function initialsOf(name?: string | null) {
  return (name ?? '').replace(/^Dr\.?\s*/i, '').split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?'
}

export function ProfileAvatar({ size = 68, editable, onPress, name, variant = 'user' }: {
  size?: number
  /** Tapping offers Take photo / Choose from photos and uploads the result. */
  editable?: boolean
  /** Used instead when not editable (e.g. home header → Profile). */
  onPress?: () => void
  /** Name for initials when the user row has none (doctor / staff display names). */
  name?: string | null
  /**
   * 'doctor' also writes doctors.avatar_url. Patients cannot read another
   * person's users row, so a doctor photo saved only to users.avatar_url is
   * invisible to them -- which is what happened before this existed.
   */
  variant?: 'user' | 'doctor'
}) {
  const { user, refreshProfile } = useAuth() as any
  const [busy, setBusy] = useState(false)
  const url = user?.avatar_url as string | null | undefined

  async function change(source: 'library' | 'camera') {
    setBusy(true)
    try {
      const u = variant === 'doctor'
        ? await pickAndUploadDoctorPhoto(source)
        : await pickAndUploadAvatar(source)
      if (u) { haptics.success(); await refreshProfile?.() }
    } catch (e) {
      haptics.error()
      Alert.alert('Profile picture', e instanceof Error ? e.message : 'Could not update your picture.')
    } finally { setBusy(false) }
  }

  function ask() {
    haptics.tap()
    Alert.alert('Profile picture', 'Choose a new picture', [
      { text: 'Take photo', onPress: () => change('camera') },
      { text: 'Choose from photos', onPress: () => change('library') },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  const face = (
    <View style={{ width: size, height: size, borderRadius: 99, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {url
        ? <Image source={{ uri: url }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />
        : <Text style={{ fontSize: Math.round(size / 3.1), fontWeight: '800', color: '#0F766E' }}>{initialsOf(name ?? user?.full_name)}</Text>}
      {busy && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}
    </View>
  )

  if (editable) {
    const badge = Math.max(22, Math.round(size * 0.38))
    return (
      <TouchableOpacity onPress={ask} disabled={busy} accessibilityRole="button" accessibilityLabel="Change profile picture">
        {face}
        <View style={{ position: 'absolute', right: -2, bottom: -2, width: badge, height: badge, borderRadius: 99, backgroundColor: '#0F766E',
          borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="camera" size={Math.round(badge / 2)} color="#FFFFFF" />
        </View>
      </TouchableOpacity>
    )
  }
  if (onPress) {
    return (
      <TouchableOpacity onPress={() => { haptics.tap(); onPress() }} accessibilityRole="button" accessibilityLabel="Open your profile"
        style={{ borderRadius: 99, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' }}>
        {face}
      </TouchableOpacity>
    )
  }
  return face
}
