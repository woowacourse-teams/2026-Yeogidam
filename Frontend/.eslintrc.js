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
              'components/AppModal을 사용하세요. 뒤로가기 제스처 처리와 입력 모달의 키보드 회피(avoidKeyboard)를 함께 맞춥니다.',
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // 테스트는 렌더된 Modal을 찾기 위해 import합니다.
      files: ['src/components/AppModal.tsx', '__tests__/**'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
};
