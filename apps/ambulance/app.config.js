/**
 * Expo config layered on top of app.json — the same shape as the client app's, and
 * for the same reason: app.json cannot read an environment variable, and the Android
 * Maps SDK key must not be committed.
 *
 * This app needs it because CrewHomeScreen renders JobPatientMap. react-native-maps
 * with no `provider` uses Google Maps on Android, which draws a grey grid rather than
 * a map unless a key is in AndroidManifest. When apps/provider was split into three,
 * only the client app had an app.config.js, so this app was built with no key at all
 * and its crew map could never have worked regardless of the Google Console settings.
 *
 * Deliberately NOT the server's GOOGLE_MAPS_API_KEY. A Google key carries exactly one
 * application restriction and these two need opposite ones: the server key is called
 * from Vercel and cannot be app-restricted; this one must be, to com.qbooking.ambulance
 * plus this app's own signing SHA-1 (its keystore differs from the client's).
 *
 * Set EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY as an EAS environment variable, not in
 * eas.json, which is committed.
 */
module.exports = ({ config }) => {
  const androidMapsKey =
    process.env.EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY || process.env.GOOGLE_MAPS_ANDROID_KEY

  if (!androidMapsKey) {
    // Loud on purpose: shipping without this produces maps that look broken rather
    // than maps that are obviously absent, which is hard to diagnose from a screenshot.
    console.warn(
      '[app.config] EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY is not set — the crew map will render empty.',
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
