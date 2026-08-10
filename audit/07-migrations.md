# Pass 7 — Migration Drift

Question: does `supabase/migrations/` reproduce the current schema from scratch,
or has production drifted?

---

## 7-A · PASS — The migration ledger is fully in sync

`supabase migration list --linked`:

```
total ledger entries:                     85
applied both sides:                       85
LOCAL ONLY (unapplied):                    0
REMOTE ONLY (applied by hand, no file):    0
```

No unapplied local migration, and no remote version stamp without a
corresponding file.

## 7-B · PASS — The known hand-applied drift was backfilled

`AUDIT-FINDINGS.md` (2026-07-26) recorded that policies on
`patient_medical_history` and `vitals_audit_log` existed in production but had
never been committed as migrations — applied directly through the dashboard SQL
editor.

`supabase/migrations/20260727000003_backfill_untracked_policies.sql:1-24` closes
this. Its header states the definitions were "read directly off the linked
production database (pg_policies) on 2026-07-27 and are copied verbatim, not
reconstructed", and it names the exact risk: the RLS test suite "currently
passes those tests only by luck of matching undocumented prod state".

Both tables now appear in tracked migrations (`patient_medical_history` in 1,
`vitals_audit_log` in 4).

---

## 7-C · MEDIUM — The ledger cannot detect the drift class it is being asked about

**HYPOTHESIS.** The check above proves every *migration* was applied. It does not
prove that no *object* exists in production without a migration — that is exactly
how the 2026-07-26 drift happened, and the ledger showed clean throughout.

Detecting it properly requires comparing `pg_policies`, `pg_proc`, `pg_indexes`
and `information_schema.columns` in production against the result of a
`supabase db reset` on a scratch database. I could not do that here:

- `supabase db reset` requires Docker, which is not running on this machine
- the Supabase Management API token is not retrievable (the CLI keychain entry
  holds a `go-keyring` placeholder, and `api.supabase.com` rejects it with
  "JWT could not be decoded")
- HARD RULE 1 forbids writes, and a scratch-database comparison would need one

**What I would need to open to confirm:** a `pg_policies` / `pg_proc` dump from
production, or Docker running so `supabase db reset` can build a comparison
schema locally.

**Concrete fix (process, not code):** add `supabase db diff --linked` to CI so
untracked objects surface automatically rather than at the next audit.
**Effort:** 20 min to wire into CI.

---

## 7-D · LOW — Runtime configuration lives in a table, not in migrations

`supabase/migrations/20260810000005_transport_sweep_scheduler.sql:30-40` creates
`app_config` deliberately empty and documents why: the sweep bearer token must
not be committed to a public repository. The two rows
(`transport_sweep_url`, `cron_secret`) were inserted out of band on 2026-08-10.

This is correct handling, but it means a `supabase db reset` produces a database
where `invoke_transport_sweep()` silently no-ops. The migration anticipates this
(`:56-60` returns early when unconfigured) so a fresh environment stays quiet
rather than erroring every 30 seconds.

Recorded so it is not mistaken for drift: **it is intentional, and the emptiness
is the point.**

---

## Summary

| severity | count |
|---|---|
| MEDIUM | 1 (hypothesis — could not be confirmed with the access available) |
| LOW | 1 |
| PASS | 2 |

The ledger is clean and the one historical instance of hand-applied drift was
found and backfilled. The open item is that nothing in the pipeline would catch
the next instance.
