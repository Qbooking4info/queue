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

module.exports = function withGradleHeap(config) {
  return withGradleProperties(config, (cfg) => {
    const existing = cfg.modResults.find(
      (item) => item.type === 'property' && item.key === 'org.gradle.jvmargs',
    )
    if (existing) {
      existing.value = HEAP
    } else {
      cfg.modResults.push({ type: 'property', key: 'org.gradle.jvmargs', value: HEAP })
    }
    return cfg
  })
}
