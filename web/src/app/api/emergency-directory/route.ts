import { NextRequest, NextResponse } from 'next/server'
import { requireRole } from '@/lib/supabase/auth-server'
import { createAdminClient } from '@/lib/supabase/admin'
import { Errors } from '@/lib/api-error'

/**
 * Emergency fallback directory admin. super_admin only — these numbers are
 * served to every patient in the app, so they are platform data, not per-hospital.
 *
 * The verification fields are the point of this endpoint. emergency_directory
 * requires last_verified_at and verified_by NOT NULL precisely so a row cannot
 * exist without someone stating they dialled it. A wrong number in an emergency
 * is worse than no number: the caller burns the seconds that mattered on a dead
 * line, having been told by us that it would work. So every write here demands a
 * verifier, and re-verification is a first-class action rather than an edit.
 */

const KINDS = ['national', 'state', 'hospital_ae', 'private_fleet']

function validate(b: Record<string, unknown>): string | null {
  if (typeof b.name !== 'string' || !b.name.trim()) return 'name is required'
  if (typeof b.phone !== 'string' || !b.phone.trim()) return 'phone is required'
  if (typeof b.kind !== 'string' || !KINDS.includes(b.kind)) return `kind must be one of ${KINDS.join(', ')}`
  if (typeof b.verified_by !== 'string' || !b.verified_by.trim()) {
    return 'verified_by is required — record who dialled this number'
  }
  return null
}

export async function GET(req: NextRequest) {
  const auth = await requireRole(['super_admin'], req)
  if (auth instanceof NextResponse) return auth

  const db = createAdminClient()
  const [{ data: rows }, { data: ttl }] = await Promise.all([
    db.from('emergency_directory').select('*').order('priority').order('name'),
    db.rpc('emergency_directory_ttl_days'),
  ])
  return NextResponse.json({
    entries: rows ?? [],
    ttlDays: typeof ttl === 'number' ? ttl : 90,
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireRole(['super_admin'], req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body) return Errors.validation('Body required')
  const bad = validate(body)
  if (bad) return Errors.validation(bad)

  const db = createAdminClient()
  const { data, error } = await db.from('emergency_directory').insert({
    name: (body.name as string).trim(),
    kind: body.kind as string,
    phone: (body.phone as string).trim(),
    alt_phone: typeof body.alt_phone === 'string' && body.alt_phone.trim() ? body.alt_phone.trim() : null,
    state: typeof body.state === 'string' && body.state.trim() ? body.state.trim() : null,
    city: typeof body.city === 'string' && body.city.trim() ? body.city.trim() : null,
    priority: Number.isInteger(body.priority) ? body.priority as number : 100,
    notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : null,
    // Set server-side from "I just dialled it", not accepted from the client:
    // a caller must not be able to backdate a verification.
    last_verified_at: new Date().toISOString(),
    verified_by: (body.verified_by as string).trim(),
    verification_note: typeof body.verification_note === 'string' ? body.verification_note.trim() || null : null,
  } as never).select('id').single()

  if (error) return Errors.internal(error.message)
  return NextResponse.json({ id: (data as { id: string }).id }, { status: 201 })
}

/**
 * PATCH — re-verify (someone dialled it again), toggle active, or edit fields.
 * Re-verification is deliberately its own action: an entry that rots is supposed
 * to disappear from the app, and only a fresh phone call should reset that clock.
 */
export async function PATCH(req: NextRequest) {
  const auth = await requireRole(['super_admin'], req)
  if (auth instanceof NextResponse) return auth

  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body?.id || typeof body.id !== 'string') return Errors.validation('id is required')

  const db = createAdminClient()
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.action === 'reverify') {
    if (typeof body.verified_by !== 'string' || !body.verified_by.trim()) {
      return Errors.validation('verified_by is required to re-verify')
    }
    updates.last_verified_at = new Date().toISOString()
    updates.verified_by = body.verified_by.trim()
    if (typeof body.verification_note === 'string') updates.verification_note = body.verification_note.trim() || null
  } else {
    const EDITABLE = ['name', 'kind', 'phone', 'alt_phone', 'state', 'city', 'priority', 'notes', 'is_active'] as const
    for (const k of EDITABLE) if (body[k] !== undefined) updates[k] = body[k]
    if (updates.kind !== undefined && !KINDS.includes(updates.kind as string)) {
      return Errors.validation('invalid kind')
    }
    if (Object.keys(updates).length === 1) return Errors.validation('No fields to update')
  }

  const { error } = await db.from('emergency_directory').update(updates as never).eq('id', body.id)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRole(['super_admin'], req)
  if (auth instanceof NextResponse) return auth

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return Errors.validation('id is required')

  const db = createAdminClient()
  const { error } = await db.from('emergency_directory').delete().eq('id', id)
  if (error) return Errors.internal(error.message)
  return NextResponse.json({ success: true })
}
