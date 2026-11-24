const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const {
  withSentryConfig
} = require("@sentry/react-native/metro");

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(__dirname);

const config = {
  transformer: {
    babelTransformerPath: require.resolve(
      'react-native-svg-transformer/react-native',
    ),
  },
  resolver: {
    assetExts: defaultConfig.resolver.assetExts.filter(ext => ext !== 'svg'),
    sourceExts: [...defaultConfig.resolver.sourceExts, 'svg'],
  },
};

module.exports = withSentryConfig(mergeConfig(defaultConfig, config), {
  // 웹 전용 세션 리플레이·피드백 위젯은 앱에서 쓰지 않으므로 번들에서 뺀다. (약 180KB)
  includeWebReplay: false,
  includeWebFeedback: false,
});