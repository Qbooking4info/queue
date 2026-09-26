import type { DoctorDisplayStatus } from './admin-api'

// The one place this renders on web -- was four independent hand-rolled
// copies (dashboard/doctors/page.tsx, dashboard/page.tsx, plus two more on
// the mobile side in packages/shared), none of which had an 'inactive'
// state at all. 'inactive' covers both a genuinely deactivated doctor and
// one who's active but currently at a different hospital in a multi-hospital
// setup -- staff only ever need to know "not available here right now"
// either way. Only on_duty may be assigned a patient.
export const DOCTOR_STATUS_META: Record<DoctorDisplayStatus, { label: string; dot: string; bg: string; text: string; border: string }> = {
  on_duty:  { label: 'Active · On Duty',   dot: '#22c55e', bg: 'rgba(34,197,94,0.12)',   text: '#16a34a', border: 'rgba(34,197,94,0.3)' },
  on_break: { label: 'Active · On Break',  dot: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  text: '#d97706', border: 'rgba(245,158,11,0.3)' },
  off_duty: { label: 'Active · Off Duty',  dot: '#94a3b8', bg: 'rgba(148,163,184,0.12)', text: '#64748b', border: 'rgba(148,163,184,0.3)' },
  inactive: { label: 'Inactive',           dot: '#71717a', bg: 'rgba(113,113,122,0.12)', text: '#52525b', border: 'rgba(113,113,122,0.3)' },
}
