// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getDefaultConfig } = require('expo/metro-config')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withNativeWind } = require('nativewind/metro')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path')

const projectRoot = __dirname
const monorepoRoot = path.resolve(projectRoot, '../..')

// Inject mobile's node_modules into NODE_PATH so that hoisted packages like
// babel-preset-expo can still resolve 'expo/config' from within worker processes.
const mobileModules = path.resolve(projectRoot, 'node_modules')
process.env.NODE_PATH = mobileModules + (process.env.NODE_PATH ? path.delimiter + process.env.NODE_PATH : '')
// eslint-disable-next-line @typescript-eslint/no-var-requires
require('module').Module._initPaths()

const config = getDefaultConfig(projectRoot)

// Watch shared packages (hot-reload) + root node_modules (so Metro can serve
// hoisted packages like @babel/runtime). We do NOT watch the entire monorepoRoot
// to avoid Metro indexing gigabytes of files and running out of memory on Windows.
config.watchFolders = [
  path.resolve(monorepoRoot, 'packages'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// Resolution search paths — must match watchFolders so Metro can both find AND serve.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// Force Metro to always resolve these packages from a single location,
// preventing duplicate React / React Native renderer version mismatches.
config.resolver.extraNodeModules = {
  'react': path.resolve(monorepoRoot, 'node_modules', 'react'),
  'react-native': path.resolve(monorepoRoot, 'node_modules', 'react-native'),
  'react-native-css-interop': path.resolve(projectRoot, 'node_modules', 'react-native-css-interop'),
}

// Block nested react / react-native copies inside other packages.
config.resolver.blockList = [
  /node_modules\/.*\/node_modules\/react-native\/.*/,
]

// Use the expo-bundled babel transformer so @babel/core and babel-preset-expo
// resolve from mobile's node_modules, not the monorepo root.
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('@expo/metro-config/build/babel-transformer'),
}

module.exports = withNativeWind(config, { input: './global.css' })
