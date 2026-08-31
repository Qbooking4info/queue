#!/bin/zsh
# Submits EAS cloud builds for all four apps once the Expo free-tier Android quota
# resets. Written 2026-08-31, when the quota was exhausted and reported "resets in
# 7 hours (Tue Sep 01)". Sleeps past that boundary, then submits with --no-wait so
# all four queue at once rather than serialising behind each other.
#
# Run detached:  nohup ./scripts/queue-cloud-builds.sh >/dev/null 2>&1 &
# Results land in scripts/cloud-builds.log, one build page URL per app.

set -u
LOG=/Users/apple/queue/scripts/cloud-builds.log
WAIT_UNTIL=${1:-27000}   # seconds; default 7h30m

echo "=== queued at $(date) — sleeping ${WAIT_UNTIL}s until quota reset ===" >>"$LOG"
sleep "$WAIT_UNTIL"
echo "=== waking at $(date) — submitting builds ===" >>"$LOG"

for app in client doctor hospital ambulance; do
  echo "--- $app ---" >>"$LOG"
  cd "/Users/apple/queue/apps/$app" || { echo "  missing app dir" >>"$LOG"; continue; }
  npx eas-cli build --platform android --profile preview \
      --non-interactive --no-wait 2>&1 \
    | grep -E "See logs:|Error|used its Android builds" >>"$LOG"
done

echo "=== done at $(date) ===" >>"$LOG"
