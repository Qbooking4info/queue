// Explicit column lists for unauthenticated hospital directory endpoints.
// A previous `select('*')` on doctors returned email, auth_user_id and
// mdcn_number to anyone: the login-email half of every staff credential,
// the internal auth UID, and the doctor id needed to call get_doctor_queue.
// hospitals('*') similarly returned the admin contact email and regulatory
// identifiers. Keep this list to fields the public directory / mobile
// booking flow actually renders.
const DOCTOR_PUBLIC = 'id, full_name, title, qualification, bio, avatar_url, ' +
  'years_experience, consultation_fee, virtual_fee, accepts_virtual, ' +
  'avg_rating, review_count, availability_status, clinic_id, ' +
  'specialty:specialties!doctors_specialty_id_fkey(name, icon)'

const HOSPITAL_PUBLIC = 'id, name, slug, address, city, state, country, phone, whatsapp, ' +
  'type, description, logo_url, cover_url, latitude, longitude, ' +
  'accepts_virtual, emergency_hours, opd_fee, avg_rating, review_count, is_verified, ' +
  'is_24_hours, daily_booking_limit, approval_mode, requires_referral, clinic_model, ' +
  'bed_space_status, bed_space_updated_at'

export const HOSPITAL_SELECT =
  `${HOSPITAL_PUBLIC}, doctors(${DOCTOR_PUBLIC}), ` +
  `hospital_specialties(specialty:specialties!hospital_specialties_specialty_id_fkey(name, icon)), ` +
  `services(name, is_active)`

// The mobile app (in its Expo-web dev/test form) calls these routes cross-origin --
// e.g. the app on localhost:8081 fetching localhost:3000. Without this header the
// browser blocks the response entirely (a plain network failure to the caller, no
// error surfaced), even though the exact same request works fine from curl/Postman,
// which don't enforce CORS. Wildcard is safe here: no cookies/credentials are sent
// or read, and the data is already public/unauthenticated.
export const PUBLIC_CORS_HEADERS = { 'Access-Control-Allow-Origin': '*' }
