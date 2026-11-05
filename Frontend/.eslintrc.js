module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'react-native',
            importNames: ['Modal'],
            message:
              '키보드에 가려지지 않도록 components/KeyboardAvoidingModal을 사용하세요.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // 테스트는 렌더된 Modal을 찾기 위해 import합니다.
      files: ['src/components/KeyboardAvoidingModal.tsx', '__tests__/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
};
