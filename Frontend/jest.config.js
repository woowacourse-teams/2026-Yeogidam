module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // __tests__/support에는 여러 테스트가 함께 쓰는 픽스처와 도우미만 두므로 테스트로 돌리지 않습니다.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/support/'],
  // Sentry's React Native package ships ESM, so Jest must transform it
  // instead of applying its default node_modules ignore rule.
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|@sentry)/)',
  ],
};
