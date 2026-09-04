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
