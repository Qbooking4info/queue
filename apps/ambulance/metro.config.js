// Monorepo Metro config. Without this, Metro only watches this app's folder and
// resolves modules from its own node_modules -- so every @queue/shared import fails,
// and edits to the shared package do not trigger a reload.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

// Watch only what is actually in the build graph: this app (implicit via
// projectRoot), the shared package, and the hoisted root node_modules.
//
// Watching the whole workspace root additionally crawled web/ -- 800MB of its
// own node_modules that no mobile app imports -- plus .git and supabase/. On a
// machine without watchman that pushed Metro's watcher past its 240s startup
// deadline, so it failed with 'Failed to start watch mode' and sat holding the
// port without ever serving a bundle.
config.watchFolders = [
  path.resolve(workspaceRoot, 'packages'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// Resolve from the app first, then the hoisted workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]

// npm workspaces hoists most packages to the root, but react and react-native must
// resolve to exactly one copy or you get "Invalid hook call" / duplicate-native-module
// errors that look nothing like a resolution problem.
config.resolver.disableHierarchicalLookup = true

module.exports = config
