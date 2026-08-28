// Display labels for the hospital vocabulary constrained by
// hospitals_type_check / hospitals_ownership_check (migration 20260828000003).
//
// Both dashboard call sites used to print the column value raw, which is how
// the two clients' disagreement became visible to users — one hospital read
// "General", another "specialist_center".

const TYPE_LABELS: Record<string, string> = {
  hospital:          'General Hospital',
  clinic:            'Clinic',
  specialist_center: 'Specialist Centre',
  diagnostic:        'Diagnostic Centre',
  teaching:          'Teaching Hospital',
  maternity:         'Maternity Centre',
}

const OWNERSHIP_LABELS: Record<string, string> = {
  private: 'Private',
  federal: 'Federal',
  state:   'State',
  mission: 'Mission',
  ngo:     'NGO',
}

/**
 * Human label for a hospital type. Falls back to the raw value for rows written
 * before the vocabulary was constrained, so nothing renders as blank.
 */
export function hospitalTypeLabel(type: string | null | undefined): string {
  if (!type) return '—'
  return TYPE_LABELS[type] ?? type
}

export function hospitalOwnershipLabel(ownership: string | null | undefined): string {
  if (!ownership) return '—'
  return OWNERSHIP_LABELS[ownership] ?? ownership
}
