// Shared between HomeScreen's own greeting fallback and LiveQueueCard's ring
// overlay (rotating tips while waiting to be called in) -- kept in its own
// module rather than exported from HomeScreen to avoid a circular import
// between the screen and a component it renders.
export const WELLNESS_TIPS = [
  'Remember to stay hydrated today',
  'Your health is your wealth',
  'A check-up a day keeps worries away',
  'Taking care of yourself is a priority',
  'Small steps lead to great health',
  'Deep breaths can help ease pre-appointment nerves',
  'A short walk can help lower blood pressure',
  'Getting enough sleep supports your immune system',
]
