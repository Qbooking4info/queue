const { withGradleProperties } = require('expo/config-plugins')

/**
 * The Expo template ships org.gradle.jvmargs=-Xmx2048m. That is not enough once
 * withAbiSplits is enabled: :app:packageRelease packages armeabi-v7a, arm64-v8a,
 * x86, x86_64 AND the universal APK, in parallel ForkJoinPool workers, with
 * uncompressed native libs (expo.useLegacyPackaging=false). On a clean build that
 * reliably dies with:
 *
 *   Exception in thread "ForkJoinPool.commonPool-worker-13"
 *   java.lang.OutOfMemoryError: Java heap space
 *   > Task :app:packageRelease FAILED
 *
 * and it fails *after* emitting the first couple of per-ABI APKs, so the output
 * directory looks partially healthy and the failure is easy to misread as success.
 *
 * 6g is chosen to leave headroom on a 32 GB machine. Metaspace is raised alongside
 * it because R8 (enableMinifyInReleaseBuilds) loads a large class universe.
 */
const HEAP = '-Xmx6144m -XX:MaxMetaspaceSize=1024m'

// EX_DEV_CLIENT_NETWORK_INSPECTOR is deliberately NOT set here. expo-build-properties
// owns that property and rewrites it from its own default on every prebuild, so setting
// it in this plugin is silently overwritten -- use its `android.networkInspector` option
// in app.json instead.
const PROPERTIES = {
  'org.gradle.jvmargs': HEAP,
}

module.exports = function withGradleHeap(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(PROPERTIES)) {
      const existing = cfg.modResults.find(
        (item) => item.type === 'property' && item.key === key,
      )
      if (existing) {
        existing.value = value
      } else {
        cfg.modResults.push({ type: 'property', key, value })
      }
    }
    return cfg
  })
}
