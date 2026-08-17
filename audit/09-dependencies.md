# Pass 9 — Dependencies

---

## 9-A · MEDIUM — `next@16.2.6` sits inside a middleware-bypass advisory

**`web/package.json`** declares `"next": "16.2.6"`; installed version confirmed
`16.2.6`.

`npm audit` reports it as the only **direct** high-severity dependency:

```
high  next  direct=True
      Next.js: Middleware / Proxy bypass in App Router applications
      range: 9.3.4-canary.0 - 16.3.0-preview.10
```

16.2.6 is inside that range.

**Why this is MEDIUM and not HIGH here:** the advisory matters when middleware is
what enforces authorization. In this app it is not.

`web/src/proxy.ts:1-30` is the only middleware. It reads the Supabase auth
cookie and checks it parses as JSON (`:16-24`) — a *shape* check to decide
redirects, not an authorization decision. The real guard is server-side:
`web/src/lib/getHospitalContext.ts:9` calls `redirect('/login')` when
`supabase.auth.getUser()` returns nothing, and every dashboard page goes through
it. Verified live — `GET /dashboard` unauthenticated returns **307**, and that
redirect originates from the page, not the proxy.

So a middleware bypass would let a request reach the page, where the server
component would then reject it. Defence does not depend on the vulnerable layer.

**Concrete fix:** upgrade to a patched Next release.
**Effort:** 30 min plus a full regression pass on the dashboard.
**NOT APPLIED** — a framework major-version bump is not a mechanical change and
cannot be verified unattended.

## 9-B · LOW — 6 transitive high-severity advisories, all build-time

`brace-expansion`, `fast-uri`, `js-yaml`, `nanoid`, `postcss`, `sharp` — all
`direct=False`. The failure modes are DoS-by-crafted-input in tooling
(`js-yaml` merge keys, `brace-expansion` expansion, `nanoid` size handling) and
`sharp`/libvips CVEs in image processing.

None is reachable from a request path in this app: there is no user-supplied
YAML, and `sharp` is a Next build dependency rather than a runtime image handler
here.

**Concrete fix:** `npm audit fix` for those resolvable without a major bump.
**Effort:** 15 min plus a build check.
**NOT APPLIED** — Pass 10 is mechanical fixes only; a lockfile change that alters
the build output is not that.

## 9-C · MEDIUM — TypeScript major-version skew between the two apps

```
typescript      web=^5          mobile=~6.0.3    <-- major mismatch
react           web=19.2.4      mobile=19.2.3
react-dom       web=19.2.4      mobile=^19.2.3
@types/react    web=^19         mobile=~19.2.2
```

**What breaks in plain terms:** the two apps typecheck under different compilers.
`web/src/types/database.ts` and `mobile/types/database.ts` are generated from the
same schema by `scripts/gen-types.sh` and are meant to be identical, but are
validated by TS 5 on one side and TS 6 on the other. A construct accepted by one
and rejected by the other only surfaces when someone edits the shared generator —
and it surfaces in whichever app they were not working in.

React patch skew is cosmetic by comparison.

**Concrete fix:** align on one TypeScript major.
**Effort:** 30 min plus fixing whatever the stricter compiler surfaces.
**NOT APPLIED** — a compiler upgrade will surface new type errors; that needs
someone awake.

## 9-D · MEDIUM — 8 Expo packages behind their SDK 56 pins

Reported by `npx expo-doctor` in Pass 1. `@types/jest` is a major mismatch
(29 expected, 30 installed); `expo`, `expo-location`, `expo-notifications`,
`expo-updates`, `expo-constants`, `@expo/metro-runtime` are patch;
`react-native-screens` minor.

`expo-location` is the one to care about — background location shipped
2026-08-10 and a patch gap there is exactly where platform-specific bugs live.

`npm audit` on mobile reports 27 advisories (17 high, 10 moderate), but they are
overwhelmingly `@expo/*` build tooling — `@expo/cli`, `@expo/metro`,
`@expo/config-plugins`, `@expo/ngrok` — none of which ships in the APK.

**Concrete fix:** `npx expo install --check`.
**Effort:** 15 min plus a device smoke test.
**NOT APPLIED** — same reasoning as Pass 1.

---

## Summary

| severity | count |
|---|---|
| MEDIUM | 3 |
| LOW | 1 |

Nothing here is exploitable in the running app today. The Next advisory would be
serious in an app that gates authorization in middleware; this one does not, and
I verified that rather than assuming it. The skew items are maintenance debt that
will bite during a future upgrade rather than now.
