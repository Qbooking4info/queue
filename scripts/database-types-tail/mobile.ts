// ── Convenience row types ────────────────────────────────────────────────────
// Named `TableRow` (not `Tables`) to avoid colliding with the generated
// `Tables<>` helper type above.

type TableRow<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']

export type User               = TableRow<'users'>
export type Hospital           = TableRow<'hospitals'>
export type HospitalAdmin      = TableRow<'hospital_admins'>
export type Specialty          = TableRow<'specialties'>
export type Service            = TableRow<'services'>
export type Doctor             = TableRow<'doctors'>
export type TimeSlot           = TableRow<'time_slots'>
export type Appointment        = TableRow<'appointments'>
export type Payment            = TableRow<'payments'>
export type Review             = TableRow<'reviews'>
export type SubscriptionPlan   = TableRow<'subscription_plans'>
export type HospitalSubscription = TableRow<'hospital_subscriptions'>
export type UserInsurance        = TableRow<'user_insurance'>
