#!/usr/bin/env bash
#
# Verify a Supabase service_role key rotation actually took effect.
#
# Rotating in the dashboard is not the same as the leaked key being dead — the
# old key stays valid until it is revoked/disabled, and a half-done rotation
# (new key issued, old one never revoked) looks identical from the outside.
# This checks the thing that matters: the OLD key must be REJECTED.
#
# Usage, from the repo root, after rotating and updating web/.env.local:
#
#     ./scripts/verify-key-rotation.sh <path-to-old-key-file>
#
# The old key was saved outside the repo during the incident. If you no longer
# have it, recover it from git history (it is in PROJECT_SOURCE.md before the
# untracking commit) — do not paste it into a file inside the repo.

set -uo pipefail

OLD_KEY_FILE="${1:-}"
if [ -z "$OLD_KEY_FILE" ] || [ ! -f "$OLD_KEY_FILE" ]; then
  echo "usage: $0 <path-to-file-containing-the-OLD-service_role-key>" >&2
  exit 2
fi

cd "$(dirname "$0")/.." || exit 1

URL=$(grep -m1 '^EXPO_PUBLIC_SUPABASE_URL' mobile/.env | cut -d= -f2- | tr -d '\r')
NEW=$(grep -m1 '^SUPABASE_SERVICE_ROLE_KEY' web/.env.local | cut -d= -f2- | tr -d '\r')
ANON=$(grep -m1 '^EXPO_PUBLIC_SUPABASE_ANON_KEY' mobile/.env | cut -d= -f2- | tr -d '\r')
OLD=$(tr -d '\r\n' < "$OLD_KEY_FILE")

if [ -z "$URL" ] || [ -z "$NEW" ]; then
  echo "could not read URL or SUPABASE_SERVICE_ROLE_KEY from env files" >&2
  exit 2
fi

probe() { # $1=key  -> prints HTTP status
  curl -s -m 20 -o /dev/null -w '%{http_code}' \
    "$URL/rest/v1/users?select=id&limit=1" \
    -H "apikey: $1" -H "Authorization: Bearer $1"
}

fail=0
echo "project: ${URL#https://}"
echo

# 1. The rotation actually happened.
if [ "$NEW" = "$OLD" ]; then
  echo "  [FAIL] web/.env.local still holds the OLD key — nothing was rotated"
  fail=1
else
  echo "  [ ok ] local env holds a different key than the leaked one"
fi

# 2. The new key works, or the app is down.
code=$(probe "$NEW")
if [ "$code" = "200" ]; then
  echo "  [ ok ] new key authenticates (HTTP 200)"
else
  echo "  [FAIL] new key rejected (HTTP $code) — production will be broken"
  fail=1
fi

# 3. The whole point: the leaked key must be dead.
code=$(probe "$OLD")
if [ "$code" = "401" ] || [ "$code" = "403" ]; then
  echo "  [ ok ] OLD leaked key is REJECTED (HTTP $code) — exposure closed"
elif [ "$code" = "200" ]; then
  echo "  [FAIL] OLD leaked key STILL WORKS (HTTP 200)"
  echo "         A new key was issued but the old one was never revoked."
  echo "         Anyone who read the public repo still has full access to PHI."
  fail=1
else
  echo "  [WARN] OLD key returned HTTP $code — inconclusive, check manually"
  fail=1
fi

# 4. Legacy anon status.
#
# Probing users/ was ambiguous and reported a false [ok]: anon legitimately gets
# 401 there under RLS, and a DISABLED key returns 401 too — indistinguishable.
# hospitals is readable by anon by design, so it separates "key works" from
# "key is dead" unambiguously.
if [ -n "$ANON" ]; then
  body=$(curl -s -m 20 "$URL/rest/v1/hospitals?select=id&limit=1" \
           -H "apikey: $ANON" -H "Authorization: Bearer $ANON")
  case "$body" in
    *"Legacy API keys are disabled"*)
      echo "  [ ok ] legacy anon key is DISABLED — the leaked key's signing path is dead"
      echo "         (any build still shipping the legacy anon key will not work)" ;;
    \[*)
      echo "  [WARN] legacy anon key STILL WORKS — legacy keys are not disabled yet."
      echo "         The leaked service_role key shares their signing secret."
      fail=1 ;;
    *)
      echo "  [WARN] legacy anon probe inconclusive: $(printf '%s' "$body" | head -c 80)" ;;
  esac
fi

echo
if [ "$fail" -eq 0 ]; then
  echo "Rotation verified. Next: check Supabase API logs for unattributed bulk reads"
  echo "of users / appointments / patient_medical_history between 2026-07-26 and today."
else
  echo "Rotation NOT complete — see failures above."
fi
exit "$fail"
