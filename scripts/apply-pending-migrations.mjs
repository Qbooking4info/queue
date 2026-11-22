#!/usr/bin/env node
/**
 * Apply pending migrations to the Queue production database, one at a time,
 * and keep supabase_migrations.schema_migrations honest.
 *
 *   node scripts/apply-pending-migrations.mjs --dry-run     # print the plan
 *   node scripts/apply-pending-migrations.mjs --repair      # record the 28 hand-applied ones
 *   node scripts/apply-pending-migrations.mjs               # apply, in order
 *   node scripts/apply-pending-migrations.mjs 20261121000004  # just one
 *
 * WHY THIS EXISTS, AND WHY NOT `supabase db push`
 * -----------------------------------------------
 * The remote history table is missing 29 of this repo's migrations. Twenty
 * eight of those were applied by hand (verified 2026-11-21: every table,
 * function and column they create is present in production) and simply never
 * recorded. `supabase db push` reads that table, concludes all 29 are pending,
 * and re-runs them against a live database holding real patient records --
 * including CREATE TABLE and DROP/CREATE FUNCTION statements that would at
 * best fail noisily and at worst revert later hand-edits.
 *
 * So: never run `db push` against this project until the history is repaired.
 * Run this with --repair first, which records the 28 without executing them,
 * and then this script (or db push) is safe again.
 *
 * Each migration runs as one statement batch, which Postgres executes in a
 * single implicit transaction: a failure part-way rolls the whole file back.
 * The history row is only written after the SQL succeeds.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PROJECT_REF = 'qzodmkgyzguzzyovjpfx'
const MIGRATIONS = 'supabase/migrations'

// Verified present in production on 2026-11-21 but absent from the remote
// history table. --repair records these without running them.
const HAND_APPLIED = `
20260825000001 20260826000001 20260827000001 20260827000002 20260827000003
20260903000001 20260906000001 20260910000000 20260911000001 20260911000002
20260913000001 20260922000001 20260923000001 20260928000001 20261003000001
20261003000002 20261011000001 20261020000001 20261021000001 20261021000002
20261022000001 20261023000001 20261025000001 20261025000002 20261025000003
20261025000004 20261027000001 20261028000001
`.trim().split(/\s+/)

// Genuinely not applied, in the order they must run.
// 20261031000001..20261121000009 were applied 2026-11-21 and are recorded.
const PENDING = [
  '20261122000001', // arrival-window fallback, fee stamping, direct-booking order policies
]

const APPLIED_2026_11_21 = [
  '20261031000001', // queue fairness + return_to_queue (the API already calls it)
  '20261121000001', // get_doctor_queue: checked_in_at, requeued_at, patient_dob
  '20261121000002', // get_my_crew_runs
  '20261121000003', // appointments.end_time (arrival window)
  '20261121000004', // hospital_beds
  '20261121000005', // prescriptions + test_orders
  '20261121000006', // lab_results  (depends on test_orders)
  '20261121000007', // user_devices
  '20261121000008', // appointments.consultation_fee
  '20261121000009', // hospitals.allow_self_check_in + radius config
]
void APPLIED_2026_11_21

function token() {
  const env = readFileSync('web/.env.local', 'utf8')
  const line = env.split(/\r?\n/).find(l => l.startsWith('SUPABASE_ACCESS_TOKEN='))
  if (!line) throw new Error('SUPABASE_ACCESS_TOKEN missing from web/.env.local')
  return line.slice('SUPABASE_ACCESS_TOKEN='.length).trim()
}

function fileFor(version) {
  const name = readdirSync(MIGRATIONS).find(f => f.startsWith(version + '_'))
  if (!name) throw new Error(`No migration file for ${version}`)
  return { name, sql: readFileSync(join(MIGRATIONS, name), 'utf8') }
}

async function run(sql, tok) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${body.slice(0, 800)}`)
  return body
}

const q = s => `'${String(s).replace(/'/g, "''")}'`

async function record(version, name, tok) {
  await run(
    `insert into supabase_migrations.schema_migrations (version, name)
     values (${q(version)}, ${q(name.replace(/^\d+_/, '').replace(/\.sql$/, ''))})
     on conflict (version) do nothing`,
    tok,
  )
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const repair = args.includes('--repair')
const only = args.filter(a => /^\d{14}$/.test(a))

const plan = only.length ? only : repair ? HAND_APPLIED : PENDING

console.log(repair
  ? `Recording ${plan.length} already-applied migrations (no SQL will run).`
  : `Applying ${plan.length} migration(s) to ${PROJECT_REF} — PRODUCTION.`)
for (const v of plan) console.log('  ', fileFor(v).name)

if (dryRun) {
  console.log('\n--dry-run: nothing sent.')
  process.exit(0)
}

const tok = token()
for (const version of plan) {
  const { name, sql } = fileFor(version)
  process.stdout.write(`\n${name} … `)
  try {
    if (!repair) await run(sql, tok)
    await record(version, name, tok)
    console.log(repair ? 'recorded' : 'applied')
  } catch (err) {
    console.log('FAILED')
    console.error(String(err.message))
    console.error('\nStopped. Nothing after this point was applied, and this file was rolled back.')
    process.exit(1)
  }
}
console.log('\nDone. Run the verification block at the foot of each migration.')
