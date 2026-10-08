module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Sentry's React Native package ships ESM, so Jest must transform it
  // instead of applying its default node_modules ignore rule.
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|@sentry)/)',
  ],
};
