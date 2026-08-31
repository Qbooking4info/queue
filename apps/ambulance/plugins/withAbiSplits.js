const { withAppBuildGradle } = require('expo/config-plugins')

// The default release APK is a single "universal" file bundling native code
// for all 4 CPU architectures (arm64-v8a, armeabi-v7a, x86, x86_64) at once --
// ~365MB pre-trim, ~263MB after trimming unused Agora extensions -- even
// though any one real device only ever uses ONE of those four. This is
// exactly what installing via the Play Store's App Bundle mechanism avoids
// automatically; since we're sideloading APKs directly for testing (not
// going through the Play Store), Gradle's ABI splits give the same result:
// one APK per architecture, each only carrying the native code that
// architecture needs. universalApk stays true so the old single-file
// fallback is still produced alongside the smaller per-ABI ones, in case
// it's needed for a device/emulator whose architecture isn't in the list.
module.exports = function withAbiSplits(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') return config
    if (config.modResults.contents.includes('splits {')) return config

    const splitsBlock = `    splits {
        abi {
            enable true
            reset()
            include 'armeabi-v7a', 'arm64-v8a', 'x86', 'x86_64'
            universalApk true
        }
    }
`
    config.modResults.contents = config.modResults.contents.replace(
      /android\s*\{/,
      `android {\n${splitsBlock}`,
    )
    return config
  })
}
