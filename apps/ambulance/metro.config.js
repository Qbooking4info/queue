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

module.exports = config
