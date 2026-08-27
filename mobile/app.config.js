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
 * Set GOOGLE_MAPS_ANDROID_KEY in mobile/.env for local builds. EAS builds read
 * it from the EAS environment variable of the same name (set on both the
 * preview and production environments) — deliberately not from eas.json, which
 * is committed. Absent, the config is left exactly as it was and
 * the maps degrade to the "map unavailable" state in HospitalsMap rather than
 * to a silent grey rectangle.
 */
module.exports = ({ config }) => {
  const androidMapsKey = process.env.GOOGLE_MAPS_ANDROID_KEY

  if (!androidMapsKey) {
    // Loud on purpose: a build that ships without this produces maps that look
    // broken rather than maps that are missing, and that is a hard thing to
    // diagnose from a screenshot.
    console.warn(
      '[app.config] GOOGLE_MAPS_ANDROID_KEY is not set — Android builds will render empty maps.',
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
    extra: {
      ...config.extra,
      // Whether a Maps key was baked in, as a plain boolean the app can read
      // at runtime. `android.config` itself is NOT readable from
      // Constants.expoConfig — Expo strips it out of the manifest the app
      // ships with — so HospitalsMap checking it there always concluded "no
      // key" and hid the map even on builds that had one. Caught by running
      // the app: a correctly-keyed build still rendered the fallback.
      androidMapsKeyConfigured: true,
    },
  }
}
