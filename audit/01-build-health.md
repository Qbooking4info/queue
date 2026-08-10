# Pass 1 — Build Health

All output below is verbatim terminal output, not summarised.

## web: typecheck
```
exit=0
```

## web: tests
```

 RUN  v4.1.10 /Users/apple/queue/web


 Test Files  8 passed (8)
      Tests  73 passed (73)
   Start at  00:10:16
   Duration  533ms (transform 659ms, setup 0ms, import 1.36s, tests 110ms, environment 2ms)

```
## web: lint
```
/Users/apple/queue/web/src/lib/notify-staff.ts
  53:37  error  Unexpected any. Specify a different type  @typescript-eslint/no-explicit-any

/Users/apple/queue/web/src/lib/useEmergencyAccess.ts
  19:26  error  Error: Calling setState synchronously within an effect can trigger cascading renders

Effects are intended to synchronize state between React and external systems such as manually updating the DOM, state management libraries, or other platform APIs. In general, the body of an effect should do one or both of the following:
* Update external systems with the latest state from React.
* Subscribe for updates from some external system, calling setState in a callback function when external state changes.

Calling setState synchronously within an effect body causes cascading renders that can hurt performance, and is not recommended. (https://react.dev/learn/you-might-not-need-an-effect).

/Users/apple/queue/web/src/lib/useEmergencyAccess.ts:19:26
  17 |
  18 |   useEffect(() => {
> 19 |     if (!hospital?.id) { setEmergencyCapable(false); setEmergencyClinicId(null); return }
     |                          ^^^^^^^^^^^^^^^^^^^ Avoid calling setState() directly within an effect
  20 |     if (hospital.clinic_model !== 'multi') {
  21 |       setEmergencyCapable(hospital.emergency_hours === true)
  22 |       setEmergencyClinicId(null)  react-hooks/set-state-in-effect
  30:37  error  Unexpected any. Specify a different type                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 @typescript-eslint/no-explicit-any

✖ 300 problems (272 errors, 28 warnings)
  1 error and 0 warnings potentially fixable with the `--fix` option.

```

## web: next build
```
├ ○ /dashboard/settings
├ ƒ /dashboard/specialist
├ ƒ /dashboard/specialist/[id]
├ ƒ /dashboard/staff
├ ○ /dashboard/staff/add
├ ○ /login
├ ○ /onboarding
├ ○ /register
├ ○ /reset-password
├ ○ /staff/accept
└ ○ /staff/register


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

```

## web: lint breakdown by rule
```
```

## mobile: typecheck
```
exit=0
```

## mobile: tests
```
      at _next (node_modules/@babel/runtime/helpers/asyncToGenerator.js:17:9)


Test Suites: 2 passed, 2 total
Tests:       32 passed, 32 total
Snapshots:   0 total
Time:        1.086 s
Ran all test suites.
```

## mobile: npx expo-doctor
```

✖ Check that packages match versions required by installed Expo SDK

❗ Major version mismatches
package               expected  found    
@types/jest           29.5.14   30.0.0   

⚠️ Minor version mismatches
package               expected  found    
react-native-screens  ~4.26.0   4.25.2   

🔧 Patch version mismatches
package               expected  found    
@expo/metro-runtime   ~56.0.19  56.0.17  
expo                  ~56.0.19  56.0.16  
expo-constants        ~56.0.23  56.0.21  
expo-location         ~56.0.23  56.0.21  
expo-notifications    ~56.0.23  56.0.21  
expo-updates          ~56.0.24  56.0.22  

Changelogs:
- expo-constants → https://github.com/expo/expo/blob/sdk-56/packages/expo-constants/CHANGELOG.md
- expo-location → https://github.com/expo/expo/blob/sdk-56/packages/expo-location/CHANGELOG.md
- expo-notifications → https://github.com/expo/expo/blob/sdk-56/packages/expo-notifications/CHANGELOG.md
- expo-updates → https://github.com/expo/expo/blob/sdk-56/packages/expo-updates/CHANGELOG.md

8 packages out of date.
Advice:
Use 'npx expo install --check' to review and upgrade your dependencies.
To ignore specific packages, add them to "expo.install.exclude" in package.json. Learn more: https://expo.fyi/dependency-validation

2 checks failed, indicating possible issues with the project.
```

---

## Findings

### 1-A · MEDIUM — `react-hooks/set-state-in-effect` × 29
`web/src/app/dashboard/appointments/page.tsx:622` and 28 others.
Calling `setState` synchronously inside an effect body causes a second render
pass on every mount. On the appointments page (1200+ lines, realtime
subscription) that is a visible double-render on every navigation.
**Fix:** derive during render, or move into the event/subscription callback.
**Effort:** ~90 min across all sites; ~10 min for the appointments page alone.

### 1-B · LOW — `@typescript-eslint/no-explicit-any` × 210
Pervasive, e.g. `web/src/app/api/appointments/[id]/route.ts:39`.
Most are `(db as any)` casts working around generated Supabase types. Not a
runtime risk, but it disables the checking that would have caught the
`payments_method_check` defect found on 2026-08-10.
**Fix:** none mechanical; would need per-site typing.
**Effort:** multi-day. Not recommended as a single task.

### 1-C · LOW — `react-hooks/exhaustive-deps` × 13
Genuine stale-closure risk in effects that poll. See Pass 5.

### 1-D · MEDIUM — 8 Expo packages behind SDK 56 pins
`@types/jest` is a **major** mismatch (29 expected, 30 installed);
`react-native-screens` minor; `expo`, `expo-location`, `expo-notifications`,
`expo-updates`, `expo-constants`, `@expo/metro-runtime` patch.
`expo-location` matters most: background location shipped 2026-08-10 and a patch
gap there is exactly where platform bugs live.
**Fix:** `npx expo install --check`.
**Effort:** 15 min plus a device smoke test. NOT applied — a dependency bump
before an unattended build is not a mechanical change.

### Verdict
Typecheck clean both apps. 73 web tests, 32 mobile tests, all pass.
`next build` compiles. Nothing blocks a deploy. Lint is noisy but the only
category with runtime consequence is `set-state-in-effect`.
