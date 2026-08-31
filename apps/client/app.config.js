/**
 * Expo config, layered on top of app.json.
 *
 * app.json stays the source of truth for everything static; Expo reads it first
 * and hands it to this function as `config`. This file exists for the one thing
 * app.json cannot do — read an environment variable.
 *
 * WHY THAT MATTERS HERE. react-native-maps with no `provider` prop uses Apple
 * Maps on iOS (no key, works) and Google Maps on Android, which renders nothing
 * but a grey grid unless a Maps SDK key is baked into AndroidManifest. Nothing
 * in this project ever set one, so every map on Android — hospitals, ambulance
 * tracking, the pre-booking rig map, the crew's patient map — has been an empty
 * box.
 *
 * The key must not be committed. It ships inside the APK and is trivially
 * extractable, so it is restricted at Google's end to this app's package and
 * signing certificate rather than kept secret — but a repo is still the wrong
 * place for it, and hardcoding it in app.json would put it there permanently.
 *
 * This is deliberately NOT the same key as the server's GOOGLE_MAPS_API_KEY.
 * A Google key carries exactly one application restriction, and these two need
 * opposite ones: the server key is called from Vercel functions and cannot be
 * app-restricted, this one must be.
 *
 * Set EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY in mobile/.env for local builds. EAS
 * builds read it from the EAS environment variable of the same name (set on
 * both the preview and production environments) — deliberately not from
 * eas.json, which is committed. Absent, the config is left exactly as it was
 * and the maps degrade to the "map unavailable" state in HospitalsMap rather
 * than to a silent grey rectangle.
 *
 * WHY THE `EXPO_PUBLIC_` PREFIX. HospitalsMap has to know at runtime whether a
 * key was baked in. Two earlier attempts read that from config and both failed
 * on device, hiding maps that worked:
 *
 *   - `Constants.expoConfig.android.config.googleMaps.apiKey` — Expo strips
 *     android.config out of the runtime manifest entirely.
 *   - `Constants.expoConfig.extra.<flag>` — in a release build expoConfig comes
 *     from assets/app.manifest (the expo-updates manifest), which carries no
 *     `extra` block at all. Verified by unzipping the APK.
 *
 * An EXPO_PUBLIC_ variable is inlined into the JS bundle at build time, which
 * is the same mechanism the Supabase credentials already use here and is
 * demonstrably present in these builds. One variable, read identically by the
 * native config and the JS, so the two cannot disagree.
 */
module.exports = ({ config }) => {
  // Accepts the old unprefixed name too, so an EAS environment that still has
  // GOOGLE_MAPS_ANDROID_KEY keeps producing working native config — it just
  // won't light up the runtime check until the prefixed one is set.
  const androidMapsKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || process.env.GOOGLE_MAPS_ANDROID_KEY

  if (!androidMapsKey) {
    // Loud on purpose: a build that ships without this produces maps that look
    // broken rather than maps that are missing, and that is a hard thing to
    // diagnose from a screenshot.
    console.warn(
      '[app.config] EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY is not set — Android builds will render empty maps.',
    )
    return config
  }

  return {
    ...config,
    android: {
      ...config.android,
      config: {
        ...config.android?.config,
        googleMaps: { apiKey: androidMapsKey },
      },
    },
  }
}
