import * as ImagePicker from 'expo-image-picker'
import { supabase } from './supabase'

// Pick, crop square, upload to the public `avatars` bucket under the caller's own
// folder, and point users.avatar_url at it. Returns the new URL, null if cancelled,
// or throws with a readable message.
export async function pickAndUploadAvatar(source: 'library' | 'camera' = 'library'): Promise<string | null> {
  const perm = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) throw new Error(source === 'camera' ? 'Allow camera access to take a photo.' : 'Allow photo access to choose a picture.')

  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 }
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts)
  if (res.canceled || !res.assets?.[0]) return null
  const asset = res.assets[0]

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in again.')

  const ext = asset.mimeType === 'image/png' ? 'png' : asset.mimeType === 'image/webp' ? 'webp' : 'jpg'
  const path = `${user.id}/avatar-${Date.now()}.${ext}`
  const body = await (await fetch(asset.uri)).arrayBuffer()
  const { error: upErr } = await supabase.storage.from('avatars')
    .upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true })
  if (upErr) {
    throw new Error(/bucket not found/i.test(upErr.message)
      ? 'Profile pictures are being switched on. Please try again later.'
      : upErr.message)
  }
  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
  const { error: updErr } = await supabase.from('users').update({ avatar_url: pub.publicUrl }).eq('auth_id', user.id)
  if (updErr) throw new Error(updErr.message)
  return pub.publicUrl
}
