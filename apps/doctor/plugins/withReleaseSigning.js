const { withAppBuildGradle } = require('expo/config-plugins')

/**
 * The Expo/RN template signs RELEASE builds with the debug keystore -- the one
 * committed at android/app/debug.keystore, whose password is the publicly known
 * 'android' / 'androiddebugkey'. Anyone can therefore sign a build that a device
 * accepts as a genuine update to com.qbooking.mobile.
 *
 * EAS Build is unaffected either way: this project uses EAS remote credentials
 * (no credentialsSource in eas.json, no credentials.json), and EAS injects its own
 * signing configuration at build time. The exposure is purely local
 * `./gradlew assembleRelease` output, which is exactly what gets sideloaded to
 * testers -- and what looked like a normal release APK earlier in this work.
 *
 * With this plugin, a release build uses a real keystore when one is configured via
 * gradle properties (put them in ~/.gradle/gradle.properties, NOT in the repo):
 *
 *   QUEUE_RELEASE_STORE_FILE=/absolute/path/to/queue-release.keystore
 *   QUEUE_RELEASE_STORE_PASSWORD=...
 *   QUEUE_RELEASE_KEY_ALIAS=...
 *   QUEUE_RELEASE_KEY_PASSWORD=...
 *
 * Without them it still falls back to the debug key so local testing keeps working,
 * but the build now says so loudly instead of producing something that looks
 * distributable and is not.
 */
const BEGIN = '        // @generated begin withReleaseSigning'
const END = '        // @generated end withReleaseSigning'

const SIGNING_CONFIG = `        release {
            if (project.hasProperty('QUEUE_RELEASE_STORE_FILE')) {
                storeFile file(project.property('QUEUE_RELEASE_STORE_FILE'))
                storePassword project.property('QUEUE_RELEASE_STORE_PASSWORD')
                keyAlias project.property('QUEUE_RELEASE_KEY_ALIAS')
                keyPassword project.property('QUEUE_RELEASE_KEY_PASSWORD')
            }
        }
`

const RELEASE_SIGNING = `${BEGIN}
            if (project.hasProperty('QUEUE_RELEASE_STORE_FILE')) {
                signingConfig signingConfigs.release
            } else {
                logger.warn('WARNING: signing this RELEASE build with the DEBUG keystore ' +
                    '(publicly known password). Fine for local testing -- do NOT distribute ' +
                    'this APK. Set QUEUE_RELEASE_STORE_FILE and friends in ~/.gradle/gradle.properties ' +
                    'to sign properly. EAS builds are unaffected and use EAS-managed credentials.')
                signingConfig signingConfigs.debug
            }
${END}`

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: expected a Groovy app/build.gradle')
    }
    let contents = cfg.modResults.contents

    if (contents.includes(BEGIN)) return cfg

    // 1. Add a `release` signingConfig next to the template's `debug` one.
    const debugConfig = /(signingConfigs \{\n(?:.*\n)*?        \}\n)(    \})/
    if (!debugConfig.test(contents)) {
      throw new Error('withReleaseSigning: could not find the signingConfigs block')
    }
    contents = contents.replace(debugConfig, `$1${SIGNING_CONFIG}$2`)

    // 2. Swap the release buildType's hardcoded debug signingConfig for the
    //    conditional one. Anchor on the template's own caution comment so we
    //    cannot accidentally match the debug buildType's identical line.
    const releaseSigning =
      /            \/\/ Caution! In production, you need to generate your own keystore file\.\n            \/\/ see https:\/\/reactnative\.dev\/docs\/signed-apk-android\.\n            signingConfig signingConfigs\.debug/
    if (!releaseSigning.test(contents)) {
      throw new Error('withReleaseSigning: could not find the release signingConfig line')
    }
    contents = contents.replace(releaseSigning, RELEASE_SIGNING)

    cfg.modResults.contents = contents
    return cfg
  })
}
