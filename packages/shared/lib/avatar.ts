import * as ImagePicker from 'expo-image-picker'
import { supabase } from './supabase'

// Mirrors the private constant in api.ts -- same env var, same trailing-slash trim.
const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '')

/**
 * Pick a square image and put it in a public bucket. Shared by the patient
 * avatar, the doctor's profile photo and the hospital logo: same permissions,
 * same square crop, same upload -- only the destination row differs, which is
 * the caller's job.
 *
 * Returns the public URL, or null if the picker was cancelled.
 */
async function pickAndUpload(
  bucket: string,
  folder: string,
  prefix: string,
  source: 'library' | 'camera',
  /** Crop shape. Square for faces and logos; a vehicle wants landscape. */
  aspect: [number, number] = [1, 1],
): Promise<string | null> {
  const perm = source === 'camera'
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!perm.granted) {
    throw new Error(source === 'camera'
      ? 'Allow camera access to take a photo.'
      : 'Allow photo access to choose a picture.')
  }

  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect, quality: 0.7 }
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts)
  if (res.canceled || !res.assets?.[0]) return null
  const asset = res.assets[0]

  const ext = asset.mimeType === 'image/png' ? 'png' : asset.mimeType === 'image/webp' ? 'webp' : 'jpg'
  const path = `${folder}/${prefix}-${Date.now()}.${ext}`
  const body = await (await fetch(asset.uri)).arrayBuffer()
  const { error: upErr } = await supabase.storage.from(bucket)
    .upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true })
  if (upErr) {
    throw new Error(/bucket not found/i.test(upErr.message)
      ? 'Image uploads are being switched on. Please try again later.'
      : upErr.message)
  }
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

/**
 * A doctor's profile photo, shown to patients in search, on the doctor's
 * profile and against their appointments.
 *
 * Writes both users.avatar_url and doctors.avatar_url: the doctor app reads the
 * first (it is the signed-in person's own avatar) while every patient-facing
 * query reads the second, because a patient cannot select from users for
 * someone who is not them.
 */
export async function pickAndUploadDoctorPhoto(source: 'library' | 'camera' = 'library'): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in again.')

  const url = await pickAndUpload('avatars', user.id, 'avatar', source)
  if (!url) return null

  const { error: uErr } = await supabase.from('users').update({ avatar_url: url }).eq('auth_id', user.id)
  if (uErr) throw new Error(uErr.message)

  // doctors.avatar_url goes through the API, not straight from here: the
  // doctors table carries read policies only, so a client-side update is
  // refused by RLS. The route updates every doctors row this person owns.
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API_URL}/api/doctors/me`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ avatar_url: url }),
  })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    // The picture is already uploaded and on the users row at this point, so
    // the doctor sees it in their own app -- say plainly that patients will not.
    throw new Error(b?.error ?? 'Your picture was saved, but patients will not see it yet. Please try again.')
  }

  return url
}

/**
 * A photo of the vehicle itself, so a patient waiting at the roadside can tell
 * which ambulance is theirs.
 *
 * Landscape rather than square: a vehicle is wider than it is tall, and a
 * square crop of one is mostly road and sky.
 */
export async function pickAndUploadAmbulancePhoto(
  ambulanceId: string,
  source: 'library' | 'camera' = 'camera',
): Promise<string | null> {
  const url = await pickAndUpload('ambulances', ambulanceId, 'vehicle', source, [16, 10])
  if (!url) return null
  const { error } = await supabase.from('ambulances').update({ photo_url: url }).eq('id', ambulanceId)
  if (error) throw new Error(error.message)
  return url
}

/** A hospital's logo, shown wherever the hospital appears to patients. */
export async function pickAndUploadHospitalLogo(
  hospitalId: string,
  source: 'library' | 'camera' = 'library',
): Promise<string | null> {
  const url = await pickAndUpload('hospitals', hospitalId, 'logo', source)
  if (!url) return null
  const { error } = await supabase.from('hospitals').update({ logo_url: url }).eq('id', hospitalId)
  if (error) throw new Error(error.message)
  return url
}

/**
 * The patient's own profile picture. Same pick-and-upload as the doctor photo,
 * but it only touches users.avatar_url -- a patient has no doctors row.
 */
export async function pickAndUploadAvatar(source: 'library' | 'camera' = 'library'): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Please sign in again.')

  const url = await pickAndUpload('avatars', user.id, 'avatar', source)
  if (!url) return null

  const { error } = await supabase.from('users').update({ avatar_url: url }).eq('auth_id', user.id)
  if (error) throw new Error(error.message)
  return url
}
