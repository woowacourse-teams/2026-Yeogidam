module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // 테스트마다 끝에 renderTracked로 그린 렌더러를 내립니다. 그 밖의 정리는 각 테스트 파일이 맡습니다.
  setupFilesAfterEnv: ['<rootDir>/__tests__/support/unmountTrackedAfterEach.ts'],
  // __tests__/support에는 여러 테스트가 함께 쓰는 픽스처와 도우미만 두므로 테스트로 돌리지 않습니다.
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/__tests__/support/'],
  // Sentry's React Native package ships ESM, so Jest must transform it
  // instead of applying its default node_modules ignore rule.
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|@sentry)/)',
  ],
};
