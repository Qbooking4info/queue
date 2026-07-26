#!/usr/bin/env bash
# Task 13: single source-of-truth generation for the Supabase database types.
#
# web/src/types/database.ts and mobile/types/database.ts were previously
# ~2,280 lines each, hand-copy-pasted after running `supabase gen types`
# separately for each app -- they had already drifted (web had extra
# HospitalClinic/ClinicAdmin aliases mobile didn't, mobile had an
# UserInsurance alias web didn't).
#
# This script runs `supabase gen types typescript` exactly ONCE and writes
# the identical generated schema into both files, then re-appends each
# app's own small "convenience row types" section (kept separately per app
# since the two apps genuinely use different subsets of tables) from
# scripts/database-types-tail/{web,mobile}.ts.
#
# Usage: scripts/gen-types.sh [--check]
#   --check   don't write files; exit non-zero if regenerating would change
#             either committed file (for CI).

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

CHECK_ONLY=false
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
fi

TMP_GENERATED="$(mktemp)"
trap 'rm -f "$TMP_GENERATED"' EXIT

supabase gen types typescript --linked > "$TMP_GENERATED"

for app in web mobile; do
  TAIL_FILE="scripts/database-types-tail/${app}.ts"
  TARGET="${app}/$([ "$app" = web ] && echo src/types/database.ts || echo types/database.ts)"
  TMP_OUT="$(mktemp)"
  cat "$TMP_GENERATED" "$TAIL_FILE" > "$TMP_OUT"

  if [[ "$CHECK_ONLY" == true ]]; then
    if ! diff -q "$TMP_OUT" "$TARGET" > /dev/null 2>&1; then
      echo "[gen-types] $TARGET is out of date -- run scripts/gen-types.sh"
      rm -f "$TMP_OUT"
      exit 1
    fi
  else
    mv "$TMP_OUT" "$TARGET"
    echo "[gen-types] wrote $TARGET"
  fi
done

if [[ "$CHECK_ONLY" == true ]]; then
  echo "[gen-types] up to date"
fi
