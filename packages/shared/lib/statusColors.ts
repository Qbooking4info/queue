import type { Theme } from '../contexts/ThemeContext'

// Five screens (SpecialistQueueScreen, DoctorAppointmentsScreen, FrontDeskQueueScreen,
// AdminDashboardScreen, StaffAppointmentsScreen) each hand-rolled their own STATUS_META
// table of hardcoded hex literals for the same appointment-status vocabulary. Two bugs
// came from that: the colors never changed with the theme, so clinical (light) inherited
// values tuned for forest (dark) and fell under 3:1 against a white card; and the tables
// drifted apart -- AdminDashboardScreen's in_progress was blue while its four siblings
// used orange. Routing every screen through this one map fixes both at the source.
export function statusBadgeColors(t: Theme) {
  return {
    pending: t.statusBusy,
    pending_approval: t.statusApproval,
    confirmed: t.statusOpen,
    checked_in: t.statusVirtual,
    in_progress: t.statusProgress,
    completed: t.statusNeutral,
    cancelled: t.statusCancelled,
    no_show: t.statusNeutral,
  } as const
}

// Same fix, same reason, for the doctor-status badges that were independently
// hand-rolled in StaffManagementScreen.tsx and AdminDashboardScreen.tsx (and
// again on the web side). 'inactive' covers two cases staff should read
// identically: a doctor deactivated at this hospital, and one who's still
// active but currently at a DIFFERENT hospital in a multi-hospital setup --
// either way, not here right now. Only on_duty may be assigned a patient.
export const DOCTOR_STATUS_LABEL = {
  on_duty:  'Active · On Duty',
  on_break: 'Active · On Break',
  off_duty: 'Active · Off Duty',
  inactive: 'Inactive',
} as const

export function doctorStatusColors(t: Theme) {
  return {
    on_duty: t.statusOpen,
    on_break: t.statusBusy,
    off_duty: t.statusNeutral,
    inactive: t.statusCancelled,
  } as const
}
