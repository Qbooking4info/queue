const { withProjectBuildGradle } = require('expo/config-plugins')

// expo-updates depends on org.bouncycastle:bcutil-jdk15to18:1.81, whose own
// published POM declares its own bcprov-jdk15to18 dependency as a dynamic
// range ([1.81,1.82)) rather than a fixed version. Resolving a dynamic range
// requires Gradle to "list versions" across every declared repository
// (unlike a fixed version, where the first repo that has the file wins) --
// and the project's repo list includes jitpack.io, which has been
// consistently timing out on that specific lookup (confirmed: 4 identical
// EAS build failures in a row, including one with --clear-cache, while the
// exact same artifact resolves instantly from Maven Central directly).
// Forcing a single concrete version already inside that range sidesteps the
// dynamic lookup entirely -- Gradle just fetches the one known file.
module.exports = function withBouncyCastlePin(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') return config
    const marker = "resolutionStrategy.force 'org.bouncycastle:bcprov-jdk15to18:1.81'"
    if (config.modResults.contents.includes(marker)) return config

    config.modResults.contents = config.modResults.contents.replace(
      /allprojects\s*\{/,
      `allprojects {\n    configurations.all {\n        resolutionStrategy {\n            ${marker}\n        }\n    }`,
    )
    return config
  })
}
