/**
 * The stated data-protection terms, in one place so the app, the export file and
 * any future policy page cannot drift apart.
 *
 * NDPR asks for a stated retention period and demonstrable consent. Both are
 * version-stamped: when the wording changes, bump POLICY_VERSION so consent to the
 * new version is a separate, re-askable record rather than being silently inherited
 * from the old one.
 */

/** Bump on any material change to the wording below. */
export const POLICY_VERSION = '2026-10-03'

export const CONSENT_KIND = {
  privacy: 'privacy_policy',
  terms:   'terms_of_service',
} as const

/**
 * Retention periods.
 *
 * The clinical figure is the binding one and is deliberately long: a hospital's
 * duty to retain a medical record outlives a patient's wish to be forgotten, so
 * deleting an account anonymises the person rather than destroying the record.
 */
export const RETENTION = {
  /** Clinical records, kept under the treating hospital's own obligation. */
  clinicalYears: 7,
  /** Identity and contact details, removed at account deletion. */
  identity: 'Removed when you delete your account',
  /** Operational logs (location pings, delivery receipts). */
  operationalDays: 90,
} as const

export const RETENTION_SUMMARY = [
  {
    title: 'Your identity and contact details',
    body: 'Name, email, phone, date of birth and address. Removed when you delete your account.',
  },
  {
    title: 'Your medical records',
    body: `Appointments, diagnoses, prescriptions and vitals are kept for ${RETENTION.clinicalYears} years by the hospital that treated you, as health records law requires. Deleting your account removes your name from them; it does not erase the clinical record itself.`,
  },
  {
    title: 'Operational data',
    body: `Ambulance location pings and notification delivery records are kept for ${RETENTION.operationalDays} days, then discarded.`,
  },
  {
    title: 'What we never do',
    body: 'We do not sell your data, and we do not share anything that identifies you outside the hospital treating you without your consent.',
  },
] as const

/** Shown at signup, beside the consent control. */
export const CONSENT_STATEMENT =
  'I agree to the Privacy Policy and Terms of Service, and I consent to Queue storing my health information so hospitals I book with can provide care.'
