// Monorepo Metro config. Without this, Metro only watches this app's folder and
// resolves modules from its own node_modules -- so every @queue/shared import fails,
// and edits to the shared package do not trigger a reload.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch the whole workspace so packages/shared is part of the build graph.
config.watchFolders = [workspaceRoot]

// Resolve from the app first, then the hoisted workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// npm workspaces hoists most packages to the root, but react and react-native must
// resolve to exactly one copy or you get "Invalid hook call" / duplicate-native-module
// errors that look nothing like a resolution problem.
config.resolver.disableHierarchicalLookup = true

// Expo's metro-config hardcodes `resolver.useWatchman = null` (ExpoMetroConfig.js),
// and metro-file-map reads it as `useWatchman ?? false` -- so `null` becomes false and
// Watchman is never used, even when installed. Forcing it back to true lets the Windows
// native watcher (ReadDirectoryChangesW) replace the recursive Node crawl below.
config.resolver.useWatchman = true

// Keep the file crawl off everything Metro will never bundle. watchFolders above
// is the whole workspace (needed for packages/shared), which otherwise drags in
// the legacy mobile/ and doctors/ copies, the Next.js app and its .next output,
// .git, and the audit/docs/supabase trees.
//
// This list is also the safety net for the no-Watchman path: without Watchman,
// metro-file-map falls back to a recursive Node crawl with a hardcoded 240s
// start-up timeout (MAX_WAIT_TIME in @expo/metro-file-map/build/Watcher.js), and
// this workspace is ~46k directories on Windows. Once the crawl overruns it the
// watcher rejects with "Failed to start watch mode", the dependency graph is
// never built, and every bundle request 500s with "Cannot read properties of
// undefined (reading 'get')" -- while the HTML shell and /status still answer
// 200, so the dev server looks healthy and the app renders blank white.
const IGNORED_AT_ROOT = ['mobile', 'doctors', 'audit', 'docs', 'patches', 'supabase', '.git']

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const underRoot = (...segments) =>
  new RegExp('^' + escapeRe(path.join(workspaceRoot, ...segments)) + escapeRe(path.sep) + '.*')

config.resolver.blockList = [
  ...IGNORED_AT_ROOT.map((d) => underRoot(d)),
  underRoot('web', '.next'),
  underRoot('web', 'node_modules'),
]

module.exports = config
