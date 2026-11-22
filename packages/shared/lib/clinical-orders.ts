/**
 * Prescriptions, test orders and their results.
 *
 * Three tables behind one small module (20261121000005, 20261121000006),
 * because every screen that touches one touches the others: a consultation
 * writes drugs and tests together, and the patient reads tests and results
 * together.
 *
 * All reads and writes go through the authenticated client, so RLS decides
 * what comes back: a patient sees their own, the treating doctor sees the
 * ones on their own appointments, hospital staff see their hospital's.
 */
import { supabase } from './supabase'

export interface Prescription {
  id: string
  appointment_id: string
  drug_name: string
  dose: string | null
  frequency: string | null
  duration_days: number | null
  quantity: number | null
  instructions: string | null
  status: 'prescribed' | 'dispensed' | 'cancelled'
  dispensed_at: string | null
  created_at: string
}

export interface TestOrder {
  id: string
  appointment_id: string
  test_name: string
  specimen: string | null
  instructions: string | null
  urgency: 'routine' | 'urgent' | 'stat'
  status: 'ordered' | 'collected' | 'resulted' | 'cancelled'
  collected_at: string | null
  created_at: string
}

export interface LabResult {
  id: string
  test_order_id: string
  analyte: string
  value_text: string | null
  value_numeric: number | null
  unit: string | null
  reference_range: string | null
  flag: 'normal' | 'low' | 'high' | 'critical' | 'indeterminate'
  note: string | null
  document_url: string | null
  reported_at: string
}

/** The scope a new order inherits from the consultation it is written at. */
export interface OrderScope {
  appointmentId: string
  patientId: string | null
  hospitalId: string | null
  doctorId: string | null
}

const PRESCRIPTION_COLS =
  'id, appointment_id, drug_name, dose, frequency, duration_days, quantity, instructions, status, dispensed_at, created_at'
const TEST_ORDER_COLS =
  'id, appointment_id, test_name, specimen, instructions, urgency, status, collected_at, created_at'
const RESULT_COLS =
  'id, test_order_id, analyte, value_text, value_numeric, unit, reference_range, flag, note, document_url, reported_at'

export async function getPrescriptions(appointmentId: string): Promise<Prescription[]> {
  const { data } = await supabase.from('prescriptions')
    .select(PRESCRIPTION_COLS).eq('appointment_id', appointmentId).order('created_at')
  return (data as Prescription[] | null) ?? []
}

export async function getTestOrders(appointmentId: string): Promise<TestOrder[]> {
  const { data } = await supabase.from('test_orders')
    .select(TEST_ORDER_COLS).eq('appointment_id', appointmentId).order('created_at')
  return (data as TestOrder[] | null) ?? []
}

/** Every test this patient has had ordered, newest first — the patient app's
 *  results list. RLS scopes it to them (and their linked dependents). */
export async function getMyTestOrders(limit = 50): Promise<TestOrder[]> {
  const { data } = await supabase.from('test_orders')
    .select(TEST_ORDER_COLS).order('created_at', { ascending: false }).limit(limit)
  return (data as TestOrder[] | null) ?? []
}

export async function getMyPrescriptions(limit = 50): Promise<Prescription[]> {
  const { data } = await supabase.from('prescriptions')
    .select(PRESCRIPTION_COLS).order('created_at', { ascending: false }).limit(limit)
  return (data as Prescription[] | null) ?? []
}

/** Results for a set of orders, grouped by order id. */
export async function getResultsFor(orderIds: string[]): Promise<Record<string, LabResult[]>> {
  if (orderIds.length === 0) return {}
  const { data } = await supabase.from('lab_results')
    .select(RESULT_COLS).in('test_order_id', orderIds).order('reported_at', { ascending: false })
  const out: Record<string, LabResult[]> = {}
  for (const r of (data as LabResult[] | null) ?? []) {
    (out[r.test_order_id] ??= []).push(r)
  }
  return out
}

export async function addPrescription(scope: OrderScope, input: {
  drugName: string
  dose?: string
  frequency?: string
  durationDays?: number | null
  quantity?: number | null
  instructions?: string
}): Promise<string | null> {
  const { error } = await supabase.from('prescriptions').insert({
    appointment_id: scope.appointmentId,
    patient_id:     scope.patientId,
    hospital_id:    scope.hospitalId,
    doctor_id:      scope.doctorId,
    drug_name:      input.drugName.trim(),
    dose:           input.dose?.trim() || null,
    frequency:      input.frequency?.trim() || null,
    duration_days:  input.durationDays ?? null,
    quantity:       input.quantity ?? null,
    instructions:   input.instructions?.trim() || null,
  } as never)
  return error?.message ?? null
}

export async function addTestOrder(scope: OrderScope, input: {
  testName: string
  specimen?: string
  instructions?: string
  urgency?: 'routine' | 'urgent' | 'stat'
}): Promise<string | null> {
  const { error } = await supabase.from('test_orders').insert({
    appointment_id: scope.appointmentId,
    patient_id:     scope.patientId,
    hospital_id:    scope.hospitalId,
    doctor_id:      scope.doctorId,
    test_name:      input.testName.trim(),
    specimen:       input.specimen?.trim() || null,
    instructions:   input.instructions?.trim() || null,
    urgency:        input.urgency ?? 'routine',
  } as never)
  return error?.message ?? null
}

export async function cancelPrescription(id: string): Promise<string | null> {
  const { error } = await supabase.from('prescriptions')
    .update({ status: 'cancelled' } as never).eq('id', id)
  return error?.message ?? null
}

export async function cancelTestOrder(id: string): Promise<string | null> {
  const { error } = await supabase.from('test_orders')
    .update({ status: 'cancelled' } as never).eq('id', id)
  return error?.message ?? null
}

/** How a prescription reads on one line: "Aspirin 75 mg · once daily · 30 days". */
export function prescriptionLine(p: Prescription): string {
  return [p.dose, p.frequency, p.duration_days ? `${p.duration_days} days` : null]
    .filter(Boolean).join(' · ')
}

/** A result's colour, by flag. Never derived from value_numeric against
 *  reference_range on the client -- parsing "3.5-5.0" is how a patient gets
 *  told they are fine when they are not. */
export function flagTone(flag: LabResult['flag']): 'red' | 'amber' | 'green' | 'neutral' {
  if (flag === 'critical') return 'red'
  if (flag === 'high' || flag === 'low') return 'amber'
  if (flag === 'normal') return 'green'
  return 'neutral'
}
