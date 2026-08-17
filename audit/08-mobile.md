# Pass 8 — Mobile

Permissions declared vs used, deep links, offline behaviour, token storage,
bundle size.

---

## 8-A · PASS — Session tokens are in SecureStore, not AsyncStorage

**`mobile/lib/supabase.ts:3,22-50`**

Supabase auth uses a `SecureStoreAdapter` backed by `expo-secure-store`
(Keychain on iOS, Keystore on Android). `:19-21` documents why it chunks:
session tokens can exceed the 2 KB iOS keychain item limit, so values are split
across `${key}.${i}` entries with a `__chunks__N` marker.

Only two things touch AsyncStorage, and neither is sensitive:
`mobile/lib/emergency-directory.ts:52` (cached public emergency numbers) and
`mobile/contexts/ThemeContext.tsx:79` (light/dark preference).

This is the correct split. No credential is in unencrypted storage.

## 8-B · PASS — Every declared Android permission is used

All 8 permissions in `mobile/app.json` map to real code:
`CAMERA` and `RECORD_AUDIO` (video consultation, 2–3 files),
`ACCESS_FINE_LOCATION` (18 files), `ACCESS_BACKGROUND_LOCATION` /
`FOREGROUND_SERVICE_LOCATION` (crew duty tracking, added 2026-08-10).

No over-declared permission, which matters for Play Store review — background
location in particular requires written justification.

---

## 8-C · MEDIUM — No deep-link scheme, and push notifications carry navigation data

**`mobile/app.json`** — `expo.scheme` is **absent** and no `intentFilters` are
declared. No `Linking.addEventListener` / `getInitialURL` handler exists in
`screens/`, `lib/` or `App.tsx`.

Meanwhile notifications are written with routing payloads —
`web/src/lib/notify-patient.ts:35` sends `{ appointment_id, booking_ref }` and
`web/src/lib/dispatch/engine.ts:250` sends `{ offer_id, request_id, ttl_seconds }`.

**What breaks in plain terms:** tapping a push notification opens the app at
whatever screen it was last on. A crew member tapping "New dispatch offer — you
have 30s to accept" lands on the home screen and has to navigate manually,
against a 30-second timer. The data needed to route them is already in the
payload and is discarded.

**Concrete fix:** add `"scheme": "queue"` to `app.json`, and a notification
response listener that routes on `data.request_id` / `data.appointment_id`.
**Effort:** 45 min plus a device test.
**NOT APPLIED** — requires a native rebuild and device verification, neither of
which can be done unattended.

## 8-D · MEDIUM — No network-state awareness anywhere

No `NetInfo` import, no `isConnected` check, no offline queue in any screen.
(The two grep hits are `crew-api.ts`, where "offline" is the ambulance *duty*
status, and a test file — not connectivity.)

**What breaks in plain terms:** every screen assumes the network works. On a
failed request the app shows an error or an empty state with no distinction
between "no data" and "no signal". The emergency fallback panel is the one place
this was handled deliberately — `mobile/lib/emergency-directory.ts:63-70` reads
its cache first specifically so it renders with no network — which shows the
pattern is understood but applied only where it was consciously designed for.

For an app whose emergency flow is used in poor-connectivity conditions, this is
worth more than its severity suggests.

**Concrete fix:** add `@react-native-community/netinfo`, surface a global
offline banner, and treat "offline" distinctly from "empty" in list screens.
**Effort:** 3–4 hours.
**NOT APPLIED** — new dependency plus UI behaviour changes.

## 8-E · LOW — Release APK is 362 MB

Measured on the 2026-08-10 local release build. That is very large for this app;
it is a universal APK carrying every ABI plus unstripped native libraries
(Agora, maps).

Not a defect — sideloaded testing works fine — but it will matter for Play
Store, where an App Bundle with per-ABI splits would cut it substantially.
**Concrete fix:** build `--profile production` as an `.aab`, enable ABI splits.
**Effort:** 20 min.

---

## Summary

| severity | count |
|---|---|
| MEDIUM | 2 |
| LOW | 1 |
| PASS | 2 |

Credential handling and permission hygiene are genuinely good. The two gaps are
both about the app's behaviour in the conditions it is most likely to be used
in: a notification you cannot act on quickly, and no distinction between "no
results" and "no signal".
