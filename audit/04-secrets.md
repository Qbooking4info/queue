# Pass 4 — Secrets and Configuration

No secret values appear anywhere in this file; keys are referred to by variable
name and, where identity matters, by a 6-character fingerprint of the trailing
characters only.

---

## Methodology note (a correction made mid-pass)

The first history scan searched for `sk_test_…`, `sb_secret_…` and
`SUPABASE_SERVICE_ROLE_KEY=ey…` and reported **zero hits across 252 commits**.
That was a false clean. The known 2026-07-26 incident committed a *legacy JWT*,
which matches none of those shapes. Re-running against the JWT header prefix and
decoding only the `role` claim found it immediately.

Recording this because an audit that reports "no secrets in history" on a repo
that demonstrably leaked one is worse than no audit. Any future scan must match
JWT shapes, not just provider-prefixed keys.

---

## 4-A · HIGH — Two credentials remain in git history on a public repo

**`PROJECT_SOURCE.md`** (removed from HEAD in commit `1e6fba1`, still in history)
**`mobile/app.json`**, **`mobile/eas.json`** (legacy anon key, removed later)

Commits still carrying them include `e6b6fa2`, `c5d7655`. Decoded role claims:

```
role=service_role   fingerprint …ABZOsY   <- bypasses RLS on every table
role=anon           fingerprint …NDVTig
```

Repository is **public** (`private=false`, 0 forks).

**What breaks in plain terms:** both keys are dead — legacy keys were disabled on
2026-08-10 and the service_role key now returns "Legacy API keys are disabled" —
so this is not a live exposure. It is a permanent record that anyone can still
read, and it is the reason the 2026-07-26 → 2026-08-10 window exists at all. The
residual risk is disclosure of the incident itself rather than of access.

**Concrete fix:** `git filter-repo` or BFG to purge `PROJECT_SOURCE.md` from
history, then force-push. This rewrites shared history and will break the other
contributor's clone, so it needs coordinating first.
**Effort:** 30 min plus coordination.
**NOT APPLIED** — force-pushing shared history unattended, with no one awake to
re-clone, is exactly the kind of irreversible action the rules exclude. Logged
under Open questions.

---

## 4-B · HIGH — GitHub secret scanning and push protection are still off

`gh api repos/Qbooking4info/queue --jq .security_and_analysis` returns empty.
Repository is public, so both features are free.

**What breaks in plain terms:** the control that would have blocked the
2026-07-26 push at the moment it happened is not enabled, so the same class of
incident can recur identically.

**Concrete fix:** Settings → Code security → enable Secret scanning and Push
protection.
**Effort:** 2 minutes.
**NOT APPLIED** — requires repo-admin rights the audit token does not have
(`403 Resource not accessible by personal access token`).

---

## 4-C · PASS — Nothing sensitive is shipped in the mobile bundle

Every `EXPO_PUBLIC_` variable referenced in `mobile/`:

| variable | contents | verdict |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | project URL | fine |
| `EXPO_PUBLIC_SUPABASE_PUBLIC_KEY` | `sb_publishable_…` | public by design, RLS enforced |
| `EXPO_PUBLIC_API_URL` | site URL | fine |
| `EXPO_PUBLIC_AGORA_APP_ID` | app id, not the certificate | fine |
| `EXPO_PUBLIC_SENTRY_DSN` | DSN | fine — write-only by design |

No `EXPO_PUBLIC_` variable holds a secret. Specifically checked and **absent**
from the mobile bundle: `AGORA_APP_CERTIFICATE`, `SUPABASE_SERVICE_ROLE_KEY`,
`PAYSTACK_SECRET_KEY`, `CRON_SECRET`.

`EXPO_PUBLIC_SUPABASE_ANON_KEY` (the legacy JWT) was removed from `mobile/.env`
and `eas.json` on 2026-08-10 and no longer appears at HEAD.

## 4-D · PASS — env handling and gitignore

`.env`, `.env.local`, `.env.*.local`, `web/.env.local` and `mobile/.env` are all
gitignored and **no env file is currently tracked**. `web/scripts/check-env-safety.mjs`
fails the build if any `NEXT_PUBLIC_*` variable name matches
`SERVICE|SECRET|PRIVATE|CERTIFICATE|ROLE_KEY`, which is a genuine guard, though
it checks names rather than value shapes.

---

## Summary

| severity | count |
|---|---|
| HIGH | 2 |
| PASS | 2 |

Nothing sensitive ships to clients today. Both HIGH findings are residue from
the July incident: the keys are dead but permanently public, and the control that
would prevent a repeat is still switched off.
